// 연구 세션 저장소 (프로토타입: 이 브라우저에만 임시 보관) — 세션 = 학급 × 회차 (2026-11-27 사용자 결정)
//
// 기록 구조
//   { classes: [{ id, name }], sessions: [session], activeSessionId }
//   session = { id, classId, round, open, propositionIds, stagesOpen, createdAt, legacy? }
//     open: 학생 홈에서 AI와 탐구하기를 열었는가, propositionIds: 탐구할 명제, stagesOpen: 교사가 열어 준 단계(1~4)
//     legacy: 세션 기능 전의 수업 설정·연구 기록을 옮겨 온 첫 세션(기존 저장 위치와 학생 id 'local'을 그대로 쓴다)
//     consentRequired(연구 동의 받기), surveyId(쓸 설문), surveyPreOpen·surveyPostOpen(사전·사후 설문 열기) — 없으면 SESSION_DEFAULTS
// 학생(이 브라우저)은 교사가 고른 "진행 중 세션"으로 활동하고, 연구 기록은 세션마다 따로 저장된다(state/researchStore.js).
// 연구 분석·채점·태그 화면은 포함할 세션을 골라 합쳐 본다(gradingStore의 scopeSessionIds).
// TODO: Firestore 연동 뒤에는 학급·세션을 서버 문서로 두고, 학생은 로그인한 학급의 진행 중 세션에 자동으로 연결한다.

import { DEFAULT_CLASSROOM } from '../data/classroom.js';
import { DEFAULT_SURVEY_ID } from '../data/surveyDefaults.js';

/** 세션의 동의·설문 기본값 (구현 4 전에 만든 세션도 이 값을 따른다) */
export const SESSION_DEFAULTS = { consentRequired: true, surveyId: DEFAULT_SURVEY_ID, surveyPreOpen: true, surveyPostOpen: true };
export const sessionConfig = (session) => ({ ...SESSION_DEFAULTS, ...Object.fromEntries(Object.keys(SESSION_DEFAULTS).filter((k) => session?.[k] !== undefined).map((k) => [k, session[k]])) });
import { readJson, writeJson } from './storage.js';

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

export function getSessions() {
  cache ??= readJson(STORAGE_KEY, null) ?? initial();
  return cache;
}

export const saveSessions = () => writeJson(STORAGE_KEY, getSessions());

export function resetSessionsCache() {
  cache = null;
}

export const activeSessionId = () => getSessions().activeSessionId;
export const findSession = (id) => getSessions().sessions.find((s) => s.id === id) ?? SAMPLE_SESSIONS.find((s) => s.id === id) ?? null;
export const activeSession = () => findSession(activeSessionId()) ?? getSessions().sessions[0];
export const className = (classId) => [...getSessions().classes, ...SAMPLE_CLASSES].find((c) => c.id === classId)?.name ?? '학급';

/** "1반 2회차" */
export const sessionLabel = (session) => (session ? `${className(session.classId)} ${session.round}회차` : '');

/** 이 세션의 "이 브라우저 학생" id (첫 세션은 기존 기록과 이어지도록 'local') */
export const localStudentId = (session) => (session.legacy ? 'local' : `local-${session.id}`);

export function addClass(name) {
  const data = getSessions();
  const clean = String(name ?? '').trim();
  if (!clean) return null;
  const klass = { id: newId('c'), name: clean };
  data.classes.push(klass);
  saveSessions();
  return klass;
}

export function renameClass(id, name) {
  const klass = getSessions().classes.find((c) => c.id === id);
  if (klass && String(name).trim()) klass.name = String(name).trim();
  return saveSessions();
}

/** 학급이 세션을 가지고 있지 않을 때만 지운다 */
export function removeClass(id) {
  const data = getSessions();
  if (data.sessions.some((s) => s.classId === id)) return false;
  data.classes = data.classes.filter((c) => c.id !== id);
  return saveSessions();
}

/** 새 회차를 만든다. 명제·단계는 같은 학급의 마지막 회차(없으면 진행 중 세션)를 이어받고, 단계는 1단계만 연다. */
export function addSession(classId) {
  const data = getSessions();
  const same = data.sessions.filter((s) => s.classId === classId);
  const base = same.at(-1) ?? activeSession();
  const session = {
    id: newId('s'),
    classId,
    round: same.reduce((m, s) => Math.max(m, s.round), 0) + 1,
    open: true,
    propositionIds: [...(base?.propositionIds ?? DEFAULT_CLASSROOM.researchPropositionIds)],
    stagesOpen: [1],
    ...sessionConfig(base),
    createdAt: now(),
  };
  data.sessions.push(session);
  saveSessions();
  return session;
}

export function setActiveSession(id) {
  const data = getSessions();
  if (!data.sessions.some((s) => s.id === id)) return false;
  data.activeSessionId = id;
  return saveSessions();
}

export function updateSession(id, patch) {
  const session = getSessions().sessions.find((s) => s.id === id);
  if (!session) return false;
  Object.assign(session, patch);
  return saveSessions();
}

/** 진행 중이 아닌 세션을 지운다(그 세션의 연구 기록은 researchStore에서 함께 지운다) */
export function removeSession(id) {
  const data = getSessions();
  if (id === data.activeSessionId) return false;
  data.sessions = data.sessions.filter((s) => s.id !== id);
  return saveSessions();
}

/** 학급별로 묶은 세션 목록 (예시 포함 여부) */
export function sessionsByClass({ includeSamples = false } = {}) {
  const data = getSessions();
  const classes = includeSamples ? [...data.classes, ...SAMPLE_CLASSES] : data.classes;
  const sessions = includeSamples ? [...data.sessions, ...SAMPLE_SESSIONS] : data.sessions;
  return classes.map((c) => ({ ...c, sessions: sessions.filter((s) => s.classId === c.id).sort((a, b) => a.round - b.round) }));
}
