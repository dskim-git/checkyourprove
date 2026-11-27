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
import {
  activeSessionId, addClass, addSession, ensureSessionCode, findSession, formatCode, regenerateSessionCode, removeClass, removeSession, renameClass,
  sessionLabel, sessionsByClass, setActiveSession, setSessionCodeOpen,
} from '../state/sessionStore.js';
import { sessionMembers } from '../state/accountStore.js';
import {
  findStage, getConsent, getResearch, getSurveyResponse, hasResearchRecord, inkOf, propositionIdsFor, resetResearch, stageStatus,
} from '../state/researchStore.js';
import { listSurveys } from '../state/surveyStore.js';
import { hasInk } from '../state/inkModel.js';
import { escapeHtml, formatDateTime, formatTime } from '../ui/dom.js';
import { breadcrumb, notice } from '../ui/components.js';
import { formatActive } from './research/stageView.js';
import { PROOF_HELP_MIN } from '../services/proofHelp.js';
import { fillRetentionAlert } from './teacher/recordingsView.js';

export function renderTeacher(root) {
  let sessionStatus = '';

  const draw = () => {
    const classroom = getClassroom();
    root.innerHTML = `<div class="page page--teacher">
    ${breadcrumb([{ label: '학생 화면', href: '#/' }, { label: '교사 화면 미리보기' }])}
    <header class="page-intro">
      <h1>수업 관리</h1>
      <p class="meta">교사 화면 미리보기</p>
      <p class="lead">증명 연습의 인증 기준과 AI와 탐구하기 활동을 정하고, 학생의 활동을 확인하는 화면의 기본 골격입니다.</p>
    </header>

    ${notice('warn', '프로토타입 상태입니다', '교사 권한 확인, 실제 학생 데이터, 서버 저장은 아직 연결되지 않았습니다. 설정은 이 브라우저에만 저장되며, 아래 학생 기록은 모두 예시 데이터입니다.')}
    <div data-retention-alert></div>

    ${sessionPanel(sessionStatus)}

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
        <span class="tag tag--proto">${escapeHtml(classroom.sessionLabel)}, 이 브라우저의 학생</span>
      </div>
      <p class="meta">서버 연결 전이라 진행 중 세션(${escapeHtml(classroom.sessionLabel)})에서 이 브라우저로 활동한 학생 한 명의 기록만 보입니다. 학생이 1단계를 시작하면 그때의 명제 목록으로 고정됩니다.</p>
      <div data-research-progress>${researchProgress(classroom)}</div>
      <div class="actions actions--start">
        <a class="button button--primary" href="#/teacher/grading">증명 채점하기</a>
        <a class="button button--secondary" href="#/teacher/chats">AI 대화 태그</a>
        <a class="button button--secondary" href="#/teacher/analysis">연구 분석</a>
        <a class="button button--secondary" href="#/teacher/interviews">면담</a>
        <a class="button button--secondary" href="#/teacher/recordings">녹음 관리</a>
        <a class="button button--secondary" href="#/teacher/admin">관리자</a>
        <a class="button button--secondary" href="#/teacher/rubric">채점 루브릭</a>
        <a class="button button--secondary" href="#/teacher/surveys">설문과 연구 동의</a>
        <a class="button button--secondary" href="#/teacher/principle">원리 활동 진행</a>
        <button type="button" class="button button--ghost" data-action="reset-research">이 세션의 연구 기록 초기화</button>
        <p class="actions__note" id="unimplemented-note">기록 내려받기(CSV)는 연구 분석 화면에, 면담 기록 CSV는 면담 화면에 있습니다. 녹음과 음성 전사는 서버 연결 뒤에 추가합니다.</p>
      </div>
    </section>
  </div>`;
  };

  const onChange = (event) => {
    const form = root.querySelector('[data-settings-form]');
    const status = root.querySelector('[data-settings-status]');
    if (form?.contains(event.target) && status) status.textContent = '저장하지 않은 변경 사항이 있습니다.';
  };

  const onSubmit = (event) => {
    if (event.target.matches('[data-class-form]')) {
      event.preventDefault();
      const input = event.target.querySelector('[name="className"]');
      const klass = addClass(input.value);
      sessionStatus = klass ? `${klass.name} 학급을 만들었습니다. 회차를 만들어 연구를 시작하세요.` : '학급 이름을 쓰세요.';
      draw();
      root.querySelector('[data-class-form] [name="className"]')?.focus();
      return;
    }
    if (event.target.matches('[data-class-rename]')) {
      event.preventDefault();
      renameClass(event.target.dataset.classRename, event.target.querySelector('input').value);
      sessionStatus = '학급 이름을 바꾸었습니다.';
      draw();
      return;
    }
    const form = root.querySelector('[data-settings-form]');
    if (event.target !== form) return;
    event.preventDefault();
    const data = new FormData(form);
    const propositionIds = data.getAll('researchPropositionIds');
    if (!propositionIds.length) {
      root.querySelector('[data-settings-status]').textContent = '탐구할 명제를 하나 이상 고르세요.';
      return;
    }
    saveClassroom({
      ...getClassroom(),
      requiredClears: Number(data.get('requiredClears')),
      unlockAll: data.get('unlockAll') === 'on',
      researchOpen: data.get('researchOpen') === 'on',
      researchPropositionIds: propositionIds,
      researchStagesOpen: data.getAll('researchStagesOpen').map(Number).sort(),
      consentRequired: data.get('consentRequired') === 'on',
      surveyId: data.get('surveyId') || null,
      surveyPreOpen: data.get('surveyPreOpen') === 'on',
      surveyPostOpen: data.get('surveyPostOpen') === 'on',
      principleOpen: data.get('principleOpen') === 'on',
    });
    root.querySelector('[data-research-progress]').innerHTML = researchProgress(getClassroom());
    root.querySelector('[data-session-panel]').outerHTML = sessionPanel('');
    root.querySelector('[data-settings-status]').textContent = `설정을 저장했습니다 (${formatTime(new Date().toISOString())}). 학생 화면에 바로 반영됩니다.`;
  };

  const onClick = (event) => {
    const act = event.target.closest('[data-session-action]');
    if (act) {
      const { sessionAction: action, sessionId, classId } = act.dataset;
      if (action === 'activate') {
        setActiveSession(sessionId);
        sessionStatus = `진행 중 세션을 ${sessionLabel(findSession(sessionId))}(으)로 바꾸었습니다. 학생 화면은 이 세션으로 활동합니다.`;
      }
      if (action === 'new') {
        const session = addSession(classId);
        sessionStatus = `${sessionLabel(session)}를 만들었습니다. "진행 중으로"를 누르면 학생 화면이 이 회차로 바뀝니다.`;
      }
      if (action === 'remove') {
        const session = findSession(sessionId);
        const has = hasResearchRecord(sessionId);
        if (!window.confirm(`${sessionLabel(session)}를 지울까요?${has ? ' 이 세션의 학생 연구 기록도 함께 지워지며 되돌릴 수 없습니다.' : ''}`)) return;
        resetResearch(sessionId);
        removeSession(sessionId);
        sessionStatus = `${sessionLabel(session)}를 지웠습니다.`;
      }
      if (action === 'code-toggle') {
        const session = findSession(sessionId);
        setSessionCodeOpen(sessionId, session.codeOpen === false);
        sessionStatus = `${sessionLabel(session)}의 세션 코드를 ${session.codeOpen === false ? '닫았습니다. 새로 들어올 수 없고, 이미 들어온 학생은 계속 활동합니다' : '열었습니다'}.`;
      }
      if (action === 'code-new') {
        const session = findSession(sessionId);
        if (!window.confirm(`${sessionLabel(session)}의 세션 코드를 새로 만들까요? 예전 코드로는 더 이상 들어올 수 없습니다(이미 들어온 학생은 그대로).`)) return;
        regenerateSessionCode(sessionId);
        sessionStatus = `${sessionLabel(session)}의 새 세션 코드: ${formatCode(session.code)}`;
      }
      if (action === 'remove-class') {
        removeClass(classId);
        sessionStatus = '학급을 지웠습니다.';
      }
      draw();
      root.querySelector('[data-session-status]')?.focus();
      return;
    }
    if (!event.target.closest('[data-action="reset-research"]')) return;
    if (!window.confirm(`진행 중 세션(${getClassroom().sessionLabel})에서 이 브라우저에 저장된 AI와 탐구하기 기록을 모두 지울까요? 시연·시험용 기능이며 되돌릴 수 없습니다.`)) return;
    resetResearch();
    root.querySelector('[data-research-progress]').innerHTML = researchProgress(getClassroom());
  };

  draw();
  fillRetentionAlert(root);
  root.addEventListener('change', onChange);
  root.addEventListener('submit', onSubmit);
  root.addEventListener('click', onClick);
  return () => {
    root.removeEventListener('change', onChange);
    root.removeEventListener('submit', onSubmit);
    root.removeEventListener('click', onClick);
  };
}

