// 더미 AI 점검·코치·채점 (프로토타입 전용)
//
// 실제 AI 대신 명제마다 정해 둔 단계별 핵심 표현과 예시 단계 문장을 기준으로 "느슨하게" 판단한다.
// - 문자 이름이 달라도(예: k 대신 t) 식의 모양이 같으면 인정한다.
// - 같은 뜻의 말(예: "모순" ↔ "성립하지 않는다")을 인정한다.
// - 핵심 표현이 일부만 있어도 예시 단계와 흐름이 비슷하면 인정한다.
// 판정과 함께 잘 쓴 부분, 고칠 부분, 고치는 방법을 돌려준다. 다시 시도할수록 안내가 구체적이 된다.
// TODO: 서버 측 엔드포인트가 준비되면 각 함수를 서버 호출로 바꾼다. 함수 이름·인자·반환 형태는 유지한다.

import { getProblem } from '../data/problems/index.js';
import { checkGroups, stepText } from '../data/proofModel.js';
import { containsPattern, matchGroups, normalizeMath, similarity, splitSentences } from './textMatch.js';

const RESPONSE_DELAY_MS = 500;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 판정 기준 (느슨하게): 핵심 표현 절반 이상 또는 예시 단계와 비슷한 흐름이면 통과로 인정
const PARTIAL_RATIO = 0.5;
const SIM_PASS = 0.6;
const SIM_PARTIAL = 0.4;
const SIM_LOCATE = 0.25;
const SIM_STATEMENT_COPY = 0.7;

