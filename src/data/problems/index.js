// 증명 문제 모음
// TODO: 교사의 명제 등록 방식이 정해지면 Firestore 등으로 옮긴다.
// TODO: 채점에 쓰이는 정답(빈칸, 예시 증명)은 실제 서비스에서는 서버에만 두는 방안을 검토한다.

import direct from './direct.js';
import contrapositive from './contrapositive.js';
import contradiction from './contradiction.js';
import induction from './induction.js';
import { RESEARCH_PROPOSITIONS } from '../researchPropositions.js';

const DIFFICULTY_ORDER = { 기초: 0, 표준: 1, 심화: 2 };

export const PROBLEMS = [...direct, ...contrapositive, ...contradiction, ...induction];

/** 연습 명제와 연구 명제(AI와 탐구하기)를 모두 찾는다. 연구 명제는 연습 목록(PROBLEMS)에는 넣지 않는다. */
export function getProblem(id) {
  return PROBLEMS.find((problem) => problem.id === id) ?? RESEARCH_PROPOSITIONS.find((problem) => problem.id === id) ?? null;
}

export function problemsByMethod(methodId) {
  return PROBLEMS.filter((problem) => problem.method === methodId).sort(
    (a, b) => DIFFICULTY_ORDER[a.difficulty] - DIFFICULTY_ORDER[b.difficulty],
  );
}