/** 연구 세션 관리: 학급 × 회차 */
function sessionPanel(status) {
  const activeId = activeSessionId();
  const stageText = (s) => (s.stagesOpen.length ? s.stagesOpen.map((n) => `${n}`).join(', ') + '단계 열림' : '열린 단계 없음');
  const groups = sessionsByClass().map((c) => {
    const rows = c.sessions.map((s) => {
      const record = getResearch(s.id);
      const submitted = [1, 2, 3, 4].filter((n) => record.stages?.[String(n)]?.submittedAt);
      const progress = record.propositionIds ? (submitted.length ? `${submitted.join(', ')}단계 제출` : '1단계 진행 중') : '아직 시작 전';
      const active = s.id === activeId;
      return `<li class="session-row${active ? ' is-active' : ''}">
        <div class="session-row__main">
          <strong class="session-row__round">${s.round}회차</strong>${active ? ' <span class="tag tag--mint">진행 중</span>' : ''}
          <span class="session-row__meta">연구 ${s.open ? escapeHtml(stageText(s)) : '닫힘'}, 명제 ${s.propositionIds.length}개, 이 브라우저 학생: ${escapeHtml(progress)}</span>
          <span class="session-code"><span class="meta">세션 코드</span> <strong class="session-code__value num${s.codeOpen === false ? ' is-closed' : ''}" data-session-code="${s.id}">${escapeHtml(formatCode(ensureSessionCode(s)))}</strong>${s.codeOpen === false ? ' <span class="tag tag--warn">코드 닫힘</span>' : ''} <span class="meta">들어온 사람 ${sessionMembers(s.id).length}명</span>
            <button type="button" class="button button--ghost button--small" data-session-action="code-toggle" data-session-id="${s.id}">${s.codeOpen === false ? '코드 열기' : '코드 닫기'}</button>
            <button type="button" class="button button--ghost button--small" data-session-action="code-new" data-session-id="${s.id}">코드 다시 만들기</button></span>
        </div>
        <div class="session-actions">${active ? '<span class="meta">학생 화면에 연결됨</span>' : `<button type="button" class="button button--secondary button--small" data-session-action="activate" data-session-id="${s.id}">진행 중으로</button>
          <button type="button" class="button button--ghost button--small" data-session-action="remove" data-session-id="${s.id}">지우기</button>`}</div>
      </li>`;
    }).join('');
    return `<div class="session-class">
      <div class="section-head">
        <h3 class="session-class__name">${escapeHtml(c.name)}</h3>
        <div class="actions actions--start">
          <button type="button" class="button button--secondary button--small" data-session-action="new" data-class-id="${c.id}">새 회차 만들기</button>
          ${c.sessions.length ? '' : `<button type="button" class="button button--ghost button--small" data-session-action="remove-class" data-class-id="${c.id}">학급 지우기</button>`}
        </div>
      </div>
      ${c.sessions.length ? `<ul class="session-list" aria-label="${escapeHtml(c.name)} 회차">${rows}</ul>` : '<p class="meta">아직 회차가 없습니다.</p>'}
      <details class="disclosure">
        <summary>학급 이름 바꾸기</summary>
        <form class="inline-form" data-class-rename="${c.id}"><label class="visually-hidden" for="rename-${c.id}">학급 이름</label><input type="text" class="field__input" id="rename-${c.id}" value="${escapeHtml(c.name)}"><button type="submit" class="button button--secondary button--small">바꾸기</button></form>
      </details>
    </div>`;
  }).join('');
  return `<section class="panel" aria-labelledby="session-heading" data-session-panel>
    <h2 id="session-heading" class="section-title">연구 세션 (학급 × 회차)</h2>
    <p class="meta">학급마다 연구 회차(1회차, 2회차 …)를 만들어 기록을 나누어 받습니다. 세션마다 탐구할 명제와 단계 열기를 따로 정하고, 학생 화면은 "진행 중" 세션으로 활동합니다. 연구 분석에서는 학급·회차를 골라 합쳐 볼 수 있습니다.</p>
    <p class="save-status" data-session-status tabindex="-1" aria-live="polite">${escapeHtml(status)}</p>
    ${groups}
    <form class="inline-form" data-class-form novalidate>
      <label class="field__label" for="new-class">새 학급</label>
      <input type="text" class="field__input" id="new-class" name="className" placeholder="예: 2반">
      <button type="submit" class="button button--secondary button--small">학급 만들기</button>
    </form>
  </section>`;
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
      <legend class="field__label">AI와 탐구하기 (연구 모드): 진행 중 세션 ${escapeHtml(classroom.sessionLabel)}</legend>
      <p class="field__help">아래 설정은 진행 중 세션에만 적용됩니다. 다른 세션을 고치려면 위에서 그 세션을 "진행 중으로" 바꾸세요.</p>
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
        <legend class="field__label">연구 동의와 설문</legend>
        <p class="field__help">동의를 받으면 학생은 1단계 전에 동의 여부를 고르고, 동의한 학생만 사전·사후 설문을 합니다. 동의하지 않은 학생도 활동은 똑같이 하고 기록은 연구 분석에서 빠집니다. 사전 설문은 1단계 전, 사후 설문은 4단계 제출 뒤에 합니다.</p>
        <label class="check"><input type="checkbox" name="consentRequired"${classroom.consentRequired ? ' checked' : ''}><span>연구 동의 받기</span></label>
        <div class="field field--inline">
          <label class="field__label" for="survey-id">설문 (사전·사후 같은 문항)</label>
          <select id="survey-id" name="surveyId" class="field__select">
            <option value=""${classroom.surveyId ? '' : ' selected'}>설문 하지 않음</option>
            ${listSurveys().map((s) => `<option value="${s.id}"${s.id === classroom.surveyId ? ' selected' : ''}>${escapeHtml(s.title)} (문항 ${s.questions.length}개${s.lockedAt ? ', 잠김' : ''})</option>`).join('')}
          </select>
          <a class="an-link" href="#/teacher/surveys">설문 문항 만들기·고치기</a>
        </div>
        <label class="check"><input type="checkbox" name="surveyPreOpen"${classroom.surveyPreOpen ? ' checked' : ''}><span>사전 설문 열기</span></label>
        <label class="check"><input type="checkbox" name="surveyPostOpen"${classroom.surveyPostOpen ? ' checked' : ''}><span>사후 설문 열기 <span class="meta">4단계를 제출한 학생만 할 수 있습니다.</span></span></label>
        <label class="check"><input type="checkbox" name="principleOpen"${classroom.principleOpen ? ' checked' : ''}><span>"AI는 어떻게 답할까?" 원리 활동 <span class="meta">사전 설문 뒤, 1단계 전에 합니다(설명 5장과 문항 11개, 약 20분). 동의하지 않은 학생도 수업 활동으로 합니다.</span></span></label>
        <a class="an-link" href="#/teacher/principle">원리 활동 진행 화면 (설명 띄우기, 학생에게 열 화면 정하기)</a>
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
  const consent = getConsent();
  const surveyState = (kind) => {
    const r = getSurveyResponse(kind);
    return r?.submittedAt ? `제출 (${formatDateTime(r.submittedAt)})` : r ? '작성 중' : '아직';
  };
  const researchLine = `<p class="meta">연구 동의: ${classroom.consentRequired ? (consent.agreed === true ? '동의함' : consent.agreed === false ? '참여하지 않음' : '아직 답하지 않음') : '받지 않음'}${classroom.surveyId ? `, 사전 설문: ${surveyState('pre')}, 사후 설문: ${surveyState('post')}` : ', 설문 하지 않음'}</p>`;
  return `${fixed}${researchLine}
    <div class="table-wrap" role="region" aria-labelledby="research-progress-heading" tabindex="0">
      <table class="data-table">
        <thead><tr><th scope="col">단계</th><th scope="col">상태</th><th scope="col">시작</th><th scope="col">제출</th><th scope="col">작업 시간</th><th scope="col">화면 이탈</th><th scope="col">펜 필기</th><th scope="col">AI 대화</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}
