// 활동 단계 id → 활동 모듈
// 각 모듈은 createData(problem)로 기록의 초기 데이터를 만들고, mount(el, ctx)로 화면을 그린다.

import fillBlanks, { blankActivity } from './fillBlanks.js';
import orderSteps from './orderSteps.js';
import fillSteps from './fillSteps.js';
import stepByStep from './stepByStep.js';
import aiCoach from './aiCoach.js';
import soloProof from './soloProof.js';

export const ACTIVITIES = {
  'choose-blanks': blankActivity({ choices: true }),
  'fill-blanks': fillBlanks,
  'order-steps': orderSteps,
  'fill-steps': fillSteps,
  'step-by-step': stepByStep,
  'ai-coach': aiCoach,
  solo: soloProof,
};
