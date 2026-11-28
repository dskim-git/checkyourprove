// 교사용 연구 분석 (구현 3-3): 학생·명제별 점수, 향상·격차, 기준별 변화, 자기 진단과 교사 채점 비교, 작성 과정, CSV
// 점수 출처(source): 채점자 자리 id('r1', 'r2', 'r3' …) | 'avg'(그 증명을 채점한 채점자들의 평균, 2명 이상) |
//   'r1ai'(첫 채점자와 AI 평균, AI 보조 채점자를 켰을 때) | 'ai'(AI 채점 도우미 더미 규칙, 참고용)
// 채점자 자리 수는 관리자가 정한다(2026-11-28 사용자 결정: 1명·2명·3명 이상)
// AGENTS.md 5절 "교사 화면: 분석 지표"를 따른다. 원본 기록은 바꾸지 않고 읽기만 한다.

import { CHECKLIST_NONE, REVISION_CHECKLIST, methodOptionLabel } from '../data/research.js';
import { DEFAULT_RUBRIC, GRADED_STAGES, RUBRIC_TOTAL } from '../data/rubric.js';
import { inkStats } from '../state/inkModel.js';
import { activeChatTags, getGrading } from '../state/gradingStore.js';
import { conversationKey, readingFor, targetKey } from '../state/researchRoster.js';
import { className } from '../state/sessionStore.js';
import { CONSENT_LABELS, consentStatus } from './surveyAnalysis.js';
import { principleScore } from './principleAnalysis.js';
import { assessProof } from './mockGradeAssist.js';
import { PROOF_HELP_MIN } from './proofHelp.js';
import { getProblem } from '../data/problems/index.js';

export const SCORE_SOURCES = [
  { id: 'r1', label: '채점자 1' },
  { id: 'r2', label: '채점자 2' },
  { id: 'avg', label: '두 채점자 평균' },
  { id: 'r1ai', label: '채점자 1과 AI 평균', aiRater: true },
  { id: 'ai', label: 'AI 채점(참고)' },
];

/** 지금 고를 수 있는 점수 출처: 채점자 자리마다 하나, 두 명 이상이면 평균, AI 보조 채점자를 켜면 첫 채점자와 AI 평균 */
export function scoreSources(g = getGrading()) {
  const raters = g.raters ?? [];
  return [
    ...raters.map((r) => ({ id: r.id, label: r.name })),
    ...(raters.length >= 2 ? [{ id: 'avg', label: raters.length === 2 ? '두 채점자 평균' : '채점자 평균' }] : []),
    ...(g.aiAsRater ? [{ id: 'r1ai', label: `${raters[0]?.name ?? '채점자 1'}과 AI 평균`, aiRater: true }] : []),
    { id: 'ai', label: g.aiAsRater ? 'AI 채점(보조 채점자)' : 'AI 채점(참고)' },
  ];
}
export const sourceLabel = (id) => scoreSources({ ...getGrading(), aiAsRater: true }).find((s) => s.id === id)?.label ?? id;
/** 고른 점수 출처가 지금 없으면(자리를 뺐을 때 등) 첫 채점자 */
export const validSource = (id, g = getGrading()) => (scoreSources(g).some((s) => s.id === id) ? id : g.raters?.[0]?.id ?? 'r1');

const sum = (criteria) => Object.values(criteria).reduce((s, v) => s + Number(v), 0);
const round1 = (v) => (v == null || Number.isNaN(v) ? null : Math.round(v * 10) / 10);
const mean = (list) => {
  const xs = list.filter((v) => v != null && !Number.isNaN(v));
  return xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null;
};

/** 피어슨 상관계수 (자료가 3쌍 미만이거나 한쪽이 모두 같으면 null) */
export function correlation(pairs) {
  const ps = pairs.filter(([x, y]) => x != null && y != null);
  if (ps.length < 3) return null;
  const mx = mean(ps.map(([x]) => x));
  const my = mean(ps.map(([, y]) => y));
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  ps.forEach(([x, y]) => {
    sxy += (x - mx) * (y - my);
    sxx += (x - mx) ** 2;
    syy += (y - my) ** 2;
  });
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}

