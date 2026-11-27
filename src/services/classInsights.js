// 학급 단위 분석 (연구 분석 개요): AI 답변 수용 정도, 학생이 찾은 부족한 점(3단계 체크리스트) 통계,
// 개방형 답변의 낱말 빈도(워드클라우드). 학생·명제 단위 기록을 모아 센다. 원본 기록은 읽기만 한다.

import { CHECKLIST_NONE, MORE_ACCURATE_OPTIONS, REVISION_CHECKLIST, STUCK_RESOLVED_OPTIONS } from '../data/research.js';
import { DEFAULT_RUBRIC } from '../data/rubric.js';

/** 개방형 문항: 워드클라우드로 볼 수 있는 답 */
export const OPEN_QUESTIONS = [
  { id: 'stuck', stage: 1, label: '1단계 어려웠던 점·막힌 점' },
  { id: 'notable', stage: 2, label: '2단계 AI 답변에서 특징적인 점' },
  { id: 'compareNote', stage: 3, label: '3단계 두 증명의 공통점과 차이점' },
  { id: 'myAdvantage', stage: 3, label: '3단계 내 증명이 AI보다 나은 점' },
  { id: 'aiIssues', stage: 3, label: '3단계 AI 증명에서 보완할 부분' },
  { id: 'aiHelpful', stage: 3, label: '3단계 AI 답변 중 도움이 된 점' },
  { id: 'plan', stage: 3, label: '3단계 최종 증명 활용 계획' },
  { id: 'aiOpinion', stage: 3, label: '3단계 AI에 대한 의견' },
  { id: 'usedFromMine', stage: 4, label: '4단계 나의 증명에서 가져온 부분' },
  { id: 'usedFromAi', stage: 4, label: '4단계 AI의 증명에서 가져온 부분' },
];

const NONE_ANSWERS = /^(없음|없다|없어요|없습니다|찾지\s*못함|찾지\s*못했다|모름|모르겠음|x|-|\.)$/i;

/** 쓸 내용이 없다고 한 답("없음", "찾지 못함" 등)인가 */
export const isNoneAnswer = (text) => NONE_ANSWERS.test(String(text ?? '').trim());

const PCT = (n, d) => (d ? Math.round((n / d) * 100) : null);

/** analyses: services/analysis.js의 analyzeStudent 결과 목록 */
export function acceptanceStats(analyses) {
  const props = analyses.flatMap((a) => a.props);
  const ratios = props.map((p) => p.ratioMine).filter((v) => v != null);
  const histogram = Array.from({ length: 11 }, (_, i) => ({ value: i, count: ratios.filter((r) => r === i).length }));
  const accurate = MORE_ACCURATE_OPTIONS.map((o) => ({ ...o, count: props.filter((p) => p.s3?.moreAccurate === o.id).length }));
  const resolved = STUCK_RESOLVED_OPTIONS.map((o) => ({ ...o, count: props.filter((p) => p.s3?.stuckResolved === o.id).length }));
  // 증명법: 1단계(나) → 4단계(최종)와 2단계 AI 증명법
  const methodFlow = { same: 0, toAi: 0, keep: 0, other: 0 };
  let methodN = 0;
  props.forEach((p) => {
    const [m1, m2, m4] = [p.methods[1], p.methods[2], p.methods[4]];
    if (!m1 || !m4) return;
    methodN += 1;
    if (m1 === m2) methodFlow.same += 1;
    else if (m4 === m2) methodFlow.toAi += 1;
    else if (m4 === m1) methodFlow.keep += 1;
    else methodFlow.other += 1;
  });
  const conf = (n) => {
    const xs = props.map((p) => p.confidence[n]).filter((v) => v != null);
    return xs.length ? Math.round((xs.reduce((s, v) => s + v, 0) / xs.length) * 10) / 10 : null;
  };
  const meanRatio = ratios.length ? ratios.reduce((s, v) => s + v, 0) / ratios.length : null;
  return {
    n: props.length,
    meanAiShare: meanRatio == null ? null : Math.round(100 - meanRatio * 10),
    histogram,
    accurate,
    aiMoreAccurate: PCT(accurate.find((o) => o.id === 'ai').count, accurate.reduce((s, o) => s + o.count, 0)),
    resolved,
    methodFlow: [
      { id: 'same', label: '처음부터 AI와 같은 증명법', count: methodFlow.same },
      { id: 'toAi', label: 'AI의 증명법으로 바꿈', count: methodFlow.toAi },
      { id: 'keep', label: '내 증명법을 지킴 (AI와 다름)', count: methodFlow.keep },
      { id: 'other', label: '또 다른 증명법으로 바꿈', count: methodFlow.other },
    ],
    toAiRate: PCT(methodFlow.toAi, methodFlow.toAi + methodFlow.keep + methodFlow.other),
    confidence: { 1: conf(1), 2: conf(2), 4: conf(4) },
  };
}

