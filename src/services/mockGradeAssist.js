// 교사용 AI 채점 도우미 (더미): 학생 증명을 루브릭 기준마다 판단해 점수와 근거를 제안한다.
// 실제 AI 연결 전 임시 규칙이다. 명제의 예시 증명 단계(steps)와 핵심 표현(check)을 기준으로 판단하므로,
// 예시와 아주 다른 방식의 올바른 증명은 낮게 판단할 수 있다(화면에 안내한다).
// 제안은 참고용이며 교사의 점수를 대신하지 않는다.
// TODO(로드맵 5단계): 서버가 buildGradeAssistRequest의 입력과 gradeAssistSystemPrompt로 실제 AI를 부르고,
//   기준별 { score, reason }을 구조화된 JSON으로 받는다. 이 규칙은 그때 비교용으로만 남긴다.

import { getProblem } from '../data/problems/index.js';
import { checkGroups } from '../data/proofModel.js';
import { matchRatio, normalizeMath, shapeOf } from './textMatch.js';

const METHOD_NAMES = { direct: '직접증명', contrapositive: '대우를 이용한 증명', contradiction: '귀류법', cases: '수 대입·경우 확인', other: '기타' };

const stepCovered = (text, step) => {
  const groups = checkGroups(step);
  return groups.length > 0 && matchRatio(text, groups) >= 0.5;
};

/** 예시 증명의 계산 단계에서 등호로 이어진 식들. 계산 단계 = 쉼표나 글 없이 "가 = 나 = 다"로 이어진 식이 있는 단계 */
function calcPieces(problem) {
  return (problem.steps ?? [])
    .map((step) => step.text.replace(/\{\{([^|}]+)[^}]*\}\}/g, '$1'))
    .flatMap((text) => text.match(/[^=,가-힣"]+(?:=[^=,가-힣"]+){2,}/g) ?? [])
    .flatMap((chain) => chain.split('=').map((piece) => piece.trim()).filter((piece) => normalizeMath(piece).length >= 3));
}

function detectMethod(norm) {
  const numeric = numericSubstitutions(norm);
  if (norm.includes('대우')) return 'contrapositive';
  if (norm.includes('모순') && /가정|라하자|라고하자|라하면/.test(norm)) return 'contradiction';
  if (numeric >= 2 && !isGeneral(norm)) return 'cases';
  return 'direct';
}

const numericSubstitutions = (norm) => (norm.match(/[a-z]=\d+(이면|일때|이라면|일경우)/g) ?? []).length
  + (norm.match(/[a-z]=\d+,[a-z]=\d+/g) ?? []).length;