const pretty = (pattern) => {
  const shown = pattern.replace(/\^2/g, '²').replace(/\^3/g, '³').replace(/\*/g, '×');
  return shown.endsWith('(') ? `${shown}…)` : shown;
};
/** 식을 세운 흔적이 있는지 (숫자·문자 사이의 연산 기호) */
const hasMath = (text) => /[0-9a-z²)][+\-=*^/<>≤≥≠][0-9a-z(√]/.test(normalizeMath(text));

/** 묶음 안에서 학생 글에 실제로 들어 있는 표현 (같은 뜻의 말로 맞았으면 표시) */
function foundLabel(text, group) {
  const value = normalizeMath(text).replace(/\*/g, '');
  const literal = group.find((pattern) => value.includes(normalizeMath(pattern).replace(/\*/g, '')));
  if (literal) return pretty(literal);
  const matched = group.find((pattern) => containsPattern(text, pattern)) ?? group[0];
  return `${pretty(matched)}(같은 뜻의 표현)`;
}
const isWordGroup = (group) => /[가-힣]/.test(group[0]);
const shorten = (text, max = 40) => (text.length > max ? `${text.slice(0, max)}…` : text);

/** 식을 문자만 가린 모양으로 보여 준다. 예: 2(m+n+1) → 2(□+□+1) */
function maskExpr(pattern) {
  return pretty(pattern).replace(/[a-zA-Z]/g, '□');
}

/** 빠진 핵심 표현 하나에 대한 안내 (시도가 거듭될수록 구체적으로) */
function describeMissing(group, tries, text = '') {
  const label = group[0];
  if (isWordGroup(group)) {
    return tries < 1
      ? '이 단계의 근거나 결론을 말로 분명히 밝혀 주세요.'
      : `"${pretty(label)}"에 해당하는 내용이 보이지 않아요. 같은 뜻의 다른 말로 써도 괜찮아요.`;
  }
  const start = hasMath(text)
    ? '식을 세운 방향은 좋아요. 다만 이 단계에서 보여야 할 꼴까지 정리되지 않았어요.'
    : '이 단계에 필요한 식이 아직 보이지 않아요.';
  return tries < 1
    ? start
    : `${hasMath(text) ? '식을 ' : ''}${maskExpr(label)} 꼴로 나타내야 해요. □에는 앞에서 정한 문자를 쓰면 됩니다.`;
}

/** 학생 글(한 단계 분량)과 예시 단계 하나를 비교한다. */
function analyzeStep(text, step) {
  const groups = checkGroups(step);
  const hits = matchGroups(text, groups);
  const ratio = groups.length ? hits.filter(Boolean).length / groups.length : normalizeMath(text).length >= 8 ? 1 : 0;
  const sim = text ? similarity(text, stepText(step)) : 0;

  // 비슷한 흐름은 핵심 표현이 하나라도 있을 때만 보태고, 아주 비슷하면 그대로 인정한다.
  const simScore = sim >= SIM_PASS ? 1 : sim >= SIM_PARTIAL && ratio > 0 ? PARTIAL_RATIO : 0;
  const score = Math.max(ratio, simScore);
  const verdict = score >= 0.99 ? 'pass' : score >= PARTIAL_RATIO ? 'partial' : 'fail';
  return {
    verdict,
    score,
    ratio,
    sim,
    found: groups.filter((_, i) => hits[i]).map((g) => foundLabel(text, g)),
    wroteMath: hasMath(text),
    missing: groups.filter((_, i) => !hits[i]),
  };
}

/**
 * 명제를 그대로 옮겨 쓴 문장은 증명의 근거로 보지 않는다(결론 단계 제외).
 * @returns {{ text: string, sentences: string[], copied: boolean }}
 */
function withoutStatementCopy(text, problem, stepIndex) {
  const sentences = splitSentences(text);
  if (stepIndex === problem.steps.length - 1) return { text, sentences, copied: false };
  const kept = sentences.filter((sentence) => similarity(sentence, problem.statement) < SIM_STATEMENT_COPY);
  return { text: kept.join('\n'), sentences: kept, copied: kept.length < sentences.length };
}

function goodPoints(analysis) {
  if (analysis.found.length) return [`핵심 표현 ${analysis.found.map((f) => `"${f}"`).join(', ')}이(가) 잘 드러나 있어요.`];
  if (analysis.sim >= SIM_PARTIAL) return ['예시 증명과 비슷한 흐름으로 썼어요.'];
  if (analysis.wroteMath) return ['식을 세워 계산을 시작한 점은 좋아요.'];
  return [];
}

/**
 * 한 단계 점검.
 * @returns {{ verdict: 'pass'|'partial'|'fail', passed: boolean, message: string, good: string[], fixes: string[], how: string }}
 */
export async function requestStepCheck(request) {
  await delay(RESPONSE_DELAY_MS);
  const { propositionId, stepIndex, studentStep, previousSteps = [], tries = 0 } = request.input;
  const problem = getProblem(propositionId);
  const step = problem.steps[stepIndex];
  const own = withoutStatementCopy(studentStep, problem, stepIndex);
  const analysis = analyzeStep(own.text, step);
  const fixes = [];
  if (own.copied && analysis.verdict === 'fail') {
    fixes.push('명제를 그대로 옮겨 쓴 부분은 근거로 볼 수 없어요. 이 단계에서 새로 밝히는 내용을 써 주세요.');
  }

  if (normalizeMath(studentStep).length < 6) {
    return {
      verdict: 'fail',
      passed: false,
      message: '조금 더 써 주세요.',
      good: [],
      fixes: ['글이 너무 짧아서 점검하기 어려워요. 이 단계에서 하려는 일을 한두 문장으로 써 보세요. 막혔다면 아래 안내부터 시작해 보세요.'],
      how: step.hint,
    };
  }

  if (analysis.verdict === 'fail') {
    const next = problem.steps[stepIndex + 1];
    const prev = problem.steps[stepIndex - 1];
    if (next && analyzeStep(own.text, next).verdict !== 'fail') {
      fixes.push(`쓴 내용은 다음(${stepIndex + 2}번째) 단계에 더 가까워요. 그 내용으로 가기 전에 이 단계가 먼저 필요해요.`);
    } else if (prev && previousSteps.length && analyzeStep(own.text, prev).verdict === 'pass') {
      fixes.push('앞 단계와 거의 같은 내용이에요. 앞 단계에서 한 걸음 더 나아가 보세요.');
    }
  }
  if (analysis.verdict !== 'pass') {
    analysis.missing.forEach((group) => fixes.push(describeMissing(group, tries, own.text)));
  }

  const messages = {
    pass: '좋아요! 이 단계에 필요한 내용이 잘 드러나 있어요.',
    partial: '방향이 맞아요. 이 단계는 통과로 인정할게요. 아래 내용을 더하면 더 탄탄한 증명이 됩니다.',
    fail: '아직 이 단계에 필요한 내용이 부족해요. 아래를 참고해 고쳐 보세요.',
  };
  return {
    verdict: analysis.verdict,
    passed: analysis.verdict !== 'fail',
    message: messages[analysis.verdict],
    good: goodPoints(analysis),
    fixes,
    how: analysis.verdict === 'pass' ? '' : step.hint,
  };
}

// 증명 전체 검토에서 문장 하나가 근거로 쓰일 수 있는 최대 단계 수
// (한 문장으로 여러 단계를 한꺼번에 통과하지 못하게 한다)
const MAX_USES_PER_SENTENCE = 2;

/** 문장 하나 또는 이웃한 두 문장 묶음 */
function windowsOf(sentences) {
  const windows = sentences.map((text, i) => ({ idx: [i], text }));
  sentences.slice(0, -1).forEach((text, i) => windows.push({ idx: [i, i + 1], text: `${text}
${sentences[i + 1]}` }));
  return windows;
}

const RANK = { pass: 2, partial: 1, fail: 0 };

/** 증명 전체에서 예시 증명의 각 흐름(단계)이 어디에 어떻게 드러나는지 살핀다. */
function reviewWholeProof(problem, proof, tries) {
  const uses = new Map();
  return problem.steps.map((step, stepIndex) => {
    const own = withoutStatementCopy(proof, problem, stepIndex);
    const ranked = windowsOf(own.sentences)
      .map((window) => ({ window, analysis: analyzeStep(window.text, step) }))
      .sort((a, b) => RANK[b.analysis.verdict] - RANK[a.analysis.verdict] || b.analysis.score - a.analysis.score || b.analysis.sim - a.analysis.sim);
    const chosen = ranked.find(({ window }) => window.idx.every((i) => (uses.get(i) ?? 0) < MAX_USES_PER_SENTENCE));
    const analysis = chosen?.analysis ?? analyzeStep('', step);
    if (chosen && analysis.verdict !== 'fail') chosen.window.idx.forEach((i) => uses.set(i, (uses.get(i) ?? 0) + 1));
    const located = chosen && (analysis.ratio > 0 || analysis.sim >= SIM_LOCATE) ? own.sentences[chosen.window.idx[0]] : null;

    let where = null;
    let fixes = [];
    if (analysis.verdict !== 'pass') {
      where = located
        ? `내 증명의 "${shorten(located)}" 부분`
        : stepIndex === 0
          ? '증명의 시작 부분'
          : `${stepIndex}번째 흐름 다음`;
      fixes = located
        ? analysis.missing.map((group) => describeMissing(group, tries, located))
        : ['이 흐름에 해당하는 내용을 찾지 못했어요. 빠졌다면 이 자리에 넣어 보세요.', ...(tries >= 1 ? analysis.missing.map((group) => describeMissing(group, tries)) : [])];
    }
    return {
      stepNumber: stepIndex + 1,
      verdict: analysis.verdict,
      ratio: analysis.ratio,
      score: analysis.verdict === 'pass' ? 1 : analysis.verdict === 'partial' ? 0.75 : analysis.ratio > 0 || analysis.sim >= SIM_LOCATE ? 0.3 : 0,
      where,
      fixes,
      how: analysis.verdict === 'pass' ? '' : step.hint,
    };
  });
}

/**
 * AI 코치 검토: 증명 전체에서 각 흐름이 드러나는지 보고, 어디를 어떻게 고칠지 알려 준다.
 * @returns {{ complete: boolean, summary: string, strengths: string[], items: object[], suggestions: string[] }}
 */
export async function requestCoachReview(request) {
  await delay(RESPONSE_DELAY_MS);
  const { propositionId, studentProof, round = 1 } = request.input;
  const problem = getProblem(propositionId);
  const items = reviewWholeProof(problem, studentProof, round - 1);
  const total = items.length;
  const passed = items.filter((item) => item.verdict === 'pass');
  const weak = items.filter((item) => item.verdict === 'fail');
  const partial = items.filter((item) => item.verdict === 'partial');
  const strengths = passed.length
    ? [`${passed.map((item) => `${item.stepNumber}번째`).join(', ')} 흐름이 잘 드러나 있어요.`]
    : [];

  if (!weak.length) {
    return {
      complete: true,
      summary: partial.length
        ? `증명의 주요 흐름 ${total}가지가 모두 드러나 있어 증명이 완성되었어요. 표시한 부분을 다듬으면 더 좋은 증명이 됩니다.`
        : `증명의 주요 흐름 ${total}가지가 모두 잘 드러나 있어요. 증명이 완성되었습니다.`,
      strengths,
      items: partial,
      suggestions: [],
    };
  }
  return {
    complete: false,
    summary: `증명의 주요 흐름 ${total}가지 중 ${total - weak.length}가지가 드러나 있어요. 아래 "고칠 곳"을 보고 고친 뒤 다시 보여 주세요.`,
    strengths,
    items: [...weak, ...partial].sort((a, b) => a.stepNumber - b.stepNumber),
    suggestions: [],
  };
}

/**
 * 채점: 흐름(단계)마다 충분 1점, 부분 0.75점, 부족 0~0.3점으로 계산해 100점 만점으로 환산한다.
 * @returns {{ score: number, breakdown: object[], comment: string }}
 */
export async function requestGrade(request) {
  await delay(RESPONSE_DELAY_MS);
  const { propositionId, studentProof } = request.input;
  const problem = getProblem(propositionId);
  const items = reviewWholeProof(problem, studentProof, 1);
  const breakdown = items.map((item) => ({ ...item, stepIndex: item.stepNumber - 1 }));
  const score = Math.round((breakdown.reduce((sum, item) => sum + item.score, 0) / breakdown.length) * 100);
  const comment = score >= 90
    ? '증명의 흐름이 빠짐없이 잘 드러나 있습니다.'
    : score >= 70
      ? '증명의 큰 흐름은 갖추었지만 근거가 부족한 단계가 있습니다. 아래 표의 "고칠 점"을 확인해 보세요.'
      : '증명의 중요한 단계가 여럿 빠져 있습니다. 아래 표의 "고칠 점"을 확인하고 앞 단계 활동으로 다시 연습해 보세요.';
  return { score, breakdown, comment };
}
