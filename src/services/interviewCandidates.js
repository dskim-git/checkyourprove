// 면담 후보 추천과 질문 예시 (구현 6)
// 학생 × 명제마다 면담 후보 유형을 판정하고(사용자 결정: 명제마다 판정, 목록은 학생별로 묶음), 학생 기록으로 질문 예시를 만든다.
// 점수는 연구 분석과 같은 점수 출처(services/analysis.js scoreFor)를 쓴다. 원본 기록은 읽기만 한다.
// 유형 4는 교사가 붙인 대화 태그(채점자 중 한 명이라도 붙이면 인정)가 기준이고, 아직 아무도 태그를 마치지 않은 대화는
// 가드레일 분류(증명과 무관한 질문)로 "태그 전 추정"을 보여 준다(사용자 결정 2026-11-27).

import { BAD_CHAT_TAGS, GOOD_CHAT_TAGS, INTERVIEW_CONSENTS, INTERVIEW_STATUS, INTERVIEW_TYPES, interviewType } from '../data/interview.js';
import { isNoneAnswer } from './classInsights.js';
import { methodOptionLabel } from '../data/research.js';
import { activeChatTags, getGrading } from '../state/gradingStore.js';
import { conversationKey } from '../state/researchRoster.js';
import { findSurvey } from '../state/surveyStore.js';
import { responsesOf } from './surveyAnalysis.js';

