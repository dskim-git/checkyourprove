// 계정 동기화 (firebase 모드, 로드맵 4-1). main.js가 firebase 모드일 때만 불러온다(그래서 Firebase SDK는 따로 나뉜 파일로 받는다).
//
// 흐름: 구글 로그인(팝업) → 서버 함수 bootstrap(사용자 문서·연구 번호·관리자 지정·역할 클레임) → 역할에 맞는 문서를 onSnapshot으로 구독
//   - 모두: 내 users/{uid}, 내 links/{uid}, settings/ethics, settings/signup
//   - 교사: users 모음 전체(연구 번호·역할·세션만, 실명 없음)
//   - 관리자: users, links(연결표), roster(명단), audit(관리 기록)
// 받은 값은 state/accountStore.js의 applyRemoteAccounts로 넣는다. 화면 코드는 지금처럼 동기 함수로 읽는다.
// 내 문서의 역할·상태가 토큰의 클레임과 다르면(관리자가 승인·역할 변경) 토큰을 새로 받고 구독을 다시 맞춘다.
// 공용 기기(학교 태블릿)를 생각해 로그아웃하면 이 기기의 Firestore 캐시를 지운다.

import { initializeApp } from 'firebase/app';
import {
  browserLocalPersistence, browserPopupRedirectResolver, GoogleAuthProvider, initializeAuth, onAuthStateChanged,
  signInWithPopup, signOut as fbSignOut,
} from 'firebase/auth';
import {
  clearIndexedDbPersistence, collection, doc, initializeFirestore, onSnapshot, persistentLocalCache, persistentMultipleTabManager, terminate,
} from 'firebase/firestore';
import { firebaseConfig } from './config.js';
import { applyRemoteAccounts, DEFAULT_ETHICS, setAccountBackend } from '../state/accountStore.js';
import { applyRemoteAudit, applyRemoteSignup, setAdminRemote } from '../state/adminStore.js';
import { flushNow, updateDataSync } from './dataSync.js';

const app = initializeApp(firebaseConfig);
const auth = initializeAuth(app, { persistence: browserLocalPersistence, popupRedirectResolver: browserPopupRedirectResolver });
const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });

// ── 받은 값 ──
let authUser = null;
let claimRole = null;
let selfUser = null;
let selfLink = null;
let allUsers = null; // 교사·관리자
let allLinks = null; // 관리자
let roster = [];
let ethics = {};
let unsubs = [];

const stopAll = () => {
  unsubs.forEach((u) => u());
  unsubs = [];
};

const linkOf = (uid) => (uid === authUser?.uid ? selfLink : allLinks?.get(uid)) ?? null;

function merged(uid, u) {
  const link = linkOf(uid);
  return {
    uid,
    email: link?.email ?? '',
    role: u.role,
    status: u.status,
    profile: link?.profile ?? (u.kind ? { kind: u.kind } : null),
    researchId: u.researchId,
    sessionIds: u.sessionIds ?? [],
    activeSessionId: u.activeSessionId ?? null,
    classId: u.classId ?? null,
    classKey: u.classKey ?? null,
    guardianConsent: link?.guardianConsent ?? null,
    createdAt: u.createdAt,
    submittedAt: u.submittedAt,
    approvedAt: u.approvedAt,
    approvedBy: u.approvedBy,
    autoApproved: u.autoApproved,
    unlinkedAt: u.unlinkedAt,
  };
}

/** 지금 받은 값으로 accountStore를 다시 채운다 */
function publish() {
  const map = new Map(allUsers ?? []);
  if (authUser && selfUser) map.set(authUser.uid, selfUser);
  applyRemoteAccounts({
    users: [...map].map(([uid, u]) => merged(uid, u)),
    currentUid: authUser && selfUser ? authUser.uid : null,
    roster,
    ethics: { ...DEFAULT_ETHICS, ...ethics },
  });
}

// ── 서버 함수 ──

function notifyError(message) {
  window.dispatchEvent(new window.CustomEvent('checkyourprove:remote-error', { detail: { message } }));
}

