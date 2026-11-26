// 교사 채점 화면들이 함께 쓰는 도구: 채점 대상 순서, 추가 확인 남은 항목, 선택 줄 마크업

import { REVISION_CHECKLIST } from '../../data/research.js';
import { RESEARCH_PROPOSITIONS } from '../../data/researchPropositions.js';
import { blindOrder, getGrading } from '../../state/gradingStore.js';
import { gradingTargets, itemAt, researchStudents } from '../../state/researchRoster.js';
import { escapeHtml } from '../../ui/dom.js';

/** 명제 순서: 연구 명제 목록 순, 그 밖의 명제는 뒤에 id 순 */
const propositionRank = (problemId) => {
  const i = RESEARCH_PROPOSITIONS.findIndex((p) => p.id === problemId);
  return i === -1 ? RESEARCH_PROPOSITIONS.length : i;
};

/**
 * 지금 설정(예시 학생 포함, 블라인드, 채점 순서)에 따른 채점 대상과 채점 순서
 * 채점 순서 'proposition'은 같은 명제끼리 모은다(일관된 채점). 묶음 안의 순서는 블라인드면 무작위, 아니면 학생 순이다.
 * 'propositionStage'는 명제 안에서 다시 단계(1 → 2 → 4)끼리 모은다. 순서만으로 단계가 드러나므로 블라인드가 아닐 때만 쓰고,
 * 블라인드에서는 'proposition'으로 채점한다.
 */
export function gradingQueue(raterId) {
  const g = getGrading();
  const students = researchStudents({ includeSamples: g.includeSamples });
  const targets = gradingTargets(students);
  const byKey = new Map(targets.map((t) => [t.key, t]));
  let ordered = (g.blind ? blindOrder(raterId, targets.map((t) => t.key)) : targets.map((t) => t.key)).map((key) => byKey.get(key));
  const byStage = g.sortBy === 'propositionStage' && !g.blind;
  const byProposition = g.sortBy === 'proposition' || g.sortBy === 'propositionStage';
  if (byProposition) {
    ordered = ordered
      .map((t, i) => ({ t, i }))
      .sort((a, b) => propositionRank(a.t.problemId) - propositionRank(b.t.problemId)
        || a.t.problemId.localeCompare(b.t.problemId)
        || (byStage ? a.t.stage - b.t.stage : 0)
        || a.i - b.i)
      .map(({ t }) => t);
  }
  return { students, targets: ordered, blind: g.blind, byProposition, byStage };
}

/** 같은 묶음(명제, 단계별로 모으면 명제·단계) 안에서의 위치 { n, total } */
export function groupPosition(targets, target, byStage = false) {
  const group = targets.filter((t) => t.problemId === target.problemId && (!byStage || t.stage === target.stage));
  return { n: group.indexOf(target) + 1, total: group.length };
}

/** 4단계: 3단계에서 학생이 체크한 내 증명의 보완할 점 ('찾지 못했다' 제외) */
export const checkedRevisions = (target) => (itemAt(target.student, 3, target.problemId)?.myChecklist ?? []).filter((id) => id !== 'none');

export const revisionLabel = (id) => REVISION_CHECKLIST.find((c) => c.id === id)?.label ?? id;

/** 단계별 추가 확인이 있는가 (2단계 옮겨 적기, 4단계 보완 여부·막힌 점 극복) */
export const hasExtras = (target) => target.stage === 2 || target.stage === 4;

/** 점수는 매겼지만 아직 남은 추가 확인 */
export function pendingChecks(target, score) {
  if (!score) return [];
  const left = [];
  if (target.stage === 2 && !score.transcript) left.push(target.item.transcriptCheck === 'teacher' ? '필기 옮겨 적기 확인' : '옮겨 적기 확인');
  if (target.stage === 4) {
    if (checkedRevisions(target).some((id) => !score.revisions?.[id])) left.push('보완 여부');
    if (!score.stuckOvercome) left.push('막힌 점 극복');
  }
  return left;
}

/** 하나를 고르는 선택 줄 (fieldset + .check 라디오) */
export function radioLines({ name, legend, options, value, help = '', required = false, aiSlot = false }) {
  const lines = options.map((o) => `<label class="check">
      <input type="radio" name="${escapeHtml(name)}" value="${escapeHtml(o.id)}"${String(value ?? '') === String(o.id) ? ' checked' : ''}>
      <span>${o.html ?? escapeHtml(o.label)}</span>
    </label>`).join('');
  return `<fieldset class="choice-group grade-field" id="g-${escapeHtml(name)}">
    <legend>${escapeHtml(legend)}${required ? ' <span class="field__req">(필수)</span>' : ''}</legend>
    ${help ? `<p class="field__help">${escapeHtml(help)}</p>` : ''}
    ${aiSlot ? `<div class="ai-suggest" data-ai-for="${escapeHtml(name)}" hidden></div>` : ''}
    ${lines}
    <p class="field__error" data-error-for="${escapeHtml(name)}" hidden></p>
  </fieldset>`;
}
