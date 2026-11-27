// 증명 연습 설정: 관리자 기본값(state/adminStore.js) + 학급별 덮어쓰기(교사, state/sessionStore.js 학급의 practice)
// 학급은 이 기기의 진행 세션의 학급이다(로그인한 학생은 세션 코드로 들어온 세션). 학급에 속하지 않으면 관리자 기본값.

import { getAdmin, PRACTICE_DEFAULTS } from './adminStore.js';
import { activeSession, classPractice } from './sessionStore.js';

/** { requiredClears, revealAfterTries, soloPassScore, practiceAi, unlockAll } */
export function practiceSettings(classId = activeSession()?.classId) {
  return { ...PRACTICE_DEFAULTS, ...getAdmin().practice, ...(classId ? classPractice(classId) : {}) };
}
