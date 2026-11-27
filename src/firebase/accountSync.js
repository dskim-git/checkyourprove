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

async function api(action, payload = {}) {
  if (!auth.currentUser) throw new Error('로그인이 필요해요.');
  const res = await fetch('/api/account', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await auth.currentUser.getIdToken()}` },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `서버 오류(${res.status})`);
  return data;
}

/** 화면에서 바꾼 값을 서버에 보낸다. 실패하면 마지막 서버 값으로 되돌리고 알린다 */
async function call(action, payload) {
  try {
    const data = await api(action, payload);
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

async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  await signInWithPopup(auth, provider);
}

async function signOutHere() {
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
  setAccountBackend({ call, signIn: signInWithGoogle, signOut: signOutHere });
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
        publish();
      } else {
        try {
          const data = await api('bootstrap');
          const result = await user.getIdTokenResult(Boolean(data.claimsChanged));
          claimRole = result.claims.role ?? null;
          subscribe();
          // 첫 화면은 내 사용자 문서가 들어온 뒤에 그린다
          await new Promise((r) => {
            const t = setTimeout(r, 4000);
            const check = () => { if (selfUser) { clearTimeout(t); r(); } else setTimeout(check, 50); };
            check();
          });
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
