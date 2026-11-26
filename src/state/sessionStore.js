// AI와 탐구하기(연구 모드) 세션 저장소 (프로토타입: 이 브라우저에만 임시 보관)

import { createResearchSession } from './sessionModels.js';
import { readJson, writeJson, removeKey } from './storage.js';

const STORAGE_KEY = 'checkyourprove.prototype.sessions.v1';
const FACTORIES = { research: createResearchSession };

let cache = null;

function all() {
  if (!cache) cache = readJson(STORAGE_KEY, {});
  return cache;
}

const keyOf = (mode, problemId) => `${mode}:${problemId}`;

export function findSession(mode, problemId) {
  return all()[keyOf(mode, problemId)] ?? null;
}

/** 세션을 찾고, 없으면 새로 만든다. 반환한 객체를 수정한 뒤 saveSession으로 저장한다. */
export function getOrCreateSession(mode, problemId) {
  const existing = findSession(mode, problemId);
  if (existing) return existing;
  const session = FACTORIES[mode](problemId);
  all()[keyOf(mode, problemId)] = session;
  return session;
}

export function saveSession(session) {
  session.updatedAt = new Date().toISOString();
  all()[keyOf(session.mode, session.problemId)] = session;
  return writeJson(STORAGE_KEY, all());
}

export function resetSession(mode, problemId) {
  delete all()[keyOf(mode, problemId)];
  writeJson(STORAGE_KEY, all());
}

export function clearAllSessions() {
  cache = {};
  removeKey(STORAGE_KEY);
}
