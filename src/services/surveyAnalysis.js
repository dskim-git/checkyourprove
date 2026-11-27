// 사전·사후 설문 분석 (구현 4): 문항별 사전·사후 평균과 변화, 대응표본 효과 크기, 영역별 평균, 객관식 분포, 서술형 답
// 같은 학생의 사전·사후 응답을 짝지어(같은 가명 id) 변화를 본다. 역문항은 6 − 점수로 바꾸어 영역 평균에 넣는다.

import { reverseScore, surveyDomains } from '../data/surveyDefaults.js';
import { sessionConfig } from '../state/sessionStore.js';
import { findSurvey } from '../state/surveyStore.js';

const mean = (xs) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null);
const sd = (xs) => {
  if (xs.length < 2) return null;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, v) => s + (v - m) ** 2, 0) / (xs.length - 1));
};
const round2 = (v) => (v == null || Number.isNaN(v) ? null : Math.round(v * 100) / 100);

/** 학생의 연구 동의 상태: 'agreed' | 'withdrawn'(동의했다가 철회) | 'declined' | 'unanswered' | 'not-required' */
export function consentStatus(student) {
  if (student.sample) return 'agreed';
  if (!sessionConfig(student.session).consentRequired) return 'not-required';
  const c = student.record.consent;
  const a = c?.agreed;
  if (a === true) return 'agreed';
  if (a === false) return (c.history ?? []).some((h) => h.agreed === true) ? 'withdrawn' : 'declined';
  return 'unanswered';
}
export const CONSENT_LABELS = { agreed: '동의함', withdrawn: '철회함(철회 전 자료 사용)', declined: '참여하지 않음', unanswered: '답하지 않음', 'not-required': '동의 받지 않음' };
/** 연구 분석에 넣는가: 동의함, 동의 받지 않음, 철회함(철회 전 자료만, 2026-11-27 사용자 결정) */
export const isResearchIncluded = (student) => ['agreed', 'not-required', 'withdrawn'].includes(consentStatus(student));

/** 철회한 시각 (철회하지 않았으면 null) */
export function withdrawnAt(student) {
  if (consentStatus(student) !== 'withdrawn') return null;
  const h = student.record.consent.history ?? [];
  return [...h].reverse().find((x) => x.agreed === false)?.at ?? student.record.consent.at ?? null;
}

/**
 * 연구에 쓸 기록: 철회한 학생은 철회 전에 제출한 것만 남긴다(단계, 설문, 원리 활동). 그 밖에는 그대로.
 * 원본 기록은 바꾸지 않고 새 학생 객체를 돌려준다.
 */
export function forResearch(student) {
  const cut = withdrawnAt(student);
  if (!cut) return student;
  const limit = new Date(cut).getTime();
  const before = (t) => Boolean(t) && new Date(t).getTime() <= limit;
  const rec = student.record;
  const stages = Object.fromEntries(Object.entries(rec.stages ?? {}).filter(([, st]) => before(st?.submittedAt)));
  const surveys = Object.fromEntries(Object.entries(rec.surveys ?? {}).filter(([, r]) => before(r?.submittedAt)));
  const principle = before(rec.principle?.finishedAt) ? rec.principle : null;
  return { ...student, withdrawnAt: cut, record: { ...rec, stages, surveys, principle } };
}

/** 학생의 사전·사후 응답 (제출한 것만) */
export const responsesOf = (student) => {
  const s = student.record.surveys ?? {};
  return { pre: s.pre?.submittedAt ? s.pre : null, post: s.post?.submittedAt ? s.post : null };
};

/** 학생들이 응답한 설문 id와 응답 학생 수 (많은 순) */
export function surveysInUse(students) {
  const counts = new Map();
  students.forEach((st) => {
    const { pre, post } = responsesOf(st);
    const id = pre?.surveyId ?? post?.surveyId;
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id, n]) => ({ id, n, survey: findSurvey(id) })).filter((x) => x.survey);
}

const scoreOf = (survey, q, v) => (v == null ? null : q.reverse ? reverseScore(survey, v) : Number(v));

/** 한 학생의 영역 평균(척도 문항, 역문항 바꿈) { pre: {domain: m}, post: {...} } */
export function domainMeans(survey, student) {
  const { pre, post } = responsesOf(student);
  const one = (res) => (res ? Object.fromEntries(surveyDomains(survey).map((d) => {
    const xs = survey.questions.filter((q) => q.type === 'scale' && q.domain === d.id).map((q) => scoreOf(survey, q, res.answers[q.id])).filter((v) => v != null);
    return [d.id, round2(mean(xs))];
  })) : null);
  return { pre: one(pre), post: one(post) };
}

