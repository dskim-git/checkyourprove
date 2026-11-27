// 면담 후보 선정과 면담 기록 (구현 6, 프로토타입: 이 브라우저에만 임시 보관)
//
// 기록 구조 (저장 키 checkyourprove.prototype.interviews.v1)
//   { thresholds: { lowMax, highMin, aiShareMin, dropMin, stickWeakMax } | null(기본값),
//     selected: { [학생 id]: { types: [유형 id], reasons: [{ type, problemId, text }], note(유형 6 이유), at, updatedAt } },
//     records: { [학생 id]: record } }
//   record = { status: 'planned'|'done'|'cancelled', scheduledAt('YYYY-MM-DDTHH:mm', 교사가 입력), interviewer,
//              consent: { student, guardian, recording }(받은 날짜 'YYYY-MM-DD' 또는 null),
//              questions: [{ id, text, source: 'auto'|'teacher', type, problemId, answer }], memo,
//              createdAt, updatedAt, doneAt, history: [{ at, status }] }
//   학생 id는 세션마다 다르다(state/sessionStore.js localStudentId, 예시 학생은 sample-01 …).
// 녹음·전사는 서버 연결 뒤(로드맵 4·5단계)에 record.audio로 더한다.
// TODO(Firebase): 면담 기록은 교사만 읽고 쓰도록 서버 규칙으로 막는다. 학생은 볼 수 없다.

import { DEFAULT_INTERVIEW_THRESHOLDS, INTERVIEW_CONSENTS } from '../data/interview.js';
import { readJson, removeKey, writeJson } from './storage.js';

const STORAGE_KEY = 'checkyourprove.prototype.interviews.v1';

const DEFAULTS = () => ({ thresholds: null, selected: {}, records: {} });

let cache = null;

/** 저장된 모양이 달라도(빠진 목록 등) 쓸 수 있게 고친다 */
function normalize(raw) {
  const d = { ...DEFAULTS(), ...(raw && typeof raw === 'object' ? raw : {}) };
  if (!d.selected || typeof d.selected !== 'object') d.selected = {};
  if (!d.records || typeof d.records !== 'object') d.records = {};
  Object.values(d.selected).forEach((s) => {
    if (!Array.isArray(s.types)) s.types = [];
    if (!Array.isArray(s.reasons)) s.reasons = [];
  });
  Object.values(d.records).forEach((r) => {
    if (!Array.isArray(r.questions)) r.questions = [];
    if (!r.consent || typeof r.consent !== 'object') r.consent = {};
    if (!Array.isArray(r.history)) r.history = [];
  });
  return d;
}

export function getInterviews() {
  cache ??= normalize(readJson(STORAGE_KEY, {}));
  return cache;
}

const save = () => writeJson(STORAGE_KEY, getInterviews());

export function resetInterviews() {
  cache = null;
  removeKey(STORAGE_KEY);
}

const now = () => new Date().toISOString();

// ── 기준값 ──

export const interviewThresholds = () => ({ ...DEFAULT_INTERVIEW_THRESHOLDS, ...(getInterviews().thresholds ?? {}) });

export function saveThresholds(patch) {
  const d = getInterviews();
  d.thresholds = { ...interviewThresholds(), ...patch };
  return save();
}

export function resetThresholds() {
  getInterviews().thresholds = null;
  return save();
}

// ── 면담 대상 선정 ──

export const selectionOf = (studentId) => getInterviews().selected[studentId] ?? null;

/** 면담 대상으로 정한다. types: 고른 유형, reasons: 그때의 근거(학생 × 명제), note: 유형 6 이유 */
export function selectStudent(studentId, { types, reasons = [], note = '' }) {
  const d = getInterviews();
  const prev = d.selected[studentId];
  d.selected[studentId] = { types: [...new Set(types)], reasons, note, at: prev?.at ?? now(), updatedAt: now() };
  return save();
}

export function updateSelection(studentId, patch) {
  const s = selectionOf(studentId);
  if (!s) return false;
  Object.assign(s, patch, { updatedAt: now() });
  if (patch.types) s.types = [...new Set(patch.types)];
  return save();
}

/** 선정을 취소한다. 면담 기록은 남긴다(다시 정하면 이어서 쓴다). */
export function unselectStudent(studentId) {
  delete getInterviews().selected[studentId];
  return save();
}

// ── 면담 기록 ──

export const recordOf = (studentId) => getInterviews().records[studentId] ?? null;

/** 면담 기록을 처음 만든다(자동 질문을 넣어서). 이미 있으면 그대로 돌려준다. */
export function ensureRecord(studentId, questions = []) {
  const d = getInterviews();
  if (!d.records[studentId]) {
    d.records[studentId] = {
      status: 'planned',
      scheduledAt: '',
      interviewer: '',
      consent: Object.fromEntries(INTERVIEW_CONSENTS.map((c) => [c.id, null])),
      questions: questions.map((q) => ({ answer: '', ...q })),
      memo: '',
      createdAt: now(),
      updatedAt: now(),
      doneAt: null,
      history: [{ at: now(), status: 'planned' }],
    };
    save();
  }
  return d.records[studentId];
}

/** 면담 "완료"에 필요한 동의가 모두 표시되었나 */
export const consentComplete = (record) => INTERVIEW_CONSENTS.filter((c) => c.required).every((c) => Boolean(record?.consent?.[c.id]));

/**
 * 기록을 고친다. 동의 확인 전에는 "완료"로 바꿀 수 없다(false를 돌려줌).
 * patch: { scheduledAt, interviewer, memo, status, consent: { id: 날짜|null } }
 */
export function updateRecord(studentId, patch) {
  const r = recordOf(studentId);
  if (!r) return false;
  const { consent, status, ...rest } = patch;
  if (consent) r.consent = { ...r.consent, ...consent };
  Object.assign(r, rest);
  if (status && status !== r.status) {
    if (status === 'done' && !consentComplete(r)) {
      save();
      return false;
    }
    r.status = status;
    r.doneAt = status === 'done' ? now() : null;
    r.history.push({ at: now(), status });
  }
  // 완료한 면담에서 필수 동의 표시를 지우면 예정으로 돌린다
  if (r.status === 'done' && !consentComplete(r)) {
    r.status = 'planned';
    r.doneAt = null;
    r.history.push({ at: now(), status: 'planned' });
  }
  r.updatedAt = now();
  save();
  return true;
}

export function updateQuestion(studentId, questionId, patch) {
  const q = recordOf(studentId)?.questions.find((x) => x.id === questionId);
  if (!q) return false;
  Object.assign(q, patch);
  recordOf(studentId).updatedAt = now();
  return save();
}

export function addQuestions(studentId, questions) {
  const r = recordOf(studentId);
  if (!r) return false;
  const have = new Set(r.questions.map((q) => q.id));
  questions.filter((q) => !have.has(q.id)).forEach((q) => r.questions.push({ answer: '', ...q }));
  r.updatedAt = now();
  return save();
}

export function removeQuestion(studentId, questionId) {
  const r = recordOf(studentId);
  if (!r) return false;
  r.questions = r.questions.filter((q) => q.id !== questionId);
  r.updatedAt = now();
  return save();
}

export function moveQuestion(studentId, questionId, delta) {
  const r = recordOf(studentId);
  const i = r?.questions.findIndex((q) => q.id === questionId) ?? -1;
  const j = i + delta;
  if (i < 0 || j < 0 || j >= r.questions.length) return false;
  [r.questions[i], r.questions[j]] = [r.questions[j], r.questions[i]];
  r.updatedAt = now();
  return save();
}
