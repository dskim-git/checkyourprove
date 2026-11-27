// 학생 대시보드의 팝업: 채점한 증명, 태그를 붙인 대화를 화면 이동 없이 읽기 전용으로 보여 준다.
// 고치려면 팝업 아래의 링크로 채점·태그 화면에 간다.

import { methodOptionLabel } from '../../data/research.js';
import {
  ACTUAL_METHOD_OPTIONS, COMPLETENESS_OPTIONS, GRADED_STAGES, REVISION_OPTIONS, RUBRIC_TOTAL, STUCK_OVERCOME_OPTIONS, TRANSCRIPT_OPTIONS,
} from '../../data/rubric.js';
import { CATEGORY_LABELS } from '../../services/researchGuardrails.js';
import { activeChatTags, activeRubric, getGrading } from '../../state/gradingStore.js';
import { conversationKey, readingFor, targetKey } from '../../state/researchRoster.js';
import { escapeHtml, formatDateTime, formatTime } from '../../ui/dom.js';
import { mountInkViews } from '../../ui/inkCanvas.js';
import { openModal } from '../../ui/modal.js';
import { statementHtml } from '../../ui/mathText.js';
import { readProofInk } from '../research/researchParts.js';
import { revisionLabel } from './gradingParts.js';

const label = (options, id) => options.find((o) => o.id === id)?.label ?? '–';
const sumOf = (criteria) => Object.values(criteria ?? {}).reduce((s, v) => s + Number(v), 0);

/** 채점 기록이 있는 채점자들 [{ rater, score }] */
export function gradedBy(student, stage, problemId) {
  const g = getGrading();
  const key = targetKey(student.id, stage, problemId);
  return g.raters.map((rater) => ({ rater, score: g.scores?.[rater.id]?.[key] })).filter((x) => x.score);
}

/** 태그를 마친 채점자들 [{ rater, record }] */
export function taggedBy(student, problemId) {
  const g = getGrading();
  const key = conversationKey(student.id, problemId);
  return g.raters.map((rater) => ({ rater, record: g.chatTagging?.[rater.id]?.[key] })).filter((x) => x.record?.doneAt);
}

export function openGradePopup(student, stage, problemId, problem) {
  const def = GRADED_STAGES.find((d) => d.n === stage);
  const item = student.record.stages?.[String(stage)]?.items?.[problemId];
  const list = gradedBy(student, stage, problemId);
  const g = getGrading();
  const key = targetKey(student.id, stage, problemId);
  const head = list.map(({ rater }) => `<th scope="col">${escapeHtml(rater.name)}</th>`).join('');
  const ai = list.map(({ rater }) => g.aiGrades?.[rater.id]?.[key]).find(Boolean);
  const rows = activeRubric().map((c) => `<tr>
      <th scope="row">${escapeHtml(c.title)} <span class="meta">0~${c.max}</span></th>
      ${list.map(({ score }) => {
        const v = score.criteria?.[c.id];
        return `<td><strong class="num">${v ?? '–'}</strong>${v != null ? ` <span class="meta">${escapeHtml(c.levels[v] ?? '')}</span>` : ''}</td>`;
      }).join('')}
      ${ai ? `<td class="num">${ai.criteria?.[c.id] ?? '–'}</td>` : ''}
    </tr>`).join('');
  const extraRow = (title, fn) => `<tr><th scope="row">${escapeHtml(title)}</th>${list.map(({ score }) => `<td>${fn(score)}</td>`).join('')}${ai ? '<td></td>' : ''}</tr>`;
  const extras = [
    extraRow('합계', (s) => `<strong class="num">${sumOf(s.criteria)}</strong> / ${RUBRIC_TOTAL}`),
    extraRow('완성도', (s) => escapeHtml(label(COMPLETENESS_OPTIONS, s.completeness))),
    extraRow('실제 증명법', (s) => escapeHtml(label(ACTUAL_METHOD_OPTIONS, s.actualMethod))),
    stage === 2 ? extraRow('옮겨 적기', (s) => escapeHtml(s.transcript ? label(TRANSCRIPT_OPTIONS, s.transcript) : '확인 전')) : '',
    stage === 4 ? extraRow('보완 여부', (s) => escapeHtml(Object.entries(s.revisions ?? {}).map(([id, v]) => `${revisionLabel(id)} ${label(REVISION_OPTIONS, v)}`).join(', ') || '–')) : '',
    stage === 4 ? extraRow('막힌 점 극복', (s) => escapeHtml(s.stuckOvercome ? label(STUCK_OVERCOME_OPTIONS, s.stuckOvercome) : '확인 전')) : '',
    extraRow('메모', (s) => escapeHtml(s.note || '–')),
    extraRow('채점', (s) => `${escapeHtml(formatDateTime(s.gradedAt))}${s.blind ? ', 블라인드' : ''}${s.aiSeen ? ', AI 제안 본 뒤' : ''}`),
  ].join('');
  const chosen = stage === 2 ? item?.aiMethod : item?.method;
  const html = `<p class="meta">${escapeHtml(student.pseudonym)}, ${escapeHtml(def.label)}</p>
    <p class="an-statement">${statementHtml(problem?.statement ?? '')}</p>
    <div class="modal__split">
      <section class="grade-sub" aria-label="채점한 증명">
        <h3 class="grade-sub__title">증명 <span class="meta">(고른 증명법: ${escapeHtml(methodOptionLabel(chosen) || '–')})</span></h3>
        ${readProofInk(item?.[def.field], item?.ink?.[def.field], `${stage}|${problemId}|${def.field}`)}
        ${(() => {
          const rd = readingFor(student.id, stage, problemId, item, def.field);
          return rd ? `<p class="meta">AI가 읽은 글${rd.source === 'sample' ? '(예시)' : ''}${rd.edited ? `, ${escapeHtml(rd.edited.by)}이(가) 고침` : ''}</p><div class="proof-text">${escapeHtml(rd.text)}</div>` : '';
        })()}
      </section>
      <section class="grade-sub" aria-label="루브릭 점수">
        <h3 class="grade-sub__title">루브릭 점수</h3>
        <div class="table-wrap"><table class="data-table data-table--compact">
          <thead><tr><th scope="col">기준</th>${head}${ai ? '<th scope="col">AI 제안</th>' : ''}</tr></thead>
          <tbody>${rows}${extras}</tbody>
        </table></div>
      </section>
    </div>`;
  return openModal({
    title: `채점 보기: 명제 ${student.record.propositionIds.indexOf(problemId) + 1}, ${def.label}`,
    html,
    footer: `<a class="button button--secondary button--small" href="#/teacher/grading/${key}">채점 화면에서 고치기</a>`,
    onMount: (body) => mountInkViews(body, (k) => {
      const [st, id, field] = k.split('|');
      return student.record.stages?.[st]?.items?.[id]?.ink?.[field] ?? null;
    }),
  });
}

