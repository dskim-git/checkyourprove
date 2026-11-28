// "AI는 어떻게 답할까?" 원리 활동 분석: 처음 고른 답의 정답률(문항·묶음별), 자주 고른 오답, 걸린 시간, 마무리 답

import { PRINCIPLE_ITEMS, PRINCIPLE_PARTS } from '../data/principleActivity.js';

const round1 = (v) => (v == null ? null : Math.round(v * 10) / 10);

/** 학생 한 명: { finished, answered, correct, total, minutes } 또는 null(기록 없음) */
export function principleScore(student) {
  const pr = student.record.principle;
  if (!pr) return null;
  const answers = Object.values(pr.answers ?? {});
  return {
    finished: Boolean(pr.finishedAt),
    answered: answers.length,
    correct: answers.filter((a) => a.correct).length,
    total: PRINCIPLE_ITEMS.length,
    minutes: round1((pr.activeMs ?? 0) / 60000),
    reflection: pr.reflection ?? '',
  };
}

export function principleStats(students) {
  const recs = students.map((s) => ({ s, pr: s.record.principle })).filter((x) => x.pr?.finishedAt);
  const items = PRINCIPLE_ITEMS.map((it, i) => {
    const answers = recs.map((x) => x.pr.answers?.[it.id]).filter(Boolean);
    const counts = it.options.map((_, k) => answers.filter((a) => a.choice === k).length);
    const wrong = counts.map((c, k) => ({ k, c })).filter((x) => x.k !== it.answer && x.c > 0).sort((a, b) => b.c - a.c)[0];
    const secs = answers.map((a) => a.ms).filter((v) => v != null);
    return {
      item: it,
      num: i + 1,
      n: answers.length,
      rate: answers.length ? Math.round((answers.filter((a) => a.correct).length / answers.length) * 100) : null,
      counts,
      topWrong: wrong ? { option: it.options[wrong.k], count: wrong.c } : null,
      seconds: secs.length ? Math.round(secs.reduce((a, b) => a + b, 0) / secs.length / 1000) : null,
    };
  });
  const parts = PRINCIPLE_PARTS.map((p) => {
    const its = items.filter((x) => x.item.part === p.id && x.n);
    const n = its.reduce((s, x) => s + x.n, 0);
    const right = its.reduce((s, x) => s + Math.round((x.rate / 100) * x.n), 0);
    return { ...p, rate: n ? Math.round((right / n) * 100) : null };
  });
  const scores = recs.map((x) => principleScore(x.s));
  return {
    n: recs.length,
    meanCorrect: scores.length ? round1(scores.reduce((a, b) => a + b.correct, 0) / scores.length) : null,
    meanMinutes: scores.length ? round1(scores.reduce((a, b) => a + b.minutes, 0) / scores.length) : null,
    items,
    parts,
    reflections: recs.map((x) => ({ who: x.s.pseudonym, text: x.pr.reflection })).filter((r) => r.text),
  };
}

// ── 진행 화면의 응답 현황 (2026-11-28 사용자 요청): 회차의 모든 학생(마치지 않은 학생 포함), 처음 고른 답 기준 ──

/** 문항 하나: { started(활동을 시작한 학생), answered, correct, rate, seconds, options: [{ text, isAnswer, count, students: [가명] }] } */
export function itemResponses(students, item) {
  const recs = students.filter((s) => s.record?.principle);
  const answered = recs.map((s) => ({ s, a: s.record.principle.answers?.[item.id] })).filter((x) => x.a);
  const secs = answered.map((x) => x.a.ms).filter((v) => v != null);
  return {
    started: recs.length,
    answered: answered.length,
    correct: answered.filter((x) => x.a.correct).length,
    rate: answered.length ? Math.round((answered.filter((x) => x.a.correct).length / answered.length) * 100) : null,
    seconds: secs.length ? Math.round(secs.reduce((a, b) => a + b, 0) / secs.length / 1000) : null,
    options: item.options.map((text, k) => {
      const who = answered.filter((x) => x.a.choice === k).map((x) => x.s.pseudonym);
      return { text, isAnswer: k === item.answer, count: who.length, students: who };
    }),
    waiting: recs.filter((s) => !s.record.principle.answers?.[item.id]).map((s) => s.pseudonym),
  };
}

/** 설명 화면 하나를 본 학생 수 */
export function slideViews(students, slideId) {
  const recs = students.filter((s) => s.record?.principle);
  return { started: recs.length, seen: recs.filter((s) => s.record.principle.slides?.[slideId]).length };
}

/** 마무리 답(쓴 학생만) */
export function reflectionList(students) {
  return students.filter((s) => s.record?.principle?.reflection).map((s) => ({ who: s.pseudonym, text: s.record.principle.reflection, done: Boolean(s.record.principle.finishedAt) }));
}
