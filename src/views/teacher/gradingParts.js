// 교사 채점 화면들이 함께 쓰는 도구: 채점 대상 순서, 추가 확인 남은 항목, 선택 줄 마크업

import { REVISION_CHECKLIST } from '../../data/research.js';
import { blindOrder, getGrading } from '../../state/gradingStore.js';
import { gradingTargets, itemAt, researchStudents } from '../../state/researchRoster.js';
import { escapeHtml } from '../../ui/dom.js';

/** 지금 설정(예시 학생 포함, 블라인드)에 따른 채점 대상과 채점 순서 */
export function gradingQueue(raterId) {
  const g = getGrading();
  const students = researchStudents({ includeSamples: g.includeSamples });
  const targets = gradingTargets(students);
  const byKey = new Map(targets.map((t) => [t.key, t]));
  const keys = g.blind ? blindOrder(raterId, targets.map((t) => t.key)) : targets.map((t) => t.key);
  return { students, targets: keys.map((key) => byKey.get(key)), blind: g.blind };
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
export function radioLines({ name, legend, options, value, help = '', required = false }) {
  const lines = options.map((o) => `<label class="check">
      <input type="radio" name="${escapeHtml(name)}" value="${escapeHtml(o.id)}"${String(value ?? '') === String(o.id) ? ' checked' : ''}>
      <span>${o.html ?? escapeHtml(o.label)}</span>
    </label>`).join('');
  return `<fieldset class="choice-group grade-field" id="g-${escapeHtml(name)}">
    <legend>${escapeHtml(legend)}${required ? ' <span class="field__req">(필수)</span>' : ''}</legend>
    ${help ? `<p class="field__help">${escapeHtml(help)}</p>` : ''}
    ${lines}
    <p class="field__error" data-error-for="${escapeHtml(name)}" hidden></p>
  </fieldset>`;
}