async function api(action, payload = {}, path = '/api/account') {
  if (!auth.currentUser) throw new Error('로그인이 필요해요.');
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await auth.currentUser.getIdToken()}` },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `서버 오류(${res.status})`);
  return data;
}

/** 화면에서 바꾼 값을 서버에 보낸다. 실패하면 마지막 서버 값으로 되돌리고 알린다 */
async function call(action, payload, path = '/api/account') {
  try {
    const data = await api(action, payload, path);
    if (data.claimsChanged) await refreshClaims(true);
    return data;
  } catch (error) {
    publish();
    notifyError(error.message);
    return null;
  }
}

// ── 구독 ──

async function refreshClaims(force) {
  const result = await auth.currentUser.getIdTokenResult(force);
  const role = result.claims.role ?? null;
  if (role !== claimRole) {
    claimRole = role;
    subscribe();
    syncData();
  }
}

/** 서버는 문서를 먼저 쓰고 클레임을 나중에 바꾸므로, 원하는 역할이 토큰에 들어올 때까지 몇 번 다시 받는다 */
let ensuring = null;
async function ensureClaims(want) {
  if (ensuring === want) return;
  ensuring = want;
  for (const wait of [0, 800, 2000, 5000]) {
    await new Promise((r) => setTimeout(r, wait));
    if (!auth.currentUser) break;
    await refreshClaims(true).catch(() => {});
    if (claimRole === want) break;
  }
  ensuring = null;
}

/** 학급·세션·기록 동기화(dataSync)를 지금 로그인·역할에 맞춘다. 승인 전(클레임 없음)에는 멈춘다 */
function syncData() {
  if (!authUser || !claimRole || !selfUser) return updateDataSync(null);
  return updateDataSync({
    app, db, uid: authUser.uid, role: claimRole, notify: notifyError,
    call: (path, action, payload) => call(action, payload, path),
    api: (path, action, payload) => api(action, payload, path),
  }, selfUser);
}

function subscribe() {
  stopAll();
  allUsers = null;
  allLinks = null;
  roster = [];
  const uid = authUser.uid;
  const onErr = (what) => (error) => console.warn(`[firestore] ${what}`, error.code ?? error);
  unsubs.push(onSnapshot(doc(db, 'users', uid), (snap) => {
    selfUser = snap.exists() ? snap.data() : null;
    // 관리자가 승인하거나 역할을 바꾸면 클레임이 바뀌었을 수 있다
    const want = selfUser?.status === 'approved' ? selfUser.role : null;
    if (want !== claimRole) ensureClaims(want);
    publish();
    syncData();
  }, onErr('users/self')));
  unsubs.push(onSnapshot(doc(db, 'links', uid), (snap) => {
    selfLink = snap.exists() ? snap.data() : null;
    publish();
  }, onErr('links/self')));
  unsubs.push(onSnapshot(doc(db, 'settings', 'ethics'), (snap) => {
    ethics = snap.exists() ? snap.data() : {};
    publish();
  }, onErr('settings/ethics')));
  unsubs.push(onSnapshot(doc(db, 'settings', 'signup'), (snap) => {
    if (snap.exists()) applyRemoteSignup(snap.data());
    publish();
  }, onErr('settings/signup')));
  if (claimRole === 'admin' || claimRole === 'teacher') {
    unsubs.push(onSnapshot(collection(db, 'users'), (snap) => {
      allUsers = new Map(snap.docs.map((d) => [d.id, d.data()]));
      publish();
    }, onErr('users')));
  }
  if (claimRole === 'admin') {
    unsubs.push(onSnapshot(collection(db, 'links'), (snap) => {
      allLinks = new Map(snap.docs.map((d) => [d.id, d.data()]));
      publish();
    }, onErr('links')));
    unsubs.push(onSnapshot(collection(db, 'roster'), (snap) => {
      roster = snap.docs.map((d) => d.data()).sort((a, b) => `${a.year}${a.studentNo}`.localeCompare(`${b.year}${b.studentNo}`));
      publish();
    }, onErr('roster')));
    unsubs.push(onSnapshot(collection(db, 'audit'), (snap) => {
      applyRemoteAudit(snap.docs.map((d) => d.data()));
      publish();
    }, onErr('audit')));
  } else {
    applyRemoteAudit(null);
  }
}

// ── 로그인·로그아웃 ──

// ── 로그인 기록(2026-11-28): 첫 로그인이 한 번에 안 되던 문제를 살피려고 단계별 시각을 콘솔에 남긴다 ──
let loginStartedAt = 0;
const trace = (step, extra = '') => {
  if (!loginStartedAt) return;
  console.info(`[로그인] ${step} +${Date.now() - loginStartedAt}ms ${extra}`);
};

/**
 * 구글 로그인 창이 결과를 앱에 돌려줄 때 쓰는 Firebase의 숨은 창(iframe)은 처음 로그인 버튼을 누를 때에야 열린다.
 * 그러면 첫 시도에서 계정을 골라도 결과가 앱에 늦게 닿아, SDK가 창이 닫힌 뒤 8초를 기다리다 "창이 닫힘"(popup-closed-by-user)으로
 * 끝낼 수 있다(두 번째는 숨은 창이 이미 준비되어 됨. 2026-11-28 사용자 보고). Firebase SDK는 휴대폰·Safari에서만 이 창을 미리
 * 준비하므로(_shouldInitProactively), 로그인하지 않은 첫 화면에서 모든 브라우저에 같은 준비 함수를 미리 부른다.
 * SDK 내부 함수라 없거나 실패해도 로그인은 지금처럼 된다(버튼을 누를 때 SDK가 다시 준비).
 */
let warmed = null;
function warmUpPopup() {
  warmed ??= Promise.resolve()
    .then(() => auth._popupRedirectResolver?._initialize?.(auth))
    .catch(() => null);
  return warmed;
}

async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  loginStartedAt = Date.now();
  trace('구글 창 열기');
  try {
    await signInWithPopup(auth, provider);
    trace('구글 창 끝남(로그인됨)');
  } catch (error) {
    trace('구글 창 끝남(실패)', error?.code ?? error?.message);
    throw error;
  }
}

async function signOutHere() {
  await flushNow().catch(() => {});
  updateDataSync(null);
  stopAll();
  await fbSignOut(auth);
  // 공용 기기: 이 기기에 남은 Firestore 캐시를 지운다
  try {
    await terminate(db);
    await clearIndexedDbPersistence(db);
  } catch {
    // 다른 탭이 쓰는 중이면 지우지 못한다. 새로 고침 뒤 로그인 전에는 읽을 수 없다(보안 규칙).
  }
  window.location.hash = '#/';
  window.location.reload();
}

/** 처음 로그인 상태가 정해질 때까지 기다린다(그 전에 화면을 그리면 로그인 전 화면이 잠깐 보인다) */
export function initAccountSync() {
  // 개발 서버에서만: 확인 도구가 서버에서 만든 로그인 토큰으로 들어간다(구글 팝업은 자동화할 수 없음). 배포 빌드에는 없다.
  if (import.meta.env.DEV) {
    window.__cypSignInWithToken = async (token) => {
      const { signInWithCustomToken } = await import('firebase/auth');
      return signInWithCustomToken(auth, token);
    };
  }
  setAccountBackend({
    call,
    signIn: signInWithGoogle,
    signOut: signOutHere,
    join: (code) => api('join', { code }, '/api/session').catch((error) => ({ error: error.message })),
  });
  setAdminRemote(call);
  return new Promise((resolve) => {
    let first = true;
    onAuthStateChanged(auth, async (user) => {
      authUser = user;
      selfUser = null;
      selfLink = null;
      claimRole = null;
      if (!user) {
        stopAll();
        updateDataSync(null);
        publish();
        warmUpPopup(); // 첫 화면에서 로그인 창의 숨은 창을 미리 준비
      } else {
        try {
          trace('로그인 상태 받음');
          const data = await api('bootstrap');
          trace('서버 계정 확인 끝남', data.claimsChanged ? '(역할 바뀜)' : '');
          const result = await user.getIdTokenResult(Boolean(data.claimsChanged));
          claimRole = result.claims.role ?? null;
          subscribe();
          // 첫 화면은 내 사용자 문서가 들어온 뒤에 그린다
          await new Promise((r) => {
            const t = setTimeout(r, 4000);
            const check = () => { if (selfUser) { clearTimeout(t); r(); } else setTimeout(check, 50); };
            check();
          });
          // 학급·세션·내 기록의 첫 값까지 기다린다(그 전에 그리면 빈 화면이 잠깐 보인다)
          await syncData();
        } catch (error) {
          notifyError(`계정 정보를 불러오지 못했어요: ${error.message}`);
          publish();
        }
      }
      if (first) {
        first = false;
        resolve();
      }
    });
  });
}
