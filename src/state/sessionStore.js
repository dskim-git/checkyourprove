// 연구 세션 저장소 (프로토타입: 이 브라우저에만 임시 보관) — 세션 = 학급 × 회차 (2026-11-27 사용자 결정)
//
// 기록 구조
//   { classes: [{ id, name }], sessions: [session], activeSessionId }
//   session = { id, classId, round, open, propositionIds, stagesOpen, createdAt, legacy? }
//     open: 학생 홈에서 AI와 탐구하기를 열었는가, propositionIds: 탐구할 명제, stagesOpen: 교사가 열어 준 단계(1~4)
//     legacy: 세션 기능 전의 수업 설정·연구 기록을 옮겨 온 첫 세션(기존 저장 위치와 학생 id 'local'을 그대로 쓴다)
//     code(세션 코드 6자리, 학생이 입력해 들어옴), codeOpen(코드로 들어오기 허용, 기본 켬) — 로드맵 3단계, 사용자 결정 2026-11-27
//     consentRequired(연구 동의 받기), surveyId(쓸 설문), surveyPreOpen·surveyPostOpen(사전·사후 설문 열기) — 없으면 SESSION_DEFAULTS
// 학생(이 브라우저)은 교사가 고른 "진행 중 세션"으로 활동하고, 연구 기록은 세션마다 따로 저장된다(state/researchStore.js).
// 연구 분석·채점·태그 화면은 포함할 세션을 골라 합쳐 본다(gradingStore의 scopeSessionIds).
// TODO: Firestore 연동 뒤에는 학급·세션을 서버 문서로 두고, 학생은 로그인한 학급의 진행 중 세션에 자동으로 연결한다.

import { DEFAULT_CLASSROOM } from '../data/classroom.js';
import { DEFAULT_SURVEY_ID } from '../data/surveyDefaults.js';

/** 세션의 동의·설문 기본값 (구현 4 전에 만든 세션도 이 값을 따른다) */
export const SESSION_DEFAULTS = { consentRequired: true, surveyId: DEFAULT_SURVEY_ID, surveyPreOpen: true, surveyPostOpen: true, principleOpen: true };
export const sessionConfig = (session) => ({ ...SESSION_DEFAULTS, ...Object.fromEntries(Object.keys(SESSION_DEFAULTS).filter((k) => session?.[k] !== undefined).map((k) => [k, session[k]])) });
import { readJson, writeJson } from './storage.js';
import { isFirebase } from './appMode.js';

// ── 서버 연결 (firebase 모드, 로드맵 4-2) ──
// 학급·세션은 Firestore(classes, sessions)에서 firebase/dataSync.js가 받아 applyRemoteSessions로 넣는다.
// 교사는 담당 학급·세션(관리자는 모두), 학생은 세션 코드로 들어간 세션만 받는다. 진행 중 세션은 사람마다(users.activeSessionId).
// 구조(만들기·지우기·이름·학급 연습 설정·코드)는 서버 함수(api/session.js), 진행 설정은 Firestore에 바로 쓴다(보안 규칙이 막음).
// 바꾸는 함수는 메모리 값을 먼저 바꾸고 서버에 보낸다. 실패하면 dataSync가 서버 값으로 되돌리고 알린다.
let backend = null;
/** firebase/dataSync.js가 연결한다: { call(action, payload), updateSession(id, patch), setActive(id) } */
export function setSessionBackend(b) {
  backend = b;
}
export function applyRemoteSessions(data) {
  cache = { classes: data.classes ?? [], sessions: data.sessions ?? [], activeSessionId: data.activeSessionId ?? null };
}
const pendingId = (p) => `pending-${p}-${Date.now().toString(36)}`;
// 담당 교사로 고를 수 있는 교사·관리자 명단(staff, 서버 모드에서 교사가 받음)
let staff = [];
export function applyStaff(list) {
  staff = list ?? [];
}
export const staffList = () => staff;
/** 학급의 담당 교사 바꾸기(서버 모드). 한 명 이상 */
export function setClassTeachers(classId, uids) {
  const c = getSessions().classes.find((x) => x.id === classId);
  if (!c || !uids.length) return false;
  c.teacherUids = [...uids];
  if (isFirebase) backend?.call('setClassTeachers', { classId, uids });
  return true;
}

