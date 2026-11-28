// 학급·세션·학생 연구 기록·연습 기록·관리자 설정 동기화 (firebase 모드, 로드맵 4-2). accountSync.js가 로그인·역할이 정해지면 부른다.
//
// 받기(onSnapshot·getDocs) → 저장소의 apply 함수 → 'checkyourprove:data' 이벤트(라우터가 목록 화면을 다시 그림)
//   교사: 담당 학급·세션(관리자는 모두), 그 세션들의 학생 기록(필기 포함)
//   모두: 세션 코드로 들어간 세션, 내 연구 기록(진행 중 세션과 들어간 세션), 내 연습 기록, 관리자 설정, 내 개인정보 요청(관리자는 모두)
// 쓰기: 연구 기록·연습 기록은 잠시 모았다가(1.2초) 바뀐 문서만 쓴다. 필기는 칸마다 ink 문서(JSON 글)로 나눠 1MB 제한을 피하고,
//   제출과 함께 쓸 때 보안 규칙에 막히지 않게 필기를 먼저, 기록 본문을 나중에 쓴다. 화면을 떠날 때(pagehide) 바로 쓴다.

import {
  collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, setDoc, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { applyRemoteSessions, applyStaff, getSessions, setSessionBackend } from '../state/sessionStore.js';
import {
  applyOwnRecord, applySessionRecords, getResearch, setResearchBackend,
} from '../state/researchStore.js';
import { applyRemoteAttempts, setAttemptBackend } from '../state/attemptStore.js';
import { applyRemoteAdminSettings, applyRemoteRequests } from '../state/adminStore.js';
import { startTeacherSync, stopTeacherSync, syncTeacherSessions } from './teacherSync.js';
import { startRecordingSync, stopRecordingSync } from './recordingSync.js';

let ctx = null; // { db, uid, role, call(path, action, payload), notify(message) }
let user = null; // 내 users 문서
let unsubs = [];
let sessionUnsubs = new Map(); // 학생: 들어간 세션 문서마다
let recordUnsubs = new Map(); // 교사: 세션의 학생 기록 모음마다
let staffClasses = new Map();
let staffSessions = new Map();
let memberSessions = new Map();
let key = '';
let ready = Promise.resolve();

const emit = () => window.dispatchEvent(new window.CustomEvent('checkyourprove:data'));
const fail = (what) => (error) => {
  console.warn(`[firestore] ${what}`, error?.code ?? error);
  if (error?.code === 'permission-denied') ctx?.notify(`${what}: 권한이 없어요.`);
};
const isStaff = () => ctx?.role === 'admin' || ctx?.role === 'teacher';

// ── 세션 ──

function activeIdFor(sessions) {
  // 반에 배정된 학생: 교사가 정한 반의 진행 회차(isCurrent)로 탐구한다
  if (!isStaff() && user?.classId) {
    const current = sessions.find((s) => s.classId === user.classId && s.isCurrent);
    if (current) return current.id;
  }
  const want = user?.activeSessionId;
  if (want && sessions.some((s) => s.id === want)) return want;
  // 진행 중 세션이 없으면: 학생은 마지막으로 들어간 세션, 교사는 첫 담당 세션
  const joined = (user?.sessionIds ?? []).filter((id) => sessions.some((s) => s.id === id));
  if (joined.length) return joined.at(-1);
  return sessions[0]?.id ?? null;
}

function publishSessions() {
  const map = new Map([...memberSessions, ...staffSessions]);
  const sessions = [...map].map(([id, s]) => ({ id, ...s })).sort((a, b) => String(a.className).localeCompare(String(b.className)) || a.round - b.round);
  const classes = [...staffClasses].map(([id, c]) => ({ id, ...c })).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const activeSessionId = activeIdFor(sessions);
  applyRemoteSessions({ classes, sessions, activeSessionId });
  // 진행 중 세션의 내 기록은 바로 불러 둔다
  if (activeSessionId) loadOwn(activeSessionId);
  if (isStaff()) {
    syncRecordListeners(sessions.map((s) => s.id));
    syncTeacherSessions(sessions.map((s) => s.id)); // 4-3: 채점·면담
  }
  emit();
}

function watchMemberSessions() {
  const want = new Set(user?.sessionIds ?? []);
  sessionUnsubs.forEach((u, id) => {
    if (!want.has(id)) {
      u();
      sessionUnsubs.delete(id);
      memberSessions.delete(id);
    }
  });
  want.forEach((id) => {
    if (sessionUnsubs.has(id)) return;
    sessionUnsubs.set(id, onSnapshot(doc(ctx.db, 'sessions', id), (snap) => {
      if (snap.exists()) memberSessions.set(id, snap.data());
      else memberSessions.delete(id);
      publishSessions();
    }, fail('세션')));
  });
}

// ── 내 연구 기록 ──

const ownLoading = new Map();
const lastWritten = new Map(); // 문서 경로 → 쓴 JSON (바뀐 것만 쓰려고)

async function loadOwn(sessionId) {
  if (!ctx || ownLoading.has(sessionId)) return ownLoading.get(sessionId);
  const p = (async () => {
    const base = `sessions/${sessionId}/records/${ctx.uid}`;
    try {
      const snap = await getDoc(doc(ctx.db, base));
      const record = snap.exists() ? snap.data() : null;
      if (record) {
        lastWritten.set(base, JSON.stringify(record));
        const inks = await getDocs(collection(ctx.db, base, 'ink'));
        inks.forEach((d) => {
          const k = d.data();
          lastWritten.set(`${base}/ink/${d.id}`, k.json);
          const item = record.stages?.[k.stage]?.items?.[k.problemId];
          if (item) {
            item.ink ??= {};
            item.ink[k.field] = JSON.parse(k.json);
          }
        });
      }
      applyOwnRecord(sessionId, record);
      emit();
    } catch (error) {
      ownLoading.delete(sessionId); // 다음에 다시
      fail('내 탐구 기록')(error);
    }
  })();
  ownLoading.set(sessionId, p);
  return p;
}

/** 기록을 본문과 필기로 나눈다: { main, inks: { [단계~명제~칸]: { stage, problemId, field, json } } } */
function splitRecord(record) {
  const main = JSON.parse(JSON.stringify(record)); // undefined 빼기
  const inks = {};
  Object.entries(main.stages ?? {}).forEach(([stage, st]) => {
    Object.entries(st.items ?? {}).forEach(([problemId, item]) => {
      Object.entries(item.ink ?? {}).forEach(([field, ink]) => {
        if (ink) inks[`${stage}~${problemId}~${field}`] = { stage, problemId, field, json: JSON.stringify(ink) };
      });
      if (item.ink) item.ink = {};
    });
  });
  return { main, inks };
}

const dirtyRecords = new Set();
const dirtyAttempts = new Map();
let timer = null;
const schedule = () => {
  clearTimeout(timer);
  timer = setTimeout(flush, 1200);
};

async function flushRecord(sessionId) {
  const base = `sessions/${sessionId}/records/${ctx.uid}`;
  const { main, inks } = splitRecord(getResearch(sessionId));
  const batch = writeBatch(ctx.db);
  let n = 0;
  Object.entries(inks).forEach(([id, v]) => {
    const path = `${base}/ink/${id}`;
    if (lastWritten.get(path) === v.json) return;
    batch.set(doc(ctx.db, path), v);
    lastWritten.set(path, v.json);
    n += 1;
  });
  if (n) await batch.commit(); // 필기 먼저(제출과 함께 쓸 때 규칙에 막히지 않게)
  const text = JSON.stringify(main);
  if (lastWritten.get(base) !== text) {
    await setDoc(doc(ctx.db, base), main);
    lastWritten.set(base, text);
  }
}

async function flush() {
  clearTimeout(timer);
  if (!ctx) return;
  const records = [...dirtyRecords];
  dirtyRecords.clear();
  const attempts = [...dirtyAttempts];
  dirtyAttempts.clear();
  for (const sessionId of records) {
    try {
      await flushRecord(sessionId);
    } catch (error) {
      lastWritten.delete(`sessions/${sessionId}/records/${ctx.uid}`);
      ctx.notify(error?.code === 'permission-denied' ? '탐구 기록을 저장하지 못했어요(제출했거나 닫힌 단계일 수 있어요).' : '탐구 기록을 저장하지 못했어요. 인터넷 연결을 확인해 주세요.');
    }
  }
  for (const [k, attempt] of attempts) {
    try {
      await setDoc(doc(ctx.db, 'practice', ctx.uid, 'attempts', k), JSON.parse(JSON.stringify(attempt)));
    } catch {
      ctx.notify('연습 기록을 저장하지 못했어요. 인터넷 연결을 확인해 주세요.');
    }
  }
}

// ── 교사: 담당 세션의 학생 기록 ──

const othersBySession = new Map();

async function assemble(sessionId, uid, data) {
  const record = JSON.parse(JSON.stringify(data));
  const inks = await getDocs(collection(ctx.db, 'sessions', sessionId, 'records', uid, 'ink'));
  inks.forEach((d) => {
    const k = d.data();
    const item = record.stages?.[k.stage]?.items?.[k.problemId];
    if (item) {
      item.ink ??= {};
      item.ink[k.field] = JSON.parse(k.json);
    }
  });
  return record;
}

function syncRecordListeners(sessionIds) {
  const want = new Set(sessionIds.filter((id) => !id.startsWith('pending-')));
  recordUnsubs.forEach((u, id) => {
    if (!want.has(id)) {
      u();
      recordUnsubs.delete(id);
      othersBySession.delete(id);
    }
  });
  want.forEach((sessionId) => {
    if (recordUnsubs.has(sessionId)) return;
    othersBySession.set(sessionId, new Map());
    recordUnsubs.set(sessionId, onSnapshot(collection(ctx.db, 'sessions', sessionId, 'records'), async (snap) => {
      const map = othersBySession.get(sessionId);
      await Promise.all(snap.docChanges().map(async (ch) => {
        if (ch.type === 'removed') map.delete(ch.doc.id);
        else map.set(ch.doc.id, await assemble(sessionId, ch.doc.id, ch.doc.data()));
      }));
      applySessionRecords(sessionId, new Map(map));
      emit();
    }, fail('학생 기록')));
  });
}

// ── 시작·갱신 ──

function stop() {
  stopTeacherSync();
  stopRecordingSync();
  unsubs.forEach((u) => u());
  unsubs = [];
  sessionUnsubs.forEach((u) => u());
  sessionUnsubs = new Map();
  recordUnsubs.forEach((u) => u());
  recordUnsubs = new Map();
  staffClasses = new Map();
  staffSessions = new Map();
  memberSessions = new Map();
}

function connectBackends() {
  setSessionBackend({
    call: (action, payload) => ctx?.call('/api/session', action, payload).then((r) => { if (!r) publishSessions(); return r; }),
    // 읽기만 하는 요청: 실패해도 학급·세션을 되돌리지 않고 화면이 오류를 보여 준다
    fetch: (action, payload) => (ctx ? ctx.api('/api/session', action, payload).catch((error) => ({ error: error.message })) : Promise.resolve({ error: '로그인이 필요해요.' })),
    updateSession: (id, patch) => updateDoc(doc(ctx.db, 'sessions', id), patch).catch((error) => {
      publishSessions();
      fail('세션 설정')(error);
    }),
    setActive: (id) => {
      if (user) user.activeSessionId = id;
      updateDoc(doc(ctx.db, 'users', ctx.uid), { activeSessionId: id }).catch(fail('진행 중 세션'));
      loadOwn(id);
    },
  });
  setResearchBackend({
    loadOwn: (id) => { loadOwn(id); },
    saveOwn: (id) => {
      dirtyRecords.add(id);
      schedule();
    },
  });
  setAttemptBackend({
    saveAttempt: (k, attempt) => {
      dirtyAttempts.set(k, attempt);
      schedule();
    },
    clear: (keys) => keys.forEach((k) => deleteDoc(doc(ctx.db, 'practice', ctx.uid, 'attempts', k)).catch(fail('연습 기록 지우기'))),
  });
}

/**
 * 로그인·역할·내 사용자 문서가 바뀔 때마다 accountSync가 부른다. 처음 부를 때는 첫 값이 들어올 때까지 기다리는 약속을 돌려준다.
 * @param {{ db, uid, role, call, api, notify } | null} next  null이면 멈춘다(로그아웃)
 * @param {object} selfUser 내 users 문서
 */
export function updateDataSync(next, selfUser) {
  if (!next) {
    stop();
    ctx = null;
    key = '';
    return Promise.resolve();
  }
  ctx = next;
  user = selfUser ? { ...selfUser } : null;
  const k = `${next.uid}|${next.role}`;
  if (k === key) {
    // 같은 사람·역할: 들어간 세션 목록과 진행 중 세션만 맞춘다
    watchMemberSessions();
    publishSessions();
    return ready; // 처음 값이 아직 오는 중이면 그것을 기다린다
  }
  stop();
  key = k;
  connectBackends();
  const db = ctx.db;
  // 4-3: 연구 도구·설문·동의서(모두), 보기 설정·채점·면담(교사)
  const first = [...startTeacherSync({ db, uid: ctx.uid, role: ctx.role, call: ctx.call, notify: ctx.notify, emit })];
  if (isStaff() && ctx.app) startRecordingSync({ app: ctx.app, db, uid: ctx.uid }); // 4-4: 면담 녹음 Storage

  // 관리자 설정, 개인정보 요청
  first.push(new Promise((resolve) => {
    unsubs.push(onSnapshot(doc(db, 'settings', 'admin'), (snap) => {
      applyRemoteAdminSettings(snap.exists() ? snap.data() : {});
      emit();
      resolve();
    }, (e) => { fail('관리자 설정')(e); resolve(); }));
  }));
  const reqQuery = ctx.role === 'admin' ? collection(db, 'requests') : query(collection(db, 'requests'), where('uid', '==', ctx.uid));
  unsubs.push(onSnapshot(reqQuery, (snap) => {
    applyRemoteRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    emit();
  }, fail('개인정보 요청')));

  // 연습 기록
  first.push(getDocs(collection(db, 'practice', ctx.uid, 'attempts')).then((snap) => {
    applyRemoteAttempts(Object.fromEntries(snap.docs.map((d) => [d.id, d.data()])));
    emit();
  }).catch(fail('연습 기록')));

  // 학급·세션
  if (isStaff()) {
    const classQ = ctx.role === 'admin' ? collection(db, 'classes') : query(collection(db, 'classes'), where('teacherUids', 'array-contains', ctx.uid));
    const sessQ = ctx.role === 'admin' ? collection(db, 'sessions') : query(collection(db, 'sessions'), where('teacherUids', 'array-contains', ctx.uid));
    first.push(new Promise((resolve) => {
      unsubs.push(onSnapshot(classQ, (snap) => {
        staffClasses = new Map(snap.docs.map((d) => [d.id, d.data()]));
        publishSessions();
        resolve();
      }, (e) => { fail('학급')(e); resolve(); }));
    }));
    unsubs.push(onSnapshot(collection(db, 'staff'), (snap) => {
      applyStaff(snap.docs.map((d) => ({ uid: d.id, ...d.data() })).sort((a, b) => String(a.name).localeCompare(String(b.name))));
      emit();
    }, fail('교사 명단')));
    first.push(new Promise((resolve) => {
      unsubs.push(onSnapshot(sessQ, (snap) => {
        staffSessions = new Map(snap.docs.map((d) => [d.id, d.data()]));
        publishSessions();
        resolve();
      }, (e) => { fail('세션')(e); resolve(); }));
    }));
  }
  watchMemberSessions();
  publishSessions();
  // 첫 값이 오면(또는 6초 뒤) 진행 중 세션의 내 기록까지 기다린다
  const timeout = new Promise((r) => setTimeout(r, 6000));
  ready = Promise.race([Promise.all(first), timeout]).then(() => {
    const active = getSessions().activeSessionId;
    return active ? Promise.race([loadOwn(active), new Promise((r) => setTimeout(r, 4000))]) : null;
  });
  return ready;
}

/** 화면을 떠나거나 로그아웃하기 전에 바로 쓴다 */
export const flushNow = () => flush();

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => { flush(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
}
