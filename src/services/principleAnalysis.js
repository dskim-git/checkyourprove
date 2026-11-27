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