/** 3단계 체크리스트 통계: 학생이 체크한 수와, 짝이 되는 기준에서 교사(점수 출처)가 만점보다 낮게 준 수 */
export function checklistStats(analyses) {
  const props = analyses.flatMap((a) => a.props);
  const row = (kind) => [...REVISION_CHECKLIST, CHECKLIST_NONE].map((c) => {
    const criterion = DEFAULT_RUBRIC.find((r) => r.pair === c.id);
    const checked = props.filter((p) => (p.s3?.[kind === 'mine' ? 'myChecklist' : 'aiChecklist'] ?? []).includes(c.id)).length;
    const stage = kind === 'mine' ? 1 : 2;
    const graded = criterion ? props.filter((p) => p.score[stage]?.criteria?.[criterion.id] != null) : [];
    const lacks = criterion ? graded.filter((p) => p.score[stage].criteria[criterion.id] < criterion.max).length : null;
    return { id: c.id, label: c.label, checked, lacks, graded: graded.length };
  });
  return { n: props.filter((p) => p.s3).length, mine: row('mine'), ai: row('ai') };
}

/** 개방형 답 모으기: [{ text, who, prop }] */
export function openAnswers(analyses, field) {
  const q = OPEN_QUESTIONS.find((x) => x.id === field);
  return analyses.flatMap((a) => a.props.map((p) => {
    const item = { 1: p.s1, 2: p.s2, 3: p.s3, 4: p.s4 }[q.stage];
    return { text: String(item?.[field] ?? '').trim(), who: a.student.pseudonym, prop: p.propIndex + 1 };
  })).filter((x) => x.text);
}

// ── 낱말 빈도 (외부 라이브러리 없이: 글자·숫자 덩어리로 나누고 조사·어미를 떼고 흔한 말을 뺀다) ──

const SUFFIXES = [
  '었습니다', '았습니다', '었는데', '았는데', '으면서', '지만', '었다', '았다', '였다', '어서', '아서', '으면', '는데', '온다', '는다',
  '으로는', '에서는', '이라는', '이라고', '하였다', '했는데', '하기가', '해야', '하는', '해서', '하고', '하게', '하지', '했다', '한다', '했음', '하면', '하여', '해요',
  '에게', '에서', '으로', '라고', '이다', '였다', '이고', '이며', '처럼', '보다', '까지', '부터', '이나', '에는', '와는', '과는', '이라', '이었', '입니다', '습니다',
  '는지', '은', '는', '이', '가', '을', '를', '에', '의', '도', '로', '와', '과', '만', '요', '다', '게', '고', '며', '었', '았', '한',
];
/** 한 글자지만 수학에서 뜻이 있는 낱말 */
const ONE_CHAR = new Set(['식', '항', '합', '곱', '근', '값']);
const STOPWORDS = new Set([
  '것', '수', '등', '때', '더', '잘', '좀', '그', '이', '저', '및', '또', '아주', '너무', '조금', '정말', '그냥', '그리고', '하지만', '그래서', '그런데', '때문', '때문에',
  '있다', '없다', '같다', '있음', '없음', '있는', '없는', '같은', '어떤', '모두', '부분', '경우', '내가', '나의', '나는', '내', '것이', '것을', '하는', '했다', '한다',
  '않다', '않음', '않는', '하는지', '맞는지', '있는지', '본다', '보다가', '어디서', '모든', '어느', '이런', '그런', '저런', '못함', '못했다', '찾지', '거', '게', '점', '좋은', '많이', '다른', '대한', '통해', '위해', '보다', '이다', '그대로', '안', '됨', '된다', '되는',
]);

/** 낱말 하나를 다듬는다(조사·어미 떼기, 두 번까지). 한 글자 조사는 남는 글자가 1자 이상이면 뗀다. */
function stem(word) {
  let w = word;
  for (let round = 0; round < 2; round += 1) {
    const s = SUFFIXES.find((x) => w.endsWith(x) && w.length - x.length >= (x.length === 1 ? 1 : 2));
    if (!s || STOPWORDS.has(w)) break;
    w = w.slice(0, -s.length);
  }
  return w;
}

/** 글 목록의 낱말 빈도 [{ word, count, docs }] (많은 순) — docs: 그 낱말이 나온 답의 수 */
export function wordFrequencies(texts, { limit = 40 } = {}) {
  const counts = new Map();
  texts.forEach((t) => {
    const seen = new Set();
    String(t).toLowerCase().split(/[^0-9a-z가-힣²³]+/).forEach((raw) => {
      if (!raw || STOPWORDS.has(raw)) return;
      const stemmed = stem(raw);
      const word = stemmed === 'ai' ? 'AI' : stemmed;
      if ((word.length < 2 && !ONE_CHAR.has(word)) || STOPWORDS.has(word) || /^\d/.test(word)) return;
      const c = counts.get(word) ?? { word, count: 0, docs: 0 };
      c.count += 1;
      if (!seen.has(word)) {
        c.docs += 1;
        seen.add(word);
      }
      counts.set(word, c);
    });
  });
  return [...counts.values()].sort((a, b) => b.count - a.count || a.word.localeCompare(b.word)).slice(0, limit);
}