const isGeneral = (norm) => /[a-z]=\d*[a-z]/.test(norm) || /\([a-z][+\-*]/.test(norm);

/**
 * 루브릭 기준마다 점수와 근거를 제안한다.
 * @param {{ problem, proofText, chosenMethod }} input
 */
export function assessProof({ problem, proofText, chosenMethod }) {
  const text = String(proofText ?? '');
  const norm = normalizeMath(text);
  const reasons = {};
  const criteria = {};
  if (norm.length < 4) {
    ['logic', 'generality', 'method', 'formal', 'calculation', 'concise', 'conclusion'].forEach((id) => {
      criteria[id] = 0;
      reasons[id] = '쓴 내용이 거의 없어 판단할 수 없습니다.';
    });
    return { criteria, reasons, completeness: 'none', actualMethod: 'unclear', summary: '쓴 내용이 없습니다.' };
  }

  const steps = problem.steps ?? [];
  const covered = steps.map((step) => stepCovered(text, step));
  const coverage = steps.length ? covered.filter(Boolean).length / steps.length : 0;
  const missing = steps.filter((_, i) => !covered[i]);

  // 계산 과정: 예시의 계산 단계에서 등호로 이어진 식이 (문자 이름과 관계없이) 드러나는가
  const pieces = calcPieces(problem);
  const shape = shapeOf(text);
  const foundPieces = pieces.filter((piece) => shape.includes(shapeOf(piece)));
  const calcOk = !pieces.length || foundPieces.length / pieces.length >= 0.75;
  const calcMissing = pieces.filter((piece) => !shape.includes(shapeOf(piece)));

  // 1 논리적 타당성
  let logic = coverage >= 0.9 ? 3 : coverage >= 0.6 ? 2 : coverage >= 0.3 ? 1 : 0;
  const logicNotes = [`예시 증명의 핵심 단계 ${steps.length}개 중 ${covered.filter(Boolean).length}개가 드러납니다.`];
  if (missing.length) logicNotes.push(`드러나지 않은 단계: "${missing[0].text.replace(/\{\{([^|}]+)[^}]*\}\}/g, '$1')}"${missing.length > 1 ? ` 외 ${missing.length - 1}개` : ''}.`);
  if (!calcOk && logic === 3) {
    logic = 2;
    logicNotes.push('단계는 모두 있지만 계산 단계에 오류가 있어 다음 단계로 정확히 이어지지 않습니다.');
  }
  criteria.logic = logic;
  reasons.logic = logicNotes.join(' ');

  // 2 일반성
  const numeric = numericSubstitutions(norm);
  const general = isGeneral(norm);
  criteria.generality = general && !numeric ? 2 : general ? 1 : 0;
  reasons.generality = general && !numeric
    ? '문자를 써서 모든 경우를 한꺼번에 다룹니다.'
    : general ? '문자를 쓴 일반적인 설명과 특정 수 대입이 섞여 있습니다.'
      : numeric ? `특정 수를 대입해 확인한 것(${numeric}곳)에 그칩니다.` : '모든 경우를 다룬다고 볼 문자식이 보이지 않습니다.';

  // 3 증명법 일치
  const detected = detectMethod(norm);
  if (!chosenMethod || chosenMethod === 'other') {
    criteria.method = 1;
    reasons.method = `선택한 증명법이 "기타"이거나 없어 일치 여부는 채점자가 판단해 주세요. 글에서 보이는 방법: ${METHOD_NAMES[detected]}.`;
  } else {
    criteria.method = detected === chosenMethod ? 1 : 0;
    reasons.method = detected === chosenMethod
      ? `고른 증명법(${METHOD_NAMES[chosenMethod]})의 구조를 따릅니다.`
      : `고른 증명법은 ${METHOD_NAMES[chosenMethod]}인데, 글은 ${METHOD_NAMES[detected]}의 구조로 보입니다.`;
  }

  // 4 형식적 표현
  const range = text.match(/(0\s*이상의\s*정수|정수|자연수)/);
  criteria.formal = range ? 1 : 0;
  reasons.formal = range ? `문자의 범위를 밝혔습니다("${range[0]}").` : '문자가 어떤 수(정수, 자연수 등)인지 밝히지 않았습니다.';

  // 5 계산 과정
  criteria.calculation = calcOk ? 1 : 0;
  reasons.calculation = !pieces.length
    ? '이 명제는 긴 계산이 필요하지 않습니다.'
    : calcOk ? '필요한 계산 과정이 드러나고 예시의 식과 맞습니다.'
      : `예시의 계산과 맞지 않거나 빠진 식이 있습니다: ${calcMissing.slice(0, 2).map((p) => `"${p}"`).join(', ')}.`;

  // 6 간결성
  const exampleLength = normalizeMath(steps.map((s) => s.text).join('')).length || 1;
  const ratio = norm.length / exampleLength;
  criteria.concise = ratio <= 2 ? 1 : 0;
  reasons.concise = ratio <= 2 ? '불필요하게 길거나 흐름을 가리는 내용은 보이지 않습니다.' : `예시 증명보다 ${ratio.toFixed(1)}배 길어 불필요한 내용이 흐름을 가릴 수 있습니다.`;

  // 7 결론
  const claim = normalizeMath(problem.statement.split('이면').at(-1)).replace(/[.。]$/, '');
  const lastOk = steps.length ? stepCovered(text, steps.at(-1)) : false;
  const conclusionOk = lastOk || (claim.length >= 4 && norm.includes(claim));
  criteria.conclusion = conclusionOk ? 1 : 0;
  reasons.conclusion = conclusionOk ? '명제의 결론을 분명히 맺었습니다.' : '증명이 명제의 결론으로 마무리되지 않았습니다.';

  const completeness = logic >= 2 && conclusionOk ? 'complete' : 'partial';
  const total = Object.values(criteria).reduce((s, v) => s + v, 0);
  return {
    criteria,
    reasons,
    completeness,
    actualMethod: detected,
    summary: `${total}점으로 판단했습니다. ${completeness === 'complete' ? '증명을 끝까지 완성했습니다.' : '증명이 중간에 멈추었거나 핵심 단계가 빠졌습니다.'}`,
  };
}

/** 요청을 받아 잠시 뒤 제안을 돌려준다(실제 AI 호출을 흉내 냄) */
export async function requestGradeAssist(request, { delay = 600 } = {}) {
  await new Promise((resolve) => { setTimeout(resolve, delay); });
  const { propositionId, proofText, chosenMethod } = request.input;
  return assessProof({ problem: getProblem(propositionId), proofText, chosenMethod });
}