/** 채점할 글 (필기는 AI가 읽은 글) */
function proofTextOf(item, field, reading = item?.inkReading?.[field]?.text ?? '') {
  const text = String(item?.[field] ?? '').trim();
  return [text, inkStats(item?.ink?.[field]).strokes ? reading : ''].filter(Boolean).join('\n');
}

/** 한 증명의 점수 { total, criteria, completeness, actualMethod, by } 또는 null(채점 전) */
export function scoreFor(student, stage, problemId, source) {
  const g = getGrading();
  const key = targetKey(student.id, stage, problemId);
  if (source === 'ai') {
    const def = GRADED_STAGES.find((d) => d.n === stage);
    const item = student.record.stages?.[String(stage)]?.items?.[problemId];
    if (!item || !student.record.stages[String(stage)].submittedAt) return null;
    const text = proofTextOf(item, def.field, readingFor(student.id, stage, problemId, item, def.field)?.text ?? '');
    if (!text) return null;
    const result = assessProof({ problem: getProblem(problemId), proofText: text, chosenMethod: item[def.methodField] });
    return { total: sum(result.criteria), criteria: result.criteria, completeness: result.completeness, actualMethod: result.actualMethod, by: 'AI' };
  }
  const pick = (raterId) => {
    const s = g.scores?.[raterId]?.[key];
    return s ? { total: sum(s.criteria), criteria: s.criteria, completeness: s.completeness, actualMethod: s.actualMethod, raw: s } : null;
  };
  if (source === 'avg' || source === 'r1ai') {
    // 평균: 이 증명을 채점한 채점자들(두 명 이상) / 첫 채점자와 AI
    const list = source === 'r1ai'
      ? [pick(g.raters[0]?.id), scoreFor(student, stage, problemId, 'ai')]
      : g.raters.map((r) => pick(r.id)).filter(Boolean);
    if (list.some((x) => !x) || list.length < 2) return null;
    const criteria = Object.fromEntries(DEFAULT_RUBRIC.map((c) => [c.id, list.reduce((s, x) => s + (x.criteria[c.id] ?? 0), 0) / list.length]));
    const same = (f) => (list.every((x) => x[f] === list[0][f]) ? list[0][f] : null);
    return { total: sum(criteria), criteria, completeness: same('completeness'), actualMethod: same('actualMethod'), by: source === 'r1ai' ? `${g.raters[0]?.name ?? '채점자 1'}과 AI 평균` : '평균', raw: list[0].raw };
  }
  const s = pick(source);
  return s ? { ...s, by: g.raters.find((r) => r.id === source)?.name ?? source } : null;
}

/** 교사(채점자 1)의 추가 확인: 2단계 옮겨 적기, 4단계 보완 여부·막힌 점 극복 */
const teacherChecks = (student, stage, problemId, source) => {
  const g = getGrading();
  const raterId = g.raters.some((r) => r.id === source) ? source : g.raters[0]?.id;
  return getGrading().scores?.[raterId]?.[targetKey(student.id, stage, problemId)] ?? null;
};

const minutes = (ms) => round1((ms ?? 0) / 60000);

