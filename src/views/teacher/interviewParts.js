// 면담 화면(목록·학생 한 명)이 함께 쓰는 계산과 마크업 조각 (구현 6)

import { INTERVIEW_CONSENTS, INTERVIEW_STATUS, interviewType } from '../../data/interview.js';
import { analyzeStudent } from '../../services/analysis.js';
import { matchesFor } from '../../services/interviewCandidates.js';
import { getGrading } from '../../state/gradingStore.js';
import { consentComplete, interviewThresholds, recordOf, selectionOf } from '../../state/interviewStore.js';
import { escapeHtml } from '../../ui/dom.js';
import { analysisStudents, sourceOf } from './analysisHomeView.js';

/** 학생 한 명의 면담 정보: { student, a(분석), matches, unscored, selection, record } */
export function interviewRow(student, source = sourceOf(), th = interviewThresholds()) {
  const a = analyzeStudent(student, source);
  const { matches, unscored } = matchesFor(a, th);
  return { student, a, matches, unscored, selection: selectionOf(student.id), record: recordOf(student.id) };
}

/**
 * 면담 목록에 쓸 학생들 (1단계를 제출한 학생).
 * included: 분석 설정(예시·연구 동의·포함할 세션)을 따른 학생, all: 설정과 관계없이 모든 학생(선정했던 학생을 찾을 때)
 */
export function interviewRows(g = getGrading()) {
  const pool = analysisStudents(g);
  const submitted = (s) => s.record.stages?.['1']?.submittedAt;
  const source = sourceOf();
  const th = interviewThresholds();
  return { rows: pool.included.filter(submitted).map((s) => interviewRow(s, source, th)), all: pool.all.filter(submitted), excluded: pool.excluded };
}

export const statusLabel = (id) => INTERVIEW_STATUS.find((s) => s.id === id)?.label ?? '';

/** 유형 표시 칩 (예: "유형 1 혼자 못 함 → 최종 완성") */
export const typeChip = (id, { estimated = false } = {}) => {
  const t = interviewType(id);
  return t ? `<span class="tag iv-type${estimated ? ' iv-type--estimated' : ''}"><span class="num">유형 ${t.n}</span> ${escapeHtml(t.short)}${estimated ? ' (추정)' : ''}</span>` : '';
};

/** 면담 상태 칩 */
export function statusChip(record) {
  if (!record) return '<span class="tag">기록 전</span>';
  const cls = record.status === 'done' ? ' tag--mint' : record.status === 'cancelled' ? ' tag--warn' : '';
  return `<span class="tag${cls}">${escapeHtml(statusLabel(record.status))}</span>`;
}

/** 면담 동의 요약 (예: "학생·보호자 확인, 녹음 미확인") */
export function consentSummary(record) {
  if (!record) return '–';
  const got = INTERVIEW_CONSENTS.filter((c) => record.consent?.[c.id]).map((c) => c.label.replace(/ (면담 )?동의$/, ''));
  if (!got.length) return '확인 전';
  return `${got.join('·')} 확인${consentComplete(record) ? '' : ' (필수 동의 남음)'}`;
}

/** 근거 목록 (유형별로 묶어서) */
export function matchList(matches) {
  if (!matches.length) return '<p class="empty-text">기준에 맞는 기록이 없습니다.</p>';
  return `<ul class="iv-matches">${matches.map((m) => `<li>${typeChip(m.type, { estimated: m.estimated })}<span>${escapeHtml(m.text)}</span></li>`).join('')}</ul>`;
}
