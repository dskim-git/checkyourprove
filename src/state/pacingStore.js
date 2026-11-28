// 원리 활동 교사 진행 제어 (2026-11-27 사용자 결정)
// 교사가 연 화면(PRINCIPLE_STEPS의 번호)까지만 학생이 자기 속도로 가고, 그다음은 "선생님이 열 때까지" 기다린다.
//
// 기록 구조: { [sessionId]: { paced, openUpTo, updatedAt } }
//   paced: 진행 제어를 켰는가(끄면 학생이 자유롭게 진행), openUpTo: 학생에게 열린 마지막 화면 번호(0부터, 처음엔 설명 1장만)
//
// 프로토타입(지금): 이 브라우저의 localStorage에 두고, 다른 탭의 변경은 'storage' 이벤트로 받는다.
//   그래서 교사 화면과 학생 화면을 같은 브라우저의 두 탭으로 열면 실시간으로 제어된다(미리보기·시연용).
// TODO(로드맵 4단계 Firebase): 세션 문서의 pacing 필드로 옮기고, 학생 화면은 onSnapshot으로 구독한다.
//   쓰기는 교사 권한만 허용(보안 규칙), 학생이 연 화면 너머의 답을 서버에서도 받지 않는다.
//   교사 화면에 화면별 도착 학생 수(실시간)를 보여 준다. 구현은 이 모듈의 getPacing/setPacing/subscribePacing만 바꾼다.

import { readJson, writeJson } from './storage.js';
import { isFirebase, storageKey } from './appMode.js';
import { findSession, updateSession } from './sessionStore.js';

// 서버 연결(firebase 모드, 로드맵 4-3): 진행 제어는 회차 문서의 pacing 칸(담당 교사가 씀, 보안 규칙이 키를 허락).
// 학생은 들어간 회차 문서를 이미 실시간으로 받으므로(dataSync), 회차가 바뀌면 'checkyourprove:data' 이벤트로 알린다.

const STORAGE_KEY = 'checkyourprove.prototype.pacing.v1';
const LOCAL_EVENT = 'checkyourprove:pacing';
const DEFAULT = { paced: false, openUpTo: 0 };

const readAll = () => readJson(STORAGE_KEY, {});

/** 세션의 진행 제어 상태 (매번 저장소에서 새로 읽는다: 다른 탭이 바꿨을 수 있다) */
export function getPacing(sessionId) {
  if (isFirebase) return { ...DEFAULT, ...(findSession(sessionId)?.pacing ?? {}) };
  return { ...DEFAULT, ...(readAll()[sessionId] ?? {}) };
}

export function setPacing(sessionId, patch) {
  if (isFirebase) {
    const next = { ...getPacing(sessionId), ...patch, updatedAt: new Date().toISOString() };
    next.openUpTo = Math.max(0, Math.floor(Number(next.openUpTo) || 0));
    updateSession(sessionId, { pacing: next });
    window.dispatchEvent(new window.CustomEvent(LOCAL_EVENT, { detail: { sessionId } }));
    return next;
  }
  const all = readAll();
  const next = { ...DEFAULT, ...(all[sessionId] ?? {}), ...patch, updatedAt: new Date().toISOString() };
  next.openUpTo = Math.max(0, Math.floor(Number(next.openUpTo) || 0));
  all[sessionId] = next;
  writeJson(STORAGE_KEY, all);
  window.dispatchEvent(new window.CustomEvent(LOCAL_EVENT, { detail: { sessionId } }));
  return next;
}

/** 학생이 이 화면 번호를 볼 수 있는가 */
export function stepOpen(sessionId, index) {
  const p = getPacing(sessionId);
  return !p.paced || index <= p.openUpTo;
}

/** 진행 제어가 바뀌면 cb(상태). 다른 탭(storage 이벤트)과 같은 탭(사용자 이벤트) 모두. 해제 함수를 돌려준다. */
export function subscribePacing(sessionId, cb) {
  const onStorage = (e) => { if (e.key === null || e.key === storageKey(STORAGE_KEY)) cb(getPacing(sessionId)); };
  const onLocal = (e) => { if (e.detail?.sessionId === sessionId) cb(getPacing(sessionId)); };
  // 서버 모드: 회차 문서(진행 제어)나 학생 기록(도착 수)이 바뀌면
  const onData = () => cb(getPacing(sessionId));
  window.addEventListener('storage', onStorage);
  window.addEventListener(LOCAL_EVENT, onLocal);
  if (isFirebase) window.addEventListener('checkyourprove:data', onData);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(LOCAL_EVENT, onLocal);
    window.removeEventListener('checkyourprove:data', onData);
  };
}
