// 빈칸 고르기(객관식)의 보기 만들기
// 정답 1개 + 오답 3개. 오답은 정답을 조금 바꾼 그럴듯한 식과, 다른 빈칸의 정답에서 고른다.
// 문자 이름만 바꾼 식(예: 2m+1 → 2n+1)은 맥락상 정답일 수도 있으므로 오답에서 뺀다.

import { PROBLEMS } from '../../../data/problems/index.js';
import { blanksOf } from '../../../data/proofModel.js';
import { isSameAnswer, normalizeMath, shapeOf } from '../../../services/textMatch.js';
import { shuffle } from './kit.js';

const DISTRACTORS = 3;
const isWord = (text) => /[가-힣]/.test(text);

const OPPOSITES = [['≥', '≤'], ['>', '<'], ['=', '≠'], ['짝수', '홀수'], ['유리수', '무리수'], ['참', '거짓'], ['또는', '이고'], ['존재', '유일']];

/** 정답을 살짝 바꾼 오답 후보 */
function mutations(answer) {
  const out = [];
  OPPOSITES.forEach(([a, b]) => {
    if (answer.includes(a)) out.push(answer.replace(a, b));
    else if (answer.includes(b)) out.push(answer.replace(b, a));
  });
  if (/^\d+$/.test(answer.trim())) {
    const n = Number(answer);
    out.push(String(n + 1), String(Math.max(0, n - 1)), String(n * 2));
  }
  if (answer.includes(' + ')) out.push(answer.replace(' + ', ' − '));
  if (/\+ ?1\)?$/.test(answer)) out.push(answer.replace(/\+ ?1(\)?)$/, '− 1$1'));
  const digit = answer.match(/[2-8]/);
  if (digit && !isWord(answer)) out.push(answer.replace(digit[0], String(Number(digit[0]) + 1)));
  if (/\)$/.test(answer) && answer.startsWith('2(')) out.push(answer.slice(2, -1));
  return out;
}

let poolCache = null;
function answerPool() {
  poolCache ??= PROBLEMS.flatMap((p) => blanksOf(p).map((b) => ({ method: p.method, problemId: p.id, answer: b.answers[0] })));
  return poolCache;
}

/** 빈칸 하나의 보기(섞인 순서) */
export function choicesFor(problem, blank) {
  const correct = blank.answers[0];
  const word = isWord(correct);
  const seen = new Set([normalizeMath(correct)]);
  const ok = (candidate) => {
    const key = normalizeMath(candidate);
    if (!key || seen.has(key) || isSameAnswer(candidate, blank.answers)) return false;
    if (!word && blank.answers.some((answer) => shapeOf(answer) === shapeOf(candidate))) return false;
    seen.add(key);
    return true;
  };

  const picked = shuffle(mutations(correct)).filter(ok).slice(0, 2);
  const pool = answerPool().filter((item) => isWord(item.answer) === word);
  const ranked = [
    ...shuffle(pool.filter((item) => item.problemId === problem.id)),
    ...shuffle(pool.filter((item) => item.problemId !== problem.id && item.method === problem.method)),
    ...shuffle(pool.filter((item) => item.method !== problem.method)),
  ];
  for (const item of ranked) {
    if (picked.length >= DISTRACTORS) break;
    if (ok(item.answer)) picked.push(item.answer);
  }
  return shuffle([correct, ...picked]);
}

export function choicesForProblem(problem) {
  return Object.fromEntries(blanksOf(problem).map((blank) => [blank.id, choicesFor(problem, blank)]));
}
