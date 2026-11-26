// 교사 화면 미리보기
// 권한 검증, 실제 학생 데이터, 서버 저장, 내려받기는 아직 구현하지 않았다.
// 화면에서도 미구현 기능은 비활성 상태와 "미구현" 표시로 구분한다.

import { METHODS, getMethod } from '../data/methods.js';
import { LEVELS, getLevel } from '../data/levels.js';
import { PROBLEMS, getProblem } from '../data/problems/index.js';
import { RESEARCH_PROPOSITIONS } from '../data/researchPropositions.js';
import { RESEARCH_STAGES } from '../data/research.js';
import { SAMPLE_ACTIVITY } from '../data/sampleRecords.js';
import { getClassroom, saveClassroom } from '../state/classroomStore.js';
import { findStage, getResearch, inkOf, propositionIdsFor, resetResearch, stageStatus } from '../state/researchStore.js';
import { hasInk } from '../state/inkModel.js';
import { escapeHtml, formatDateTime, formatTime } from '../ui/dom.js';
import { breadcrumb, notice } from '../ui/components.js';
import { formatActive } from './research/stageView.js';
import { PROOF_HELP_MIN } from '../services/proofHelp.js';

export function renderTeacher(root) {
  const classroom = getClassroom();

  root.innerHTML = `<div class="page page--teacher">
    ${breadcrumb([{ label: '학생 화면', href: '#/' }, { label: '교사 화면 미리보기' }])}
    <header class="page-intro">
      <h1>수업 관리</h1>
      <p class="meta">교사 화면 미리보기</p>
      <p class="lead">증명 연습의 인증 기준과 AI와 탐구하기 활동을 정하고, 학생의 활동을 확인하는 화면의 기본 골격입니다.</p>
    </header>

    ${notice('warn', '프로토타입 상태입니다', '교사 권한 확인, 실제 학생 데이터, 서버 저장은 아직 연결되지 않았습니다. 설정은 이 브라우저에만 저장되며, 아래 학생 기록은 모두 예시 데이터입니다.')}

    <section class="panel" aria-labelledby="settings-heading">
      <h2 id="settings-heading" class="section-title">수업 설정</h2>
      ${settingsForm(classroom)}
    </section>

    <section class="panel" aria-labelledby="activity-heading">
      <div class="section-head">
        <h2 id="activity-heading" class="section-title">증명 연습 현황</h2>
        <span class="tag tag--proto">예시 데이터</span>
      </div>
      <p class="meta">증명법마다 인증한 활동 단계 수(최대 ${LEVELS.length})와 최근 활동입니다.</p>
      ${activityTable()}
    </section>

    <section class="panel" aria-labelledby="research-progress-heading">
      <div class="section-head">
        <h2 id="research-progress-heading" class="section-title">AI와 탐구하기 진행 현황</h2>
        <span class="tag tag--proto">이 브라우저의 학생</span>
      </div>
      <p class="meta">서버 연결 전이라 이 브라우저에서 활동한 학생 한 명의 기록만 보입니다. 학생이 1단계를 시작하면 그때의 명제 목록으로 고정됩니다.</p>
      <div data-research-progress>${researchProgress(classroom)}</div>
      <div class="actions actions--start">
        <a class="button button--primary" href="#/teacher/grading">증명 채점하기</a>
        <a class="button button--secondary" href="#/teacher/rubric">채점 루브릭</a>
        <button type="button" class="button button--secondary" disabled aria-describedby="unimplemented-note">기록 내려받기 (미구현)</button>
        <button type="button" class="button button--ghost" data-action="reset-research">이 브라우저의 연구 기록 초기화</button>
        <p class="actions__note" id="unimplemented-note">대화 태그, 분석 지표, 내려받기, 면담 기능은 다음 작업에서 추가합니다.</p>
      </div>
    </section>
  </div>`;

  const form = root.querySelector('[data-settings-form]');

  const onChange = (event) => {
    const status = root.querySelector('[data-settings-status]');
    if (form.contains(event.target) && status) status.textContent = '저장하지 않은 변경 사항이 있습니다.';
  };

  const onSubmit = (event) => {
    if (event.target !== form) return;
    event.preventDefault();
    const data = new FormData(form);
    const propositionIds = data.getAll('researchPropositionIds');
    if (!propositionIds.length) {
      root.querySelector('[data-settings-status]').textContent = '탐구할 명제를 하나 이상 고르세요.';
      return;
    }
    saveClassroom({
      ...classroom,
      requiredClears: Number(data.get('requiredClears')),
      unlockAll: data.get('unlockAll') === 'on',
      researchOpen: data.get('researchOpen') === 'on',
      researchPropositionIds: propositionIds,
      researchStagesOpen: data.getAll('researchStagesOpen').map(Number).sort(),
    });
    root.querySelector('[data-research-progress]').innerHTML = researchProgress(getClassroom());
    root.querySelector('[data-settings-status]').textContent = `설정을 저장했습니다 (${formatTime(new Date().toISOString())}). 학생 화면에 바로 반영됩니다.`;
  };

  const onClick = (event) => {
    if (!event.target.closest('[data-action="reset-research"]')) return;
    if (!window.confirm('이 브라우저에 저장된 AI와 탐구하기 기록을 모두 지울까요? 시연·시험용 기능이며 되돌릴 수 없습니다.')) return;
    resetResearch();
    root.querySelector('[data-research-progress]').innerHTML = researchProgress(getClassroom());
  };

  root.addEventListener('change', onChange);
  root.addEventListener('submit', onSubmit);
  root.addEventListener('click', onClick);
  return () => {
    root.removeEventListener('change', onChange);
    root.removeEventListener('submit', onSubmit);
    root.removeEventListener('click', onClick);
  };
}