const STORAGE_KEY = 'checkyourprove.prototype.sessions.v1';
const CLASSROOM_KEY = 'checkyourprove.prototype.classroom.v1';

/** 예시 학생이 속한 가상 세션 (저장하지 않는다) */
export const SAMPLE_CLASSES = [{ id: 'sample-c1', name: '예시 1반', sample: true }, { id: 'sample-c2', name: '예시 2반', sample: true }];
export const SAMPLE_SESSIONS = [
  { id: 'sample-s1', classId: 'sample-c1', round: 1, sample: true },
  { id: 'sample-s2', classId: 'sample-c2', round: 1, sample: true },
];

let cache = null;
const now = () => new Date().toISOString();
const newId = (prefix) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** 처음 열 때: 세션 기능 전의 수업 설정을 첫 학급 1회차로 옮긴다 */
function initial() {
  const old = { ...DEFAULT_CLASSROOM, ...readJson(CLASSROOM_KEY, {}) };
  return {
    classes: [{ id: 'c-1', name: '1반' }],
    sessions: [{
      id: 's-1', classId: 'c-1', round: 1, open: old.researchOpen, propositionIds: [...old.researchPropositionIds], stagesOpen: [...old.researchStagesOpen], createdAt: now(), legacy: true,
    }],
    activeSessionId: 's-1',
  };
}

/**
 * 저장된 기록의 모양을 확인하고 고친다. 세션 기능을 만드는 도중에 저장된 기록처럼 목록이 빠져 있으면
 * 쓸 수 있는 학급·세션은 살리고, 세션이 하나도 없으면 첫 세션(1반 1회차, 기존 기록과 이어짐)을 만든다.
 */
function normalize(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { data: initial(), fixed: raw != null };
  const fresh = initial();
  const sessions = Array.isArray(raw.sessions) ? raw.sessions.filter((s) => s && typeof s === 'object' && s.id && s.classId) : [];
  const classes = Array.isArray(raw.classes) ? raw.classes.filter((c) => c && typeof c === 'object' && c.id) : [];
  let fixed = !Array.isArray(raw.sessions) || !Array.isArray(raw.classes) || sessions.length !== raw.sessions.length || classes.length !== raw.classes.length;
  if (!sessions.length) {
    sessions.push(...fresh.sessions);
    fixed = true;
  }
  sessions.forEach((s) => {
    if (!classes.some((c) => c.id === s.classId)) {
      classes.push(s.classId === 'c-1' ? { ...fresh.classes[0] } : { id: s.classId, name: '학급' });
      fixed = true;
    }
    if (!Array.isArray(s.propositionIds)) { s.propositionIds = [...fresh.sessions[0].propositionIds]; fixed = true; }
    if (!Array.isArray(s.stagesOpen)) { s.stagesOpen = [...fresh.sessions[0].stagesOpen]; fixed = true; }
    if (!Number.isFinite(s.round)) { s.round = 1; fixed = true; }
  });
  let { activeSessionId } = raw;
  if (!sessions.some((s) => s.id === activeSessionId)) {
    activeSessionId = sessions[0].id;
    fixed = true;
  }
  return { data: { ...raw, classes, sessions, activeSessionId }, fixed };
}

export function getSessions() {
  if (isFirebase) return (cache ??= { classes: [], sessions: [], activeSessionId: null });
  if (!cache) {
    const raw = readJson(STORAGE_KEY, null);
    const { data, fixed } = normalize(raw);
    cache = data;
    if (fixed) {
      console.warn('세션 기록의 모양이 달라 고쳐서 저장했습니다.', raw);
      writeJson(STORAGE_KEY, cache);
    }
  }
  return cache;
}

