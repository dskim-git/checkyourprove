// 연구 모드 2단계 확인 도구
// 1) AI 답이 이 명제의 증명 도움을 실제로 담았는가 (증명 단계의 핵심 표현을 얼마나 담았는지)
// 2) 학생이 옮겨 적은 AI 증명이 AI 답에서 온 내용인가 (대충 적고 넘어가는 것을 막는다)
// TODO: 실제 AI를 연결하면 서버가 AI 응답과 함께 "증명 포함 여부"를 구조화해 돌려주고, 이 계산은 보조 확인으로 쓴다.

import { checkGroups } from '../data/proofModel.js';
import { containment, matchRatio, normalizeMath } from './textMatch.js';

/** AI 답이 증명 도움으로 인정되려면 덮어야 하는 증명 단계 비율 */
export const PROOF_HELP_MIN = 0.6;
/** 옮겨 적은 글 중 AI 답에서 온 내용의 최소 비율, 최소 길이(공백 제외 글자 수) */
export const TRANSCRIPT_MIN = 0.5;
export const TRANSCRIPT_MIN_LENGTH = 15;

/** 글이 명제 증명의 단계 중 얼마를 담았는지 0~1 (단계의 핵심 표현을 절반 이상 담으면 그 단계를 담은 것으로 본다) */
export function proofCoverage(text, problem) {
  const steps = problem?.steps ?? [];
  if (!steps.length) return 0;
  const covered = steps.filter((step) => {
    const groups = checkGroups(step);
    return groups.length > 0 && matchRatio(text, groups) >= 0.5;
  });
  return covered.length / steps.length;
}

/** 옮겨 적은 글이 AI 답들에서 온 정도 0~1 */
export function transcriptMatch(transcript, aiTexts) {
  const joined = aiTexts.join('\n');
  return joined ? containment(transcript, joined) : 0;
}

/** 옮겨 적은 글이 AI 답의 이 비율 이상 길이여야 한다(명제만 베껴 쓰는 것을 막는다) */
export const TRANSCRIPT_MIN_SHARE = 0.3;

/**
 * 옮겨 적기 확인. helpTexts는 증명 도움으로 인정된 AI 답들이다.
 * AI 답에서 온 내용이 절반 이상이고, 가장 긴 답의 30% 이상 길이여야 한다(일부만 옮겨 적은 것은 허용).
 */
export function transcriptOk(transcript, helpTexts) {
  const length = normalizeMath(transcript).length;
  const longest = Math.max(0, ...helpTexts.map((t) => normalizeMath(t).length));
  return length >= Math.max(TRANSCRIPT_MIN_LENGTH, longest * TRANSCRIPT_MIN_SHARE)
    && transcriptMatch(transcript, helpTexts) >= TRANSCRIPT_MIN;
}
