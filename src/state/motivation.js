// 동기 부여 정보: 연속 학습일, 통과 수, 인증 배지, 이어서 할 활동
// 모두 실제 활동 기록(attemptStore)에서 계산한다. 지어낸 숫자를 보여 주지 않는다.

import { METHODS } from '../data/methods.js';
import { LEVELS } from '../data/levels.js';
import { listAttempts } from './attemptStore.js';
import { levelStates } from './practiceProgress.js';

/** 로컬 날짜 키 (YYYY-MM-DD) */
function dayKey(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function activeDays(attempts) {
  const days = new Set();
  attempts.forEach((attempt) => {
    if (attempt.updatedAt) days.add(dayKey(attempt.updatedAt));
    attempt.history?.forEach((h) => h.completedAt && days.add(dayKey(h.completedAt)));
  });
  return days;
}

/**
 * 연속 학습일: 오늘(또는 어제)까지 하루도 빠지지 않고 활동한 날 수.
 * @returns {{ days: number, today: boolean }}
 */
export function streak(now = new Date()) {
  const days = activeDays(listAttempts());
  const cursor = new Date(now);
  const today = days.has(dayKey(cursor.toISOString()));
  if (!today) cursor.setDate(cursor.getDate() - 1);
  let count = 0;
  while (days.has(dayKey(cursor.toISOString()))) {
    count += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return { days: count, today };
}

/** 한 번이라도 통과한 (활동 단계, 명제) 수 */
export function passedCount() {
  return listAttempts().filter((attempt) => attempt.passedAt).length;
}

/** 증명법별 인증 배지: [{ method, certified: [levelIndex...], total }] */
export function badges() {
  return METHODS.map((method) => {
    const states = levelStates(method.id);
    return {
      method,
      states,
      certified: states.filter((s) => s.certified).length,
      total: LEVELS.length,
    };
  });
}

/** 가장 최근에 손댄, 아직 끝나지 않은 활동 (없으면 null) */
export function continueAttempt() {
  return listAttempts()
    .filter((attempt) => attempt.status === 'in-progress')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
}