export const saveSessions = () => (isFirebase ? true : writeJson(STORAGE_KEY, getSessions()));

export function resetSessionsCache() {
  cache = null;
}

export const activeSessionId = () => getSessions().activeSessionId;
export const findSession = (id) => getSessions().sessions.find((s) => s.id === id) ?? SAMPLE_SESSIONS.find((s) => s.id === id) ?? null;
/** 진행 중 세션. 서버 모드에서는 세션이 하나도 없으면 null(학급·회차를 아직 만들지 않았거나 세션 코드로 들어가지 않음) */
export const activeSession = () => findSession(activeSessionId()) ?? (isFirebase ? null : getSessions().sessions[0]);
/** 학급 이름 (학생은 학급 문서를 읽지 않으므로 세션에 복사된 이름) */
export const className = (classId) => [...getSessions().classes, ...SAMPLE_CLASSES].find((c) => c.id === classId)?.name
  ?? getSessions().sessions.find((s) => s.classId === classId)?.className ?? '학급';

/** "1반 2회차" */
export const sessionLabel = (session) => (session ? `${className(session.classId)} ${session.round}회차` : '');

/** 이 세션의 "이 브라우저 학생" id (첫 세션은 기존 기록과 이어지도록 'local') */
export const localStudentId = (session) => (session.legacy ? 'local' : `local-${session.id}`);

export function addClass(name) {
  const data = getSessions();
  const clean = String(name ?? '').trim();
  if (!clean) return null;
  const klass = { id: isFirebase ? pendingId('c') : newId('c'), name: clean };
  data.classes.push(klass);
  if (isFirebase) backend?.call('createClass', { name: clean });
  saveSessions();
  return klass;
}

/** 학급의 증명 연습 설정 덮어쓰기 (값이 null이면 관리자 기본값을 따른다). 교사 설정 화면에서 바꾼다. */
export function setClassPractice(classId, patch) {
  const c = getSessions().classes.find((x) => x.id === classId);
  if (!c) return false;
  c.practice = { ...(c.practice ?? {}), ...patch };
  Object.keys(c.practice).forEach((k) => { if (c.practice[k] == null) delete c.practice[k]; });
  if (isFirebase) backend?.call('setClassPractice', { classId, patch });
  return saveSessions();
}
/** 학급의 연습 설정 덮어쓰기 (학생은 세션에 복사된 값) */
export const classPractice = (classId) => getSessions().classes.find((x) => x.id === classId)?.practice
  ?? getSessions().sessions.find((s) => s.classId === classId)?.classPractice ?? {};

export function renameClass(id, name) {
  const klass = getSessions().classes.find((c) => c.id === id);
  if (klass && String(name).trim()) {
    klass.name = String(name).trim();
    if (isFirebase) backend?.call('renameClass', { classId: id, name: klass.name });
  }
  return saveSessions();
}

/** 학급이 세션을 가지고 있지 않을 때만 지운다 */
export function removeClass(id) {
  const data = getSessions();
  if (data.sessions.some((s) => s.classId === id)) return false;
  data.classes = data.classes.filter((c) => c.id !== id);
  if (isFirebase) backend?.call('removeClass', { classId: id });
  return saveSessions();
}

/** 새 회차를 만든다. 명제·단계는 같은 학급의 마지막 회차(없으면 진행 중 세션)를 이어받고, 단계는 1단계만 연다. */
export function addSession(classId) {
  const data = getSessions();
  const same = data.sessions.filter((s) => s.classId === classId);
  const base = same.at(-1) ?? activeSession();
  const session = {
    id: isFirebase ? pendingId('s') : newId('s'),
    classId,
    round: same.reduce((m, s) => Math.max(m, s.round), 0) + 1,
    open: true,
    propositionIds: [...(base?.propositionIds ?? DEFAULT_CLASSROOM.researchPropositionIds)],
    stagesOpen: [1],
    ...sessionConfig(base),
    createdAt: now(),
  };
  data.sessions.push(session);
  if (isFirebase) backend?.call('createSession', { classId }); // 서버가 회차 번호·코드를 정해 만든다
  saveSessions();
  return session;
}

