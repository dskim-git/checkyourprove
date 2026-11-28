// 증명 연습 진행·인증 상태 계산

import { LEVELS, TEST_FREE_NAVIGATION } from '../data/levels.js';
import { problemsByMethod } from '../data/problems/index.js';
import { METHODS } from '../data/methods.js';
import { practiceSettings } from './practiceSettings.js';
import { findAttempt } from './attemptStore.js';

export function requiredClears(methodId) {
  const total = problemsByMethod(methodId).length;
  return Math.min(practiceSettings().requiredClears, total);
}

/** 명제 하나의 이 활동 단계 상태 */
export function problemStatus(levelId, problemId) {
  return attemptStatus(findAttempt(levelId, problemId));
}

/** 연습 기록 하나의 상태(교사 업무판의 연습 현황에서도 쓴다) */
export function attemptStatus(attempt) {
  if (!attempt) return { state: 'new', label: '시작 전', action: '시작하기' };
  if (attempt.passedAt && attempt.status !== 'in-progress') {
    return { state: 'passed', label: attempt.score != null ? `통과 ${attempt.score}점` : '통과', action: '다시 보기' };
  }
  if (attempt.status === 'ended') {
    return { state: 'ended', label: attempt.score != null ? `미통과 ${attempt.score}점` : '미통과', action: '다시 보기' };
  }
  if (attempt.passedAt) return { state: 'passed', label: '통과, 다시 푸는 중', action: '이어서 하기' };
  return { state: 'progress', label: '진행 중', action: '이어서 하기' };
}

export function clearedCount(methodId, levelId) {
  return problemsByMethod(methodId).filter((problem) => findAttempt(levelId, problem.id)?.passedAt).length;
}

export function isCertified(methodId, levelId) {
  return clearedCount(methodId, levelId) >= requiredClears(methodId);
}

/** AI를 쓰는 활동인데 연습 모드 AI가 꺼져 있는가 */
export const aiBlocked = (level) => Boolean(level?.usesAi) && !practiceSettings().practiceAi;

export function isUnlocked(methodId, index) {
  if (aiBlocked(LEVELS[index])) return false;
  if (index === 0 || TEST_FREE_NAVIGATION || practiceSettings().unlockAll) return true;
  return isCertified(methodId, LEVELS[index - 1].id);
}

/** 증명법 하나의 활동 단계별 상태 목록 */
export function levelStates(methodId) {
  return LEVELS.map((level, index) => {
    const certified = isCertified(methodId, level.id);
    const unlocked = isUnlocked(methodId, index);
    return {
      level,
      index,
      certified,
      unlocked,
      cleared: clearedCount(methodId, level.id),
      required: requiredClears(methodId),
      aiOff: aiBlocked(level),
      state: certified ? 'certified' : unlocked ? 'open' : 'locked',
    };
  });
}

export function certifiedLevelCount(methodId) {
  return LEVELS.filter((level) => isCertified(methodId, level.id)).length;
}

/**
 * 한 학생의 연습 기록 목록으로 증명법별 인증 단계 수와 최근 활동(교사 업무판의 증명 연습 현황, 2026-11-28).
 * @param {Array<{levelId, problemId, method, status, score, passedAt, updatedAt}>} attempts
 * @param {{ requiredClears: number }} settings 그 학생 학급의 연습 설정
 */
export function practiceSummary(attempts, settings) {
  const passed = new Set(attempts.filter((a) => a.passedAt).map((a) => `${a.levelId}:${a.problemId}`));
  const certified = Object.fromEntries(METHODS.map(({ id: methodId }) => {
    const problems = problemsByMethod(methodId);
    const need = Math.min(settings.requiredClears, problems.length);
    const n = LEVELS.filter((level) => need > 0 && problems.filter((p) => passed.has(`${level.id}:${p.id}`)).length >= need).length;
    return [methodId, n];
  }));
  const recent = [...attempts].filter((a) => a.updatedAt).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0] ?? null;
  return { certified, recent, recentStatus: recent ? attemptStatus(recent) : null, lastActiveAt: recent?.updatedAt ?? null };
}