function settingsForm(classroom) {
  const clearOptions = [1, 2, 3]
    .map((n) => `<option value="${n}"${classroom.requiredClears === n ? ' selected' : ''}>명제 ${n}개 통과</option>`)
    .join('');
  const chosen = new Set(classroom.researchPropositionIds);
  const propositionCheck = (p, label) => `<label class="check">
      <input type="checkbox" name="researchPropositionIds" value="${p.id}"${chosen.has(p.id) ? ' checked' : ''}>
      <span>${label} <span class="meta">${escapeHtml(p.statement)}</span></span>
    </label>`;
  const researchChecks = RESEARCH_PROPOSITIONS.map((p) => propositionCheck(p, `<strong>${escapeHtml(p.title)}</strong>`)).join('');
  const practiceChecks = PROBLEMS.map((p) => propositionCheck(p, `[${escapeHtml(getMethod(p.method).shortLabel)}] ${escapeHtml(p.title)}`)).join('');
  const stageChecks = RESEARCH_STAGES.map((stage) => `<label class="check">
      <input type="checkbox" name="researchStagesOpen" value="${stage.n}"${classroom.researchStagesOpen.includes(stage.n) ? ' checked' : ''}>
      <span>${stage.n}단계 ${escapeHtml(stage.title)}${stage.usesAi ? ' <span class="tag">AI 사용</span>' : ''}</span>
    </label>`).join('');

  return `<form class="settings-form" data-settings-form novalidate>
    <div class="field">
      <p class="field__label">수업</p>
      <p>${escapeHtml(classroom.name)}</p>
    </div>

    <fieldset class="choice-group">
      <legend class="field__label">증명 연습하기</legend>
      <div class="field field--inline">
        <label class="field__label" for="required-clears">활동 단계 인증 기준</label>
        <p class="field__help" id="required-clears-help">한 활동 단계에서 이만큼 통과하면 인증되고 다음 단계가 열립니다.</p>
        <select id="required-clears" name="requiredClears" class="field__select" aria-describedby="required-clears-help">${clearOptions}</select>
      </div>
      <label class="check">
        <input type="checkbox" name="unlockAll"${classroom.unlockAll ? ' checked' : ''}>
        <span>모든 단계 열기 <span class="meta">시연이나 수업 진행용입니다. 인증하지 않아도 모든 활동을 선택할 수 있습니다.</span></span>
      </label>
    </fieldset>

    <fieldset class="choice-group">
      <legend class="field__label">AI와 탐구하기 (연구 모드)</legend>
      <label class="check">
        <input type="checkbox" name="researchOpen"${classroom.researchOpen ? ' checked' : ''}>
        <span>학생 홈에서 AI와 탐구하기 열기</span>
      </label>
      <fieldset class="choice-group">
        <legend class="field__label">단계 열기</legend>
        <p class="field__help">수업 차시에 맞춰 단계를 열어 주세요. 학생은 앞 단계를 제출해야 다음 단계를 할 수 있습니다. 3·4단계는 함께 열어 같은 차시에 이어서 해도 됩니다.</p>
        ${stageChecks}
      </fieldset>
      <fieldset class="choice-group">
        <legend class="field__label">탐구할 명제</legend>
        <p class="field__help">모든 학생이 같은 명제로 활동합니다. 학생이 1단계를 시작한 뒤에는 바꿔도 그 학생의 기록에는 반영되지 않습니다.</p>
        ${researchChecks}
        <details class="disclosure">
          <summary>연습 명제에서 고르기 (${PROBLEMS.length}개)</summary>
          <div class="choice-group">${practiceChecks}</div>
        </details>
      </fieldset>
    </fieldset>

    <fieldset class="choice-group is-unavailable" disabled>
      <legend class="field__label">연구용 고급 설정 <span class="tag tag--proto">미구현</span></legend>
      <label class="check">
        <input type="checkbox"${classroom.flawedAiProofEnabled ? ' checked' : ''}>
        <span>오류가 포함된 AI 증명 제공 <span class="meta">기본값은 꺼짐입니다. 교사가 명시적으로 설정하고 관리하는 기능으로 따로 구현할 예정입니다.</span></span>
      </label>
    </fieldset>

    <div class="actions">
      <p class="save-status" data-settings-status aria-live="polite"></p>
      <button type="submit" class="button button--primary">설정 저장</button>
    </div>
  </form>`;
}