export function setActiveSession(id) {
  const data = getSessions();
  if (!data.sessions.some((s) => s.id === id)) return false;
  data.activeSessionId = id;
  if (isFirebase) backend?.setActive(id);
  return saveSessions();
}

export function updateSession(id, patch) {
  const session = getSessions().sessions.find((s) => s.id === id);
  if (!session) return false;
  Object.assign(session, patch);
  if (isFirebase) backend?.updateSession(id, patch);
  return saveSessions();
}

/** 진행 중이 아닌 세션을 지운다(그 세션의 연구 기록은 researchStore에서 함께 지운다) */
export function removeSession(id) {
  const data = getSessions();
  if (id === data.activeSessionId) return false;
  data.sessions = data.sessions.filter((s) => s.id !== id);
  if (isFirebase) backend?.call('removeSession', { sessionId: id }); // 서버가 그 세션의 학생 기록까지 지운다
  return saveSessions();
}

/** 학급별로 묶은 세션 목록 (예시 포함 여부) */
export function sessionsByClass({ includeSamples = false } = {}) {
  const data = getSessions();
  const classes = includeSamples ? [...data.classes, ...SAMPLE_CLASSES] : data.classes;
  const sessions = includeSamples ? [...data.sessions, ...SAMPLE_SESSIONS] : data.sessions;
  return classes.map((c) => ({ ...c, sessions: sessions.filter((s) => s.classId === c.id).sort((a, b) => a.round - b.round) }));
}

// ── 세션 코드 (로드맵 3단계): 학생은 교사가 알려 준 코드를 입력해 그 세션의 AI와 탐구하기에 들어온다 ──

const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // 헷갈리는 0·O·1·I 뺌
const makeCode = () => Array.from({ length: 6 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
/** 화면 표시 (예: K7P-4QX) */
export const formatCode = (code) => (code ? `${code.slice(0, 3)}-${code.slice(3)}` : '');
/** 입력 정리: 대문자, 하이픈·띄어쓰기 빼기 */
export const cleanCode = (text) => String(text ?? '').toUpperCase().replace(/[\s-]/g, '');

/** 세션 코드가 없으면 만든다(겹치지 않게). 예시 세션은 코드가 없다. */
export function ensureSessionCode(session) {
  if (!session || session.sample) return '';
  if (isFirebase) return session.code ?? ''; // 서버가 세션을 만들 때 코드를 정한다
  if (!session.code) {
    const used = new Set(getSessions().sessions.map((s) => s.code).filter(Boolean));
    let code;
    do code = makeCode(); while (used.has(code));
    session.code = code;
    session.codeOpen ??= true;
    saveSessions();
  }
  return session.code;
}

export function regenerateSessionCode(id) {
  const s = getSessions().sessions.find((x) => x.id === id);
  if (!s) return '';
  if (isFirebase) {
    backend?.call('regenerateCode', { sessionId: id });
    return ''; // 새 코드는 서버에서 곧 들어온다
  }
  delete s.code;
  return ensureSessionCode(s);
}

export function setSessionCodeOpen(id, open) {
  const s = getSessions().sessions.find((x) => x.id === id);
  if (!s) return false;
  s.codeOpen = Boolean(open);
  if (isFirebase) backend?.updateSession(id, { codeOpen: s.codeOpen });
  return saveSessions();
}

/** 코드로 세션 찾기: { session } 또는 { error: 'none' | 'closed' } */
export function findSessionByCode(text) {
  const code = cleanCode(text);
  const s = getSessions().sessions.find((x) => x.code && x.code === code);
  if (!s) return { error: 'none' };
  if (s.codeOpen === false) return { error: 'closed' };
  return { session: s };
}