/** 학생 한 명의 명제별 분석 */
export function analyzeStudent(student, source) {
  const rec = student.record;
  const at = (n, id) => rec.stages?.[String(n)]?.items?.[id] ?? null;
  const tags = activeChatTags();
  const raterId = getGrading().raters.some((r) => r.id === source) ? source : getGrading().raters[0]?.id;
  const props = (rec.propositionIds ?? []).map((problemId, propIndex) => {
    const s1 = at(1, problemId);
    const s2 = at(2, problemId);
    const s3 = at(3, problemId);
    const s4 = at(4, problemId);
    const score = Object.fromEntries([1, 2, 4].map((n) => [n, scoreFor(student, n, problemId, source)]));
    const t1 = score[1]?.total ?? null;
    const t2 = score[2]?.total ?? null;
    const t4 = score[4]?.total ?? null;
    const messages = s2?.chat?.messages ?? [];
    const studentMsgs = messages.filter((m) => m.role === 'student');
    const tagRecord = getGrading().chatTagging?.[raterId]?.[conversationKey(student.id, problemId)] ?? null;
    const tagIds = tagRecord ? [...Object.values(tagRecord.messages ?? {}).flat(), ...(tagRecord.conversation ?? [])] : [];
    const tagCounts = {};
    tagIds.forEach((id) => { tagCounts[id] = (tagCounts[id] ?? 0) + 1; });
    // 자기 진단(3단계 체크리스트) ↔ 교사 채점(짝이 되는 루브릭 기준)
    const selfCheck = REVISION_CHECKLIST.map((c) => {
      const criterion = DEFAULT_RUBRIC.find((r) => r.pair === c.id);
      const mine = score[1]?.criteria?.[criterion?.id];
      const ai = score[2]?.criteria?.[criterion?.id];
      return {
        id: c.id,
        label: c.label,
        criterion: criterion?.title,
        max: criterion?.max,
        myChecked: (s3?.myChecklist ?? []).includes(c.id),
        myScore: mine ?? null,
        myLacks: mine == null ? null : mine < criterion.max,
        aiChecked: (s3?.aiChecklist ?? []).includes(c.id),
        aiScore: ai ?? null,
        aiLacks: ai == null ? null : ai < criterion.max,
      };
    });
    const checks4 = teacherChecks(student, 4, problemId, source);
    const checks2 = teacherChecks(student, 2, problemId, source);
    const ink = (item, field) => inkStats(item?.ink?.[field]).strokes;
    return {
      problemId,
      problem: getProblem(problemId),
      propIndex,
      s1, s2, s3, s4,
      score,
      totals: { 1: t1, 2: t2, 4: t4 },
      improve: t1 != null && t4 != null ? t4 - t1 : null,
      gap: t1 != null && t2 != null ? t2 - t1 : null,
      methods: {
        1: s1?.method ?? '', 2: s2?.aiMethod ?? '', 4: s4?.method ?? '',
        actual: { 1: score[1]?.actualMethod ?? null, 2: score[2]?.actualMethod ?? null, 4: score[4]?.actualMethod ?? null },
        changes: [...(s1?.track?.methodChanges ?? []), ...(s4?.track?.methodChanges ?? [])].length,
      },
      confidence: { 1: s1?.confidence ?? null, 2: s2?.confidence ?? null, 4: s4?.confidence ?? null },
      stuck: {
        text: s1?.stuck ?? '',
        resolved: s3?.stuckResolved ?? '',
        overcome: checks4?.stuckOvercome ?? null,
      },
      selfCheck,
      noneChecked: { mine: (s3?.myChecklist ?? []).includes(CHECKLIST_NONE.id), ai: (s3?.aiChecklist ?? []).includes(CHECKLIST_NONE.id) },
      revisions: checks4?.revisions ?? {},
      transcript: { check: s2?.transcriptCheck ?? null, match: s2?.transcriptMatch ?? null, teacher: checks2?.transcript ?? null },
      chat: {
        questions: studentMsgs.length,
        offTopic: studentMsgs.filter((m) => m.topic && !['proof', 'greeting'].includes(m.topic)).length,
        proofHelp: messages.filter((m) => m.role === 'ai' && (m.coverage ?? 0) >= PROOF_HELP_MIN).length,
        proofHelpAt: s2?.proofHelpAt ?? null,
        tags: Object.entries(tagCounts).map(([id, n]) => ({ id, n, label: tags.find((t) => t.id === id)?.label ?? '(지운 태그)' })),
        tagged: Boolean(tagRecord?.doneAt),
        pasteAttempts: s2?.pasteAttempts ?? 0,
        tabSwitches: s2?.tabSwitches ?? 0,
      },
      ratioMine: s4?.ratioMine ?? null,
      process: [1, 2, 3, 4].map((n) => {
        const it = at(n, problemId);
        const field = n === 2 ? 'aiProof' : 'proof';
        return {
          n,
          minutes: minutes(it?.track?.activeMs),
          inputs: it?.track?.inputCount ?? 0,
          deletes: it?.track?.deleteCount ?? 0,
          snapshots: it?.track?.snapshots?.length ?? 0,
          firstInputAt: it?.track?.firstInputAt ?? null,
          inkStrokes: n === 3 ? 0 : ink(it, field),
          mode: n === 3 ? null : it?.inputMode?.[field] ?? (ink(it, field) ? 'pen' : 'keyboard'),
          modeChanges: it?.track?.modeChanges?.length ?? 0,
          penOnText: it?.track?.penOnText ?? 0,
        };
      }),
    };
  });
  const stages = [1, 2, 3, 4].map((n) => {
    const st = rec.stages?.[String(n)];
    return { n, minutes: minutes(st?.activeMs), leaves: st?.leaves ?? 0, startedAt: st?.startedAt ?? null, submittedAt: st?.submittedAt ?? null };
  });
  return {
    student,
    props,
    stages,
    avg: {
      1: round1(mean(props.map((p) => p.totals[1]))),
      2: round1(mean(props.map((p) => p.totals[2]))),
      4: round1(mean(props.map((p) => p.totals[4]))),
      improve: round1(mean(props.map((p) => p.improve))),
      gap: round1(mean(props.map((p) => p.gap))),
      ratioMine: round1(mean(props.map((p) => p.ratioMine))),
      confidence: { 1: round1(mean(props.map((p) => p.confidence[1]))), 2: round1(mean(props.map((p) => p.confidence[2]))), 4: round1(mean(props.map((p) => p.confidence[4]))) },
    },
    totalMinutes: round1(stages.reduce((s, st) => s + (st.minutes ?? 0), 0)),
    questions: props.reduce((s, p) => s + p.chat.questions, 0),
    offTopic: props.reduce((s, p) => s + p.chat.offTopic, 0),
    /** 기준별 평균 점수 비율(0~1): { [기준 id]: { 1, 2, 4 } } */
    criteria: Object.fromEntries(DEFAULT_RUBRIC.map((c) => [c.id, Object.fromEntries([1, 2, 4].map((n) => {
      const v = mean(props.map((p) => p.score[n]?.criteria?.[c.id]));
      return [n, v == null ? null : Math.round((v / c.max) * 100) / 100];
    }))])),
  };
}