function activityTable() {
  const head = METHODS.map((m) => `<th scope="col">${escapeHtml(m.shortLabel)}</th>`).join('');
  const rows = SAMPLE_ACTIVITY.map((row) => {
    const recent = row.recent;
    const cells = METHODS.map((m) => `<td>${row.certified[m.id]} / ${LEVELS.length}</td>`).join('');
    return `<tr>
      <th scope="row">${escapeHtml(row.pseudonym)}</th>
      ${cells}
      <td>${escapeHtml(getMethod(recent.method).shortLabel)}, ${escapeHtml(getLevel(recent.levelId).title)}, ${escapeHtml(getProblem(recent.problemId).title)} (${escapeHtml(recent.result)})</td>
      <td>${escapeHtml(formatDateTime(row.lastActiveAt))}</td>
    </tr>`;
  }).join('');

  return `<div class="table-wrap" role="region" aria-labelledby="activity-heading" tabindex="0">
    <table class="data-table">
      <thead><tr><th scope="col">학생(가명)</th>${head}<th scope="col">최근 활동</th><th scope="col">마지막 활동</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function researchProgress(classroom) {
  const record = getResearch();
  const ids = propositionIdsFor(classroom);
  const rows = RESEARCH_STAGES.map((stage) => {
    const status = stageStatus(stage.n, classroom);
    const st = findStage(stage.n);
    const items = st ? ids.map((id) => st.items[id]).filter(Boolean) : [];
    const chats = items.reduce((sum, it) => sum + (it.chat?.messages.filter((m) => m.role === 'student').length ?? 0), 0);
    const pastes = items.reduce((sum, it) => sum + (it.pasteAttempts ?? 0), 0);
    const helped = items.filter((it) => (it.chat?.messages ?? []).some((m) => m.role === 'ai' && (m.coverage ?? 0) >= PROOF_HELP_MIN)).length;
    const matches = items.map((it) => it.transcriptMatch).filter((v) => v != null);
    const matchText = matches.length ? `, 옮겨 적기 일치 ${Math.round((matches.reduce((a, b) => a + b, 0) / matches.length) * 100)}%` : '';
    const offTopic = items.reduce((sum, it) => sum + (it.chat?.messages.filter((m) => m.role === 'student' && m.topic && m.topic !== 'proof').length ?? 0), 0);
    const byTeacher = items.filter((it) => it.transcriptCheck === 'teacher').length;
    const teacherText = byTeacher ? `, 필기로 옮겨 적음 ${byTeacher}개(교사 확인 필요)` : '';
    const extra = stage.n === 2 && st ? `질문 ${chats}회(증명과 무관 ${offTopic}회), 증명 도움 ${helped}/${items.length}, 붙여넣기 시도 ${pastes}회${matchText}${teacherText}` : '–';
    const proofField = { 1: 'proof', 2: 'aiProof', 4: 'proof' }[stage.n];
    const inked = proofField && st ? `${items.filter((it) => hasInk(inkOf(it, proofField))).length}/${items.length}` : '–';
    return `<tr>
      <th scope="row">${stage.n}단계 ${escapeHtml(stage.short)}</th>
      <td>${escapeHtml(status.label)}</td>
      <td>${st ? escapeHtml(formatDateTime(st.startedAt)) : '–'}</td>
      <td>${st?.submittedAt ? escapeHtml(formatDateTime(st.submittedAt)) : '–'}</td>
      <td>${st ? formatActive(st.activeMs) : '–'}</td>
      <td>${st ? `${st.leaves}회` : '–'}</td>
      <td>${inked}</td>
      <td>${extra}</td>
    </tr>`;
  }).join('');
  const fixed = record.propositionIds
    ? `<p class="meta">고정된 명제: ${record.propositionIds.map((id, i) => `명제 ${i + 1} ${escapeHtml(getProblem(id)?.title ?? id)}`).join(', ')}</p>`
    : '<p class="meta">아직 1단계를 시작하지 않았습니다.</p>';
  return `${fixed}
    <div class="table-wrap" role="region" aria-labelledby="research-progress-heading" tabindex="0">
      <table class="data-table">
        <thead><tr><th scope="col">단계</th><th scope="col">상태</th><th scope="col">시작</th><th scope="col">제출</th><th scope="col">작업 시간</th><th scope="col">화면 이탈</th><th scope="col">펜 필기</th><th scope="col">AI 대화</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}
