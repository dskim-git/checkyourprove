// 증명 연습 진행·인증 상태 계산

import { LEVELS, TEST_FREE_NAVIGATION } from '../data/levels.js';
import { problemsByMethod } from '../data/problems/index.js';
import { practiceSettings } from './practiceSettings.js';
import { findAttempt } from './attemptStore.js';

export function requiredClears(methodId) {
  const total = problemsByMethod(methodId).length;
  return Math.min(practiceSettings().requiredClears, total);
}

/** 명제 하나의 이 활동 단계 상태 */
export function problemStatus(levelId, problemId) {
  const attempt = findAttempt(levelId, problemId);
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