/** 학급 요약: 학생 분석 목록과 상관 */
export function classSummary(analyses) {
  const rows = analyses.flatMap((a) => a.props.map((p) => ({ a, p })));
  return {
    students: analyses.length,
    improve: round1(mean(rows.map(({ p }) => p.improve))),
    gap: round1(mean(rows.map(({ p }) => p.gap))),
    rGapImprove: correlation(rows.map(({ p }) => [p.gap, p.improve])),
    rRatioImprove: correlation(rows.map(({ p }) => [p.ratioMine == null ? null : (10 - p.ratioMine) * 10, p.improve])),
    points: rows.filter(({ p }) => p.gap != null && p.improve != null).map(({ a, p }) => ({ student: a.student, prop: p, x: p.gap, y: p.improve })),
  };
}

// ── CSV ─────────────────────────────────────

const csvCell = (v) => {
  if (v == null) return '';
  const s = Array.isArray(v) ? v.join(';') : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** 학생 × 명제 한 줄씩. 첫 줄은 한국어 열 이름 */
export function analysisCsv(analyses, source) {
  const head = [
    ['학생 id', (a) => a.student.id], ['가명', (a) => a.student.pseudonym], ['예시', (a) => (a.student.sample ? 'Y' : 'N')],
    ['연구 동의', (a) => CONSENT_LABELS[consentStatus(a.student)]],
    ['원리 활동 정답 수', (a) => principleScore(a.student)?.correct], ['원리 활동 문항 수', (a) => principleScore(a.student)?.total],
    ['세션 id', (a) => a.student.session?.id], ['학급', (a) => (a.student.session ? className(a.student.session.classId) : '')], ['회차', (a) => a.student.session?.round], ['점수 출처', () => sourceLabel(source)],
    ['명제 id', (a, p) => p.problemId], ['명제 순서', (a, p) => p.propIndex + 1],
    ['1단계 점수', (a, p) => p.totals[1]], ['2단계 AI 점수', (a, p) => p.totals[2]], ['4단계 점수', (a, p) => p.totals[4]], ['만점', () => RUBRIC_TOTAL],
    ['향상(4-1)', (a, p) => p.improve], ['격차(2-1)', (a, p) => p.gap],
    ...[1, 2, 4].flatMap((n) => DEFAULT_RUBRIC.map((c) => [`${n}단계 ${c.title}`, (a, p) => p.score[n]?.criteria?.[c.id]])),
    ...[1, 2, 4].map((n) => [`${n}단계 완성도`, (a, p) => p.score[n]?.completeness]),
    ['1단계 증명법', (a, p) => methodOptionLabel(p.methods[1])], ['2단계 AI 증명법', (a, p) => methodOptionLabel(p.methods[2])], ['4단계 증명법', (a, p) => methodOptionLabel(p.methods[4])],
    ...[1, 2, 4].map((n) => [`${n}단계 실제 증명법(채점)`, (a, p) => p.methods.actual[n]]),
    ['증명법 바꾼 횟수', (a, p) => p.methods.changes],
    ['1단계 확신', (a, p) => p.confidence[1]], ['2단계 AI 증명 확신', (a, p) => p.confidence[2]], ['4단계 확신', (a, p) => p.confidence[4]],
    ['1단계 막힌 점', (a, p) => p.stuck.text], ['3단계 막힌 점 해결', (a, p) => p.stuck.resolved], ['4단계 막힌 점 극복(채점)', (a, p) => p.stuck.overcome],
    ['3단계 내 증명 보완할 점', (a, p) => p.s3?.myChecklist], ['3단계 AI 증명 보완할 점', (a, p) => p.s3?.aiChecklist], ['3단계 더 정확한 증명', (a, p) => p.s3?.moreAccurate],
    ['3단계 공통점·차이점', (a, p) => p.s3?.compareNote], ['3단계 내 증명이 나은 점', (a, p) => p.s3?.myAdvantage], ['3단계 AI 보완할 부분', (a, p) => p.s3?.aiIssues],
    ['3단계 AI에서 도움이 된 점', (a, p) => p.s3?.aiHelpful], ['3단계 활용 계획', (a, p) => p.s3?.plan], ['3단계 AI 의견', (a, p) => p.s3?.aiOpinion],
    ['4단계 보완됨', (a, p) => Object.entries(p.revisions).filter(([, v]) => v === 'fixed').map(([k]) => k)], ['4단계 보완 안 됨', (a, p) => Object.entries(p.revisions).filter(([, v]) => v === 'not').map(([k]) => k)],
    ['4단계 나의 반영 비율(%)', (a, p) => (p.ratioMine == null ? null : p.ratioMine * 10)], ['4단계 나의 증명에서 가져온 부분', (a, p) => p.s4?.usedFromMine], ['4단계 AI 증명에서 가져온 부분', (a, p) => p.s4?.usedFromAi],
    ['2단계 질문 수', (a, p) => p.chat.questions], ['2단계 증명과 무관 질문 수', (a, p) => p.chat.offTopic], ['2단계 증명 도움 답 수', (a, p) => p.chat.proofHelp], ['2단계 처음 증명 도움 시각', (a, p) => p.chat.proofHelpAt],
    ['2단계 대화 태그', (a, p) => p.chat.tags.map((t) => `${t.label}×${t.n}`)], ['2단계 옮겨 적기 확인', (a, p) => p.transcript.check], ['2단계 옮겨 적기 일치도', (a, p) => p.transcript.match], ['2단계 옮겨 적기 교사 확인', (a, p) => p.transcript.teacher],
    ['2단계 붙여넣기 시도', (a, p) => p.chat.pasteAttempts], ['2단계 탭 이동', (a, p) => p.chat.tabSwitches], ['2단계 AI 특징적인 점', (a, p) => p.s2?.notable],
    ...[1, 2, 3, 4].flatMap((n) => [
      [`${n}단계 작업 시간(분)`, (a, p) => p.process[n - 1].minutes], [`${n}단계 입력 수`, (a, p) => p.process[n - 1].inputs], [`${n}단계 지우기 수`, (a, p) => p.process[n - 1].deletes],
    ]),
    ...[1, 2, 4].flatMap((n) => [[`${n}단계 입력 방식`, (a, p) => p.process[n - 1].mode], [`${n}단계 필기 획 수`, (a, p) => p.process[n - 1].inkStrokes]]),
    ...[1, 2, 3, 4].flatMap((n) => [[`${n}단계 제출 시각`, (a) => a.stages[n - 1].submittedAt], [`${n}단계 화면 이탈`, (a) => a.stages[n - 1].leaves]]),
  ];
  const lines = [head.map(([h]) => csvCell(h)).join(',')];
  analyses.forEach((a) => a.props.forEach((p) => lines.push(head.map(([, f]) => csvCell(f(a, p))).join(','))));
  return `﻿${lines.join('\r\n')}`;
}