const fmt = (v) => (v == null ? '–' : Number.isInteger(v) ? String(v) : Number(v).toFixed(1));
const methodName = (id, other = '') => (id === 'other' ? `기타${other ? `(${other})` : ''}` : methodOptionLabel(id) || '');
const sameMethod = (a, aOther, b, bOther) => Boolean(a && b) && a === b && (a !== 'other' || String(aOther ?? '').trim() === String(bOther ?? '').trim());
/** 4단계 반영 비율(나의 답변 칸 수, 10칸)을 AI 반영 %로 */
export const aiShareOf = (ratioMine) => (ratioMine == null ? null : (10 - ratioMine) * 10);
const clip = (text, n = 40) => {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n)}…` : s;
};

/** 한 대화의 교사 태그(모든 채점자 합침): { tagged, tags: Set, messages: { [태그 id]: 첫 메시지 번호 } } */
function conversationTags(studentId, problemId) {
  const g = getGrading();
  const key = conversationKey(studentId, problemId);
  const tags = new Set();
  const firstMsg = {};
  let tagged = false;
  Object.values(g.chatTagging ?? {}).forEach((byKey) => {
    const rec = byKey?.[key];
    if (!rec) return;
    if (rec.doneAt) tagged = true;
    Object.entries(rec.messages ?? {}).sort(([a], [b]) => Number(a) - Number(b)).forEach(([i, ids]) => (ids ?? []).forEach((id) => {
      tags.add(id);
      if (firstMsg[id] == null || Number(i) < firstMsg[id]) firstMsg[id] = Number(i);
    }));
    (rec.conversation ?? []).forEach((id) => tags.add(id));
  });
  return { tagged: tagged || tags.size > 0, tags, firstMsg };
}

/**
 * 학생 분석(analyzeStudent 결과)에서 면담 후보 유형을 판정한다.
 * 돌려줌: { matches: [{ type, problemId, propIndex, variant, estimated, text }], unscored: 점수가 없어 1~3·5(부정확) 판정을 못 한 명제 수 }
 * variant: t3 'method'|'drop', t4 'good'|'bad', t5 'weak'|null
 */
export function matchesFor(a, th) {
  const matches = [];
  let unscored = 0;
  const tagLabels = Object.fromEntries(activeChatTags().map((t) => [t.id, t.label]));
  a.props.forEach((p) => {
    const t1 = p.totals[1];
    const t4 = p.totals[4];
    const n = `명제 ${p.propIndex + 1}`;
    const add = (type, text, extra = {}) => matches.push({ type, problemId: p.problemId, propIndex: p.propIndex, variant: null, estimated: false, text: `${n}: ${text}`, ...extra });
    if (t1 == null || (p.s4 && t4 == null)) unscored += 1;
    const m1 = p.s1?.method ?? '';
    const m4 = p.s4?.method ?? '';
    const mAi = p.s2?.aiMethod ?? '';
    const methodChanged = p.s4 && m1 && m4 && !sameMethod(m1, p.s1?.methodOther, m4, p.s4?.methodOther);
    // 유형 1: 1단계 낮음, 4단계 높음
    if (t1 != null && t4 != null && t1 <= th.lowMax && t4 >= th.highMin) add('t1', `1단계 ${fmt(t1)}점 → 4단계 ${fmt(t4)}점`);
    // 유형 2: 1단계 높음, AI 반영 높음
    const share = aiShareOf(p.ratioMine);
    if (t1 != null && t1 >= th.highMin && share != null && share >= th.aiShareMin) add('t2', `1단계 ${fmt(t1)}점, 최종 증명의 AI 반영 ${share}%`);
    // 유형 3: 1단계 높음, 증명법을 바꿈 또는 점수가 떨어짐
    if (t1 != null && t1 >= th.highMin) {
      const dropped = t4 != null && t1 - t4 >= th.dropMin;
      if (methodChanged || dropped) {
        const parts = [];
        if (methodChanged) parts.push(`증명법 ${methodName(m1, p.s1?.methodOther)} → ${methodName(m4, p.s4?.methodOther)}`);
        if (dropped) parts.push(`점수 ${fmt(t1)} → ${fmt(t4)}점`);
        add('t3', `1단계 ${fmt(t1)}점, ${parts.join(', ')}`, { variant: dropped ? 'drop' : 'method' });
      }
    }
    // 유형 4: 대화 태그(없으면 가드레일 분류로 추정)
    if (p.s2) {
      const ct = conversationTags(a.student.id, p.problemId);
      const msgs = p.s2.chat?.messages ?? [];
      const quote = (tagId) => {
        const i = ct.firstMsg[tagId];
        return i != null && msgs[i]?.text ? ` "${clip(msgs[i].text)}"` : '';
      };
      if (ct.tagged) {
        const good = GOOD_CHAT_TAGS.filter((id) => ct.tags.has(id));
        const bad = BAD_CHAT_TAGS.filter((id) => ct.tags.has(id));
        if (good.length) add('t4', `잘 쓴 예, 태그 ${good.map((id) => `"${tagLabels[id] ?? id}"`).join(', ')}${quote(good[0])}`, { variant: 'good', tags: good });
        if (bad.length) add('t4', `못 쓴 예, 태그 ${bad.map((id) => `"${tagLabels[id] ?? id}"`).join(', ')}${quote(bad[0])}`, { variant: 'bad', tags: bad });
      } else if (p.chat.offTopic > 0) {
        const off = msgs.find((m) => m.role === 'student' && m.topic && !['proof', 'greeting'].includes(m.topic));
        add('t4', `못 쓴 예(태그 전 추정), 증명과 무관한 질문 ${p.chat.offTopic}개${off ? ` "${clip(off.text)}"` : ''}`, { variant: 'bad', estimated: true, tags: ['off-purpose'] });
      }
    }
    // 유형 5: AI가 다른 증명법, 4단계도 1단계 증명법 유지
    if (p.s4 && m1 && mAi && m4 && !sameMethod(m1, p.s1?.methodOther, mAi, p.s2?.aiMethodOther) && !methodChanged) {
      const weak = t1 != null && t1 <= th.stickWeakMax;
      add('t5', `AI는 ${methodName(mAi, p.s2?.aiMethodOther)}, 1·4단계 모두 ${methodName(m1, p.s1?.methodOther)}${weak ? ` (1단계 ${fmt(t1)}점인데도 고수)` : t1 != null ? ` (1단계 ${fmt(t1)}점)` : ''}`, { variant: weak ? 'weak' : null });
    }
  });
  return { matches, unscored };
}

/** 사후 설문의 서술형·단답 답 (유형 6 참고): [{ question, text }] */
export function postSurveyTexts(student) {
  const { post } = responsesOf(student);
  if (!post) return [];
  const survey = findSurvey(post.surveyId);
  return (survey?.questions ?? [])
    .filter((q) => q.type === 'long' || q.type === 'short')
    .map((q) => ({ question: q.text, text: String(post.answers?.[q.id] ?? '').trim() }))
    .filter((x) => x.text && !isNoneAnswer(x.text));
}

/**
 * 면담 질문 예시를 만든다(유형과 학생 기록으로 규칙에 따라). id가 같으면 같은 질문이라 다시 넣어도 겹치지 않는다.
 * types: 면담 대상으로 고른 유형, matches: matchesFor 결과의 matches
 */
export function interviewQuestions(a, matches, types, { student = a.student } = {}) {
  const qs = [];
  const add = (id, text, type = null, problemId = null) => {
    if (!qs.some((q) => q.id === id)) qs.push({ id, text, source: 'auto', type, problemId });
  };
  const propOf = (id) => a.props.find((p) => p.problemId === id);
  const chosen = matches.filter((m) => types.includes(m.type));
  chosen.forEach((m) => {
    const p = propOf(m.problemId);
    const n = `명제 ${m.propIndex + 1}`;
    const id = `auto-${m.type}${m.variant ? `-${m.variant}` : ''}-${m.problemId}`;
    const stuck = String(p?.s1?.stuck ?? '').trim();
    const m1 = methodName(p?.s1?.method, p?.s1?.methodOther);
    const m4 = methodName(p?.s4?.method, p?.s4?.methodOther);
    const mAi = methodName(p?.s2?.aiMethod, p?.s2?.aiMethodOther);
    if (m.type === 't1') {
      add(id, `${n}에서 처음에는 ${stuck && !isNoneAnswer(stuck) ? `"${clip(stuck, 50)}"(이)라고 막힌 점을 썼는데` : '증명을 끝까지 쓰기 어려웠는데'}, 최종 증명은 완성했어요. AI 증명의 어떤 부분이 가장 도움이 되었나요?`, m.type, m.problemId);
      add(`${id}-alone`, `${n}을(를) AI 증명 없이 지금 다시 증명한다면 어디까지 혼자 쓸 수 있을 것 같나요?`, m.type, m.problemId);
    } else if (m.type === 't2') {
      add(id, `${n}에서 처음 쓴 증명도 거의 맞았는데, 최종 증명에는 AI 답을 ${aiShareOf(p?.ratioMine)}% 반영했어요. 내 증명 대신 AI 증명을 많이 쓰기로 한 이유는 무엇인가요?`, m.type, m.problemId);
    } else if (m.type === 't3') {
      if (m.variant === 'drop') add(id, `${n}의 최종 증명을 쓸 때 처음 증명에서 무엇을 고치거나 바꾸려고 했나요? 바꾼 뒤 증명이 더 좋아졌다고 생각하나요?`, m.type, m.problemId);
      else add(id, `${n}에서 처음에는 ${m1}(으)로 증명했는데 최종 증명은 ${m4}(으)로 바꾸었어요. 바꾼 이유는 무엇인가요?`, m.type, m.problemId);
    } else if (m.type === 't4') {
      if (m.variant === 'good') add(id, `${n}에서 AI에게 증명의 단계를 나누어 질문했어요. 그렇게 물어본 이유는 무엇이고, 한 번에 증명을 받는 것과 무엇이 달랐나요?`, m.type, m.problemId);
      else if ((m.tags ?? []).includes('shorten')) add(id, `${n}에서 AI에게 답을 짧게 해 달라고 했어요. 그렇게 요청한 이유는 무엇인가요? 짧아진 답에서 빠진 부분은 없었나요?`, m.type, m.problemId);
      else add(id, `${n}에서 AI에게 증명과 관계없는 질문도 했어요. 그때 AI를 어떤 도구라고 생각하고 썼나요?`, m.type, m.problemId);
    } else if (m.type === 't5') {
      add(id, `${n}에서 AI는 ${mAi}(으)로 증명했는데, 최종 증명까지 내가 고른 ${m1}을(를) 유지했어요. 내 증명법을 유지한 이유는 무엇인가요?`, m.type, m.problemId);
      if (m.variant === 'weak') add(`${id}-compare`, `${n}에서 AI 증명과 내 증명을 비교할 때, 내 증명에서 보완할 점은 무엇이라고 생각했나요?`, m.type, m.problemId);
    }
  });
  if (types.includes('t6')) {
    const post = postSurveyTexts(student)[0];
    if (post) add('auto-t6-survey', `사후 설문에 "${clip(post.text, 60)}"(이)라고 썼어요. 그렇게 생각한 이유를 조금 더 이야기해 줄 수 있나요?`, 't6');
    add('auto-t6-class', '이번 수업에서 AI와 함께 증명해 본 것에 대해 하고 싶은 이야기가 있나요?', 't6');
  }
  // 공통: 1단계 막힌 점의 해결, 3단계 AI 의견 (각각 처음 하나)
  const stuckProp = a.props.find((p) => p.s4 && p.s1?.stuck && !isNoneAnswer(p.s1.stuck));
  if (stuckProp) add(`auto-stuck-${stuckProp.problemId}`, `1단계에서 막힌 점으로 쓴 "${clip(stuckProp.s1.stuck, 50)}"은(는) 최종 증명에서 어떻게 해결했나요?`, null, stuckProp.problemId);
  const opinionProp = a.props.find((p) => p.s3?.aiOpinion && !isNoneAnswer(p.s3.aiOpinion));
  if (opinionProp) add(`auto-opinion-${opinionProp.problemId}`, `3단계에서 AI에 대해 "${clip(opinionProp.s3.aiOpinion, 50)}"(이)라고 썼어요. 지금도 같은 생각인가요?`, null, opinionProp.problemId);
  return qs;
}

/** 유형별 후보·선정 학생 수: [{ type, candidates, selected }] */
export function typeCounts(rows) {
  return INTERVIEW_TYPES.map((t) => ({
    type: t,
    candidates: rows.filter((r) => r.matches.some((m) => m.type === t.id)).length,
    selected: rows.filter((r) => r.selection?.types.includes(t.id)).length,
  }));
}

// ── CSV ─────────────────────────────────────

const csvCell = (v) => {
  if (v == null) return '';
  const s = Array.isArray(v) ? v.join(';') : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const statusLabel = (id) => INTERVIEW_STATUS.find((s) => s.id === id)?.label ?? '';

/**
 * 면담 기록 CSV: 질문 한 줄씩(질문이 없으면 학생 한 줄). rows: [{ student, selection, record, propIndexOf(problemId) }]
 * 첫 줄은 한국어 열 이름, Excel용 UTF-8 BOM.
 */
export function interviewCsv(rows, { className }) {
  const head = ['학생', '학급', '회차', '예시', '선정 유형', '선정 근거', '유형 6 이유', '상태', '면담 일시', '면담자',
    ...INTERVIEW_CONSENTS.map((c) => c.label), '질문 번호', '질문 출처', '질문 유형', '명제', '질문', '학생 답 메모', '전체 메모', '완료 시각', '고친 시각'];
  const lines = [head];
  rows.forEach(({ student, selection, record, propIndexOf }) => {
    const base = [
      student.pseudonym, student.session ? className(student.session.classId) : '', student.session?.round ?? '', student.sample ? '예' : '',
      (selection?.types ?? []).map((id) => interviewType(id)?.n).filter(Boolean).join(';'),
      (selection?.reasons ?? []).map((r) => r.text).join(' / '),
      selection?.note ?? '',
      statusLabel(record?.status), record?.scheduledAt ?? '', record?.interviewer ?? '',
      ...INTERVIEW_CONSENTS.map((c) => record?.consent?.[c.id] ?? ''),
    ];
    const tail = [record?.memo ?? '', record?.doneAt ?? '', record?.updatedAt ?? ''];
    const qs = record?.questions ?? [];
    if (!qs.length) lines.push([...base, '', '', '', '', '', '', ...tail]);
    qs.forEach((q, i) => {
      const pi = q.problemId ? propIndexOf(q.problemId) : -1;
      lines.push([...base, i + 1, q.source === 'teacher' ? '교사' : '자동', q.type ? interviewType(q.type)?.n ?? '' : '', pi >= 0 ? pi + 1 : '', q.text, q.answer ?? '', ...tail]);
    });
  });
  return `﻿${lines.map((l) => l.map(csvCell).join(',')).join('\r\n')}`;
}