export function openChatPopup(student, problemId, problem) {
  const item = student.record.stages?.['2']?.items?.[problemId];
  const messages = item?.chat?.messages ?? [];
  const list = taggedBy(student, problemId);
  const tags = activeChatTags();
  const tagName = (id) => tags.find((t) => t.id === id)?.label ?? '(지운 태그)';
  const tagLine = (ids) => (ids?.length ? ids.map((id) => `<span class="tag">${escapeHtml(tagName(id))}</span>`).join(' ') : '<span class="meta">없음</span>');
  const msgs = messages.map((m, i) => `<li class="chat__msg chat__msg--${m.role} tag-msg">
      <p class="chat__who"><span class="num">${i + 1}.</span> ${m.role === 'student' ? escapeHtml(student.pseudonym) : 'AI 도우미'} <time>${formatTime(m.at)}</time>${m.role === 'student' && m.topic && m.topic !== 'proof' ? ` <span class="tag">${escapeHtml(CATEGORY_LABELS[m.topic] ?? m.topic)}</span>` : ''}</p>
      <div class="chat__body">${escapeHtml(m.text)}</div>
      ${list.map(({ rater, record }) => (record.messages?.[i]?.length ? `<p class="popup-tags"><span class="meta">${escapeHtml(rater.name)}</span> ${tagLine(record.messages[i])}</p>` : '')).join('')}
    </li>`).join('');
  const html = `<p class="meta">${escapeHtml(student.pseudonym)}, 2단계 AI 대화</p>
    <p class="an-statement">${statementHtml(problem?.statement ?? '')}</p>
    <div class="table-wrap"><table class="data-table data-table--compact">
      <thead><tr><th scope="col">채점자</th><th scope="col">대화 전체 태그</th><th scope="col">메모</th><th scope="col">마친 시각</th></tr></thead>
      <tbody>${list.map(({ rater, record }) => `<tr><th scope="row">${escapeHtml(rater.name)}</th><td>${tagLine(record.conversation)}</td><td>${escapeHtml(record.note || '–')}</td><td>${escapeHtml(formatDateTime(record.doneAt))}${record.aiSeen ? ', AI 제안 본 뒤' : ''}</td></tr>`).join('')}</tbody>
    </table></div>
    <ol class="chat__log chat__log--compact tag-log">${msgs}</ol>`;
  return openModal({
    title: `대화 보기: 명제 ${student.record.propositionIds.indexOf(problemId) + 1}`,
    html,
    footer: `<a class="button button--secondary button--small" href="#/teacher/chats/${conversationKey(student.id, problemId)}">태그 화면에서 고치기</a>`,
  });
}
