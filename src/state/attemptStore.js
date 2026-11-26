// 증명 연습 활동 기록 저장소 (프로토타입: 이 브라우저에만 임시 보관)
// 기록 하나 = (활동 단계, 명제) 한 쌍의 현재 시도. 지난 시도 결과는 history에 남긴다.
// TODO: Firestore 연동 시 학생별 문서로 옮기고, 통과 판정은 서버에서 확정한다.

import { readJson, writeJson, removeKey } from './storage.js';

const STORAGE_KEY = 'checkyourprove.prototype.practice.v1';

let cache = null;
const all = () => (cache ??= readJson(STORAGE_KEY, {}));
const keyOf = (levelId, problemId) => `${levelId}:${problemId}`;
const now = () => new Date().toISOString();

function createAttempt(levelId, problem, data) {
  const createdAt = now();
  return {
    levelId,
    problemId: problem.id,
    method: problem.method,
    status: 'in-progress', // in-progress | passed | ended(완료했지만 통과하지 못함)
    startedAt: createdAt,
    updatedAt: createdAt,
    completedAt: null,
    score: null,
    passedAt: null, // 한 번이라도 통과한 시각. 다시 풀어도 유지되어 인증에 쓰인다.
    history: [],
    requestLog: [],
    data,
  };
}

export function findAttempt(levelId, problemId) {
  return all()[keyOf(levelId, problemId)] ?? null;
}

export function getOrCreateAttempt(levelId, problem, createData) {
  const existing = findAttempt(levelId, problem.id);
  if (existing) return existing;
  const attempt = createAttempt(levelId, problem, createData());
  all()[keyOf(levelId, problem.id)] = attempt;
  return attempt;
}

export function saveAttempt(attempt) {
  attempt.updatedAt = now();
  all()[keyOf(attempt.levelId, attempt.problemId)] = attempt;
  return writeJson(STORAGE_KEY, all());
}

export function finishAttempt(attempt, { passed, score = null }) {
  const completedAt = now();
  attempt.status = passed ? 'passed' : 'ended';
  attempt.completedAt = completedAt;
  attempt.score = score;
  if (passed && !attempt.passedAt) attempt.passedAt = completedAt;
  attempt.history.push({ status: attempt.status, score, completedAt });
  saveAttempt(attempt);
}

/** 같은 활동·명제를 처음부터 다시 시작한다. 통과 기록과 지난 결과는 유지한다. */
export function restartAttempt(attempt, problem, createData) {
  const fresh = createAttempt(attempt.levelId, problem, createData());
  fresh.passedAt = attempt.passedAt;
  fresh.history = attempt.history;
  saveAttempt(fresh);
  return fresh;
}

export function listAttempts() {
  return Object.values(all());
}

export function clearAllAttempts() {
  cache = {};
  removeKey(STORAGE_KEY);
}