/** 학급 설문 분석 */
export function surveyStats(survey, students) {
  const rows = students.map((st) => ({ st, ...responsesOf(st) })).filter((r) => (r.pre?.surveyId ?? r.post?.surveyId) === survey.id);
  const preN = rows.filter((r) => r.pre).length;
  const postN = rows.filter((r) => r.post).length;
  const paired = rows.filter((r) => r.pre && r.post);
  const items = survey.questions.map((q) => {
    if (q.type === 'scale') {
      const pres = rows.map((r) => r.pre?.answers[q.id]).filter((v) => v != null).map(Number);
      const posts = rows.map((r) => r.post?.answers[q.id]).filter((v) => v != null).map(Number);
      const diffs = paired.map((r) => Number(r.post.answers[q.id]) - Number(r.pre.answers[q.id])).filter((v) => !Number.isNaN(v));
      const s = sd(diffs);
      return { q, pre: round2(mean(pres)), post: round2(mean(posts)), diff: round2(mean(diffs)), n: diffs.length, dz: s ? round2(mean(diffs) / s) : null };
    }
    if (q.type === 'choice') {
      const count = (kind) => (q.options ?? []).map((o) => ({ option: o, count: rows.filter((r) => r[kind]?.answers[q.id] === o).length }));
      return { q, preCounts: count('pre'), postCounts: count('post') };
    }
    const texts = (kind) => rows.map((r) => ({ who: r.st.pseudonym, text: String(r[kind]?.answers[q.id] ?? '').trim() })).filter((x) => x.text);
    return { q, preTexts: texts('pre'), postTexts: texts('post') };
  });
  const domains = surveyDomains(survey).map((d) => {
    const per = rows.map((r) => domainMeans(survey, r.st));
    const pres = per.map((m) => m.pre?.[d.id]).filter((v) => v != null);
    const posts = per.map((m) => m.post?.[d.id]).filter((v) => v != null);
    const diffs = paired.map((r) => {
      const m = domainMeans(survey, r.st);
      return m.pre[d.id] != null && m.post[d.id] != null ? m.post[d.id] - m.pre[d.id] : null;
    }).filter((v) => v != null);
    const s = sd(diffs);
    return { ...d, pre: round2(mean(pres)), post: round2(mean(posts)), diff: round2(mean(diffs)), n: diffs.length, dz: s ? round2(mean(diffs) / s) : null };
  }).filter((d) => d.pre != null || d.post != null);
  const minutes = (kind) => round2(mean(rows.map((r) => r[kind]?.activeMs).filter((v) => v != null).map((v) => v / 60000)));
  return { survey, rows, preN, postN, pairedN: paired.length, items, domains, minutes: { pre: minutes('pre'), post: minutes('post') } };
}

const csvCell = (v) => {
  if (v == null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** 설문 CSV: 학생 한 줄, 사전·사후 문항별 응답과 영역 평균 */
export function surveyCsv(survey, students, { className }) {
  const head = ['학생 id', '가명', '예시', '세션 id', '학급', '회차', '연구 동의', '설문', '사전 제출', '사전 응답 시간(분)', '사후 제출', '사후 응답 시간(분)',
    ...survey.questions.flatMap((q, i) => {
      const tag = `${i + 1}. [${surveyDomains(survey).find((d) => d.id === q.domain)?.label ?? ''}${q.reverse ? ', 역' : ''}${q.sourceNo ? `, 원 ${q.sourceNo}` : ''}] ${q.text}`;
      return [`사전 ${tag}`, `사후 ${tag}`];
    }),
    ...surveyDomains(survey).flatMap((d) => [`사전 ${d.label} 평균`, `사후 ${d.label} 평균`])];
  const lines = [head.map(csvCell).join(',')];
  students.forEach((st) => {
    const { pre, post } = responsesOf(st);
    if ((pre?.surveyId ?? post?.surveyId) !== survey.id) return;
    const dm = domainMeans(survey, st);
    const min = (r) => (r?.activeMs == null ? null : round2(r.activeMs / 60000));
    lines.push([st.id, st.pseudonym, st.sample ? 'Y' : 'N', st.session?.id, st.session ? className(st.session.classId) : '', st.session?.round, CONSENT_LABELS[consentStatus(st)], survey.title,
      pre?.submittedAt, min(pre), post?.submittedAt, min(post),
      ...survey.questions.flatMap((q) => [pre?.answers[q.id], post?.answers[q.id]]),
      ...surveyDomains(survey).flatMap((d) => [dm.pre?.[d.id], dm.post?.[d.id]])].map(csvCell).join(','));
  });
  return `﻿${lines.join('\r\n')}`;
}
