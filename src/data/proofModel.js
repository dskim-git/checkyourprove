// 단계별 증명 데이터 해석
// 단계 문장 안의 {{정답|다른 정답}}은 빈칸이다. 모든 연습 활동은 같은 단계 데이터에서 만들어진다.

import { normalizeMath } from '../services/textMatch.js';

const BLANK_PATTERN = /\{\{(.+?)\}\}/g;

/** 단계 문장을 일반 텍스트와 빈칸 조각으로 나눈다. */
export function parseStep(text) {
  const segments = [];
  let last = 0;
  for (const match of text.matchAll(BLANK_PATTERN)) {
    if (match.index > last) segments.push({ type: 'text', value: text.slice(last, match.index) });
    const answers = match[1].split('|').map((answer) => answer.trim());
    segments.push({ type: 'blank', answers });
    last = match.index + match[0].length;
  }
  if (last < text.length) segments.push({ type: 'text', value: text.slice(last) });
  return segments;
}

/** 빈칸을 첫 번째 정답으로 채운 단계 문장 */
export function stepText(step) {
  return step.text.replace(BLANK_PATTERN, (_, inner) => inner.split('|')[0].trim());
}

export function fullProofText(problem) {
  return problem.steps.map(stepText).join('\n');
}

/** 문제의 모든 빈칸 목록: [{ id, stepIndex, answers }] */
export function blanksOf(problem) {
  const blanks = [];
  problem.steps.forEach((step, stepIndex) => {
    parseStep(step.text)
      .filter((segment) => segment.type === 'blank')
      .forEach((segment, order) => blanks.push({ id: `s${stepIndex}b${order}`, stepIndex, answers: segment.answers }));
  });
  return blanks;
}

/**
 * 서술형 점검에서 확인할 핵심 표현 묶음.
 * 각 묶음 안의 표현 중 하나라도 있으면 그 묶음을 충족한 것으로 본다.
 * step.check가 없으면 빈칸 정답으로 만들되, 너무 짧은 정답(예: 1, 참, ≥)은 제외한다.
 */
export function checkGroups(step) {
  if (step.check) return step.check;
  return parseStep(step.text)
    .filter((segment) => segment.type === 'blank')
    .map((segment) => segment.answers)
    .filter((answers) => answers.some((answer) => normalizeMath(answer).length >= 2));
}
