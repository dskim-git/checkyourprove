// 교사 설정 (설정 정리 작업, 2026-11-27 사용자 결정): 위쪽 탭으로 묶어 스크롤을 줄인다. 탭마다 주소가 있다.
//   #/teacher/settings/sessions  학급·세션: 학급, 회차, 진행 중 세션, 세션 코드
//   #/teacher/settings/research  탐구 진행(진행 중 세션): 탐구 열기, 단계 열기, 연구 동의 받기, 설문 고르기·열기, 원리 활동, 명제
//   #/teacher/settings/practice  증명 연습(학급별): 관리자 기본값을 학급마다 바꾸기
//   #/teacher/settings/grading   채점·분석 보기: 채점자, 블라인드, 채점 순서, 예시 학생, 동의하지 않은 학생, 포함할 세션, 점수 출처
// 연구 도구(루브릭, 대화 태그, 설문 문항, 동의서, 면담 후보 기준, AI 보조 채점자)는 관리자 설정에 있다.

import { getMethod } from '../../data/methods.js';
import { PROBLEMS } from '../../data/problems/index.js';
import { RESEARCH_PROPOSITIONS } from '../../data/researchPropositions.js';
import { RESEARCH_STAGES } from '../../data/research.js';
import { getClassroom, saveClassroom } from '../../state/classroomStore.js';
import {
  activeSession, activeSessionId, addClass, addSession, classPractice, ensureSessionCode, findSession, formatCode, getSessions, regenerateSessionCode,
  removeClass, removeSession, renameClass, sessionLabel, sessionsByClass, setActiveSession, setClassPractice, setSessionCodeOpen,
} from '../../state/sessionStore.js';
import { sessionMembers } from '../../state/accountStore.js';
import { getResearch, hasResearchRecord, resetResearch } from '../../state/researchStore.js';
import { listSurveys } from '../../state/surveyStore.js';
import { getAdmin, PRACTICE_FIELDS } from '../../state/adminStore.js';
import { getGrading, renameRater, saveGrading, updateGradingSettings } from '../../state/gradingStore.js';
import { escapeHtml, formatTime } from '../../ui/dom.js';
import { breadcrumb } from '../../ui/components.js';
import { settingsTabs } from '../../ui/settingsTabs.js';
import { sourceOf, sourcePicker } from './analysisHomeView.js';
import { handleScopeEvent, scopePicker } from './sessionScope.js';

export const TEACHER_TABS = [
  { id: 'sessions', label: '학급·세션', href: '#/teacher/settings/sessions' },
  { id: 'research', label: '탐구 진행', href: '#/teacher/settings/research' },
  { id: 'practice', label: '증명 연습', href: '#/teacher/settings/practice' },
  { id: 'grading', label: '채점·분석 보기', href: '#/teacher/settings/grading' },
];

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

function researchForm(classroom) {
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
    <fieldset class="choice-group">
      <legend class="field__label">AI와 탐구하기 (연구 모드): 진행 중 세션 ${escapeHtml(classroom.sessionLabel)}</legend>
      <p class="field__help">아래 설정은 진행 중 세션에만 적용됩니다. 다른 세션을 고치려면 "학급·세션" 탭에서 그 세션을 "진행 중으로" 바꾸세요.</p>
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

/** 증명 연습(학급별): 칸을 비우거나 "기본값"을 고르면 관리자 기본값을 따른다 */
function practiceForm(classId) {
  const base = getAdmin().practice;
  const own = classPractice(classId);
  const classes = getSessions().classes;
  return `<form class="settings-form" data-practice-form novalidate>
    <div class="field field--inline"><label class="field__label" for="pr-class">학급</label>
      <select class="field__select" id="pr-class" name="classId">${classes.map((c) => `<option value="${c.id}"${c.id === classId ? ' selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}</select></div>
    <p class="field__help">학급마다 관리자 기본값을 바꿀 수 있습니다. "기본값"을 고르면 관리자가 정한 값을 따릅니다. 이 학급의 세션 코드로 들어온 학생에게 적용됩니다.</p>
    ${PRACTICE_FIELDS.map((f) => {
      const v = own[f.id];
      if (f.type === 'bool') {
        const sel = v === undefined ? 'default' : v ? 'on' : 'off';
        return `<fieldset class="choice-group"><legend class="field__label">${escapeHtml(f.label)}</legend><p class="field__help">${escapeHtml(f.help)}</p>
          <div class="pick-group__options">${[['default', `기본값 (${base[f.id] ? '켬' : '끔'})`], ['on', '켬'], ['off', '끔']].map(([val, label]) => `<label class="pick pick--tag"><input type="radio" name="${f.id}" value="${val}"${sel === val ? ' checked' : ''}><span>${label}</span></label>`).join('')}</div></fieldset>`;
      }
      return `<div class="field"><label class="field__label" for="pr-${f.id}">${escapeHtml(f.label)}</label><p class="field__help" id="pr-${f.id}-help">${escapeHtml(f.help)} 비우면 기본값 ${base[f.id]}${escapeHtml(f.unit)}.</p>
        <span class="iv-criteria__input"><input type="number" class="field__input" id="pr-${f.id}" name="${f.id}" min="${f.min}" max="${f.max}" value="${v ?? ''}" placeholder="${base[f.id]}" aria-describedby="pr-${f.id}-help" inputmode="numeric"><span class="meta">${escapeHtml(f.unit)}</span></span></div>`;
    }).join('')}
    <div class="actions actions--start"><button type="submit" class="button button--primary">이 학급 연습 설정 저장</button></div>
  </form>`;
}

function gradingForm() {
  const g = getGrading();
  return `<form class="settings-form" data-grading-prefs novalidate>
    <fieldset class="choice-group"><legend class="field__label">채점자</legend>
      <div class="rater-names">${g.raters.map((r) => `<div class="field"><label class="field__label" for="rn-${r.id}">${r.id === 'r1' ? '채점자 1 (주 채점)' : '채점자 2'} 이름</label><input type="text" class="field__input" id="rn-${r.id}" name="rater-${r.id}" value="${escapeHtml(r.name)}"></div>`).join('')}</div>
      <div class="pick-group__options">${g.raters.map((r) => `<label class="pick pick--tag"><input type="radio" name="currentRater" value="${r.id}"${g.currentRater === r.id ? ' checked' : ''}><span>지금 채점: ${escapeHtml(r.name)}</span></label>`).join('')}</div>
    </fieldset>
    <label class="check"><input type="checkbox" name="blind"${g.blind ? ' checked' : ''}><span>블라인드 채점 <span class="meta">학생 이름과 단계를 가리고 채점자마다 정해진 무작위 순서로 보여 줍니다.</span></span></label>
    <fieldset class="choice-group"><legend class="field__label">채점 순서</legend>
      ${[['mixed', g.blind ? '섞어서' : '학생 순'], ['proposition', '같은 명제끼리'], ['propositionStage', '같은 명제·같은 단계끼리 (블라인드를 끄면)']].map(([v, l]) => `<label class="check${v === 'propositionStage' && g.blind ? ' is-unavailable' : ''}"><input type="radio" name="sortBy" value="${v}"${(g.sortBy ?? 'mixed') === v ? ' checked' : ''}${v === 'propositionStage' && g.blind ? ' disabled' : ''}><span>${l}</span></label>`).join('')}
    </fieldset>
    <label class="check"><input type="checkbox" name="includeSamples"${g.includeSamples ? ' checked' : ''}><span>예시 학생 포함 <span class="meta">화면 확인용 가상 학생 6명</span></span></label>
    <label class="check"><input type="checkbox" name="includeNonConsent"${g.includeNonConsent ? ' checked' : ''}><span>연구에 동의하지 않은 학생도 분석에 포함</span></label>
    ${sourcePicker(sourceOf())}
    ${scopePicker(g)}
    <p class="meta">채점·태그·분석·면담 화면이 함께 쓰는 설정입니다. 각 화면 위쪽에서도 바꿀 수 있습니다.</p>
  </form>`;
}

export function renderTeacherSettings(root, [tabParam]) {
  const tab = TEACHER_TABS.some((t) => t.id === tabParam) ? tabParam : 'sessions';
  let status = '';
  let practiceClass = activeSession()?.classId;

  const draw = (focus = null) => {
    const classroom = getClassroom();
    let body = '';
    if (tab === 'sessions') body = sessionPanel(status);
    if (tab === 'research') body = `<section class="panel" aria-labelledby="settings-heading"><h2 id="settings-heading" class="section-title">탐구 진행</h2>${researchForm(classroom)}</section>`;
    if (tab === 'practice') body = `<section class="panel" aria-labelledby="practice-heading"><h2 id="practice-heading" class="section-title">증명 연습 (학급별)</h2>${practiceForm(practiceClass)}<p class="save-status" role="status" data-tab-status>${escapeHtml(status)}</p></section>`;
    if (tab === 'grading') body = `<section class="panel" aria-labelledby="gp-heading"><h2 id="gp-heading" class="section-title">채점·분석 보기</h2>${gradingForm()}<p class="save-status" role="status" data-tab-status>${escapeHtml(status)}</p></section>`;
    root.innerHTML = `<div class="page page--teacher page--settings">
      ${breadcrumb([{ label: '교사 업무판', href: '#/teacher' }, { label: '교사 설정' }])}
      <header class="page-intro"><h1>교사 설정</h1><p class="lead">수업 운영에 필요한 설정입니다. 글자 크기 같은 내 화면 설정은 오른쪽 위 톱니바퀴(내 설정)에 있습니다.</p></header>
      ${settingsTabs(TEACHER_TABS, tab, '교사 설정')}
      ${body}
    </div>`;
    if (focus) root.querySelector(focus)?.focus();
  };

  const onSubmit = (event) => {
    const t = event.target;
    if (t.matches('[data-class-form]')) {
      event.preventDefault();
      const klass = addClass(t.querySelector('[name="className"]').value);
      status = klass ? `${klass.name} 학급을 만들었습니다. 회차를 만들어 연구를 시작하세요.` : '학급 이름을 쓰세요.';
      return draw('[data-class-form] [name="className"]');
    }
    if (t.matches('[data-class-rename]')) {
      event.preventDefault();
      renameClass(t.dataset.classRename, t.querySelector('input').value);
      status = '학급 이름을 바꾸었습니다.';
      return draw();
    }
    if (t.matches('[data-practice-form]')) {
      event.preventDefault();
      const patch = {};
      PRACTICE_FIELDS.forEach((f) => {
        if (f.type === 'bool') {
          const v = t.querySelector(`[name="${f.id}"]:checked`)?.value ?? 'default';
          patch[f.id] = v === 'default' ? null : v === 'on';
        } else {
          const raw = t.querySelector(`[name="${f.id}"]`).value.trim();
          patch[f.id] = raw === '' ? null : Math.min(f.max, Math.max(f.min, Number(raw)));
        }
      });
      setClassPractice(practiceClass, patch);
      status = `저장했습니다 (${formatTime(new Date().toISOString())}).`;
      return draw();
    }
    const form = root.querySelector('[data-settings-form]');
    if (t !== form) return;
    event.preventDefault();
    const data = new FormData(form);
    const propositionIds = data.getAll('researchPropositionIds');
    if (!propositionIds.length) {
      root.querySelector('[data-settings-status]').textContent = '탐구할 명제를 하나 이상 고르세요.';
      return;
    }
    saveClassroom({
      researchOpen: data.get('researchOpen') === 'on',
      researchPropositionIds: propositionIds,
      researchStagesOpen: data.getAll('researchStagesOpen').map(Number).sort(),
      consentRequired: data.get('consentRequired') === 'on',
      surveyId: data.get('surveyId') || null,
      surveyPreOpen: data.get('surveyPreOpen') === 'on',
      surveyPostOpen: data.get('surveyPostOpen') === 'on',
      principleOpen: data.get('principleOpen') === 'on',
    });
    root.querySelector('[data-settings-status]').textContent = `설정을 저장했습니다 (${formatTime(new Date().toISOString())}). 학생 화면에 바로 반영됩니다.`;
  };

  const onChange = (event) => {
    const t = event.target;
    const form = root.querySelector('[data-settings-form]');
    const st = root.querySelector('[data-settings-status]');
    if (form?.contains(t) && st) st.textContent = '저장하지 않은 변경 사항이 있습니다.';
    if (t.name === 'classId' && t.closest('[data-practice-form]')) {
      practiceClass = t.value;
      status = '';
      return draw('#pr-class');
    }
    if (!t.closest('[data-grading-prefs]')) return;
    if (handleScopeEvent(event, root)) return draw();
    if (t.name.startsWith('rater-')) {
      renameRater(t.name.slice(6), t.value);
      saveGrading();
    } else if (t.name === 'currentRater') updateGradingSettings({ currentRater: t.value });
    else if (t.name === 'analysisSource') updateGradingSettings({ analysisSource: t.value });
    else if (['blind', 'includeSamples', 'includeNonConsent'].includes(t.name)) updateGradingSettings({ [t.name]: t.checked });
    else if (t.name === 'sortBy') updateGradingSettings({ sortBy: t.value });
    status = '저장했습니다.';
    draw(t.id ? `#${t.id}` : `[name="${t.name}"]${t.type === 'radio' ? `[value="${t.value}"]` : ''}`);
  };

  const onClick = (event) => {
    if (tab === 'grading' && handleScopeEvent(event, root)) return draw();
    const act = event.target.closest('[data-session-action]');
    if (!act) return;
    const { sessionAction: action, sessionId, classId } = act.dataset;
    if (action === 'activate') {
      setActiveSession(sessionId);
      status = `진행 중 세션을 ${sessionLabel(findSession(sessionId))}(으)로 바꾸었습니다. 학생 화면은 이 세션으로 활동합니다.`;
    }
    if (action === 'new') {
      const session = addSession(classId);
      status = `${sessionLabel(session)}를 만들었습니다. "진행 중으로"를 누르면 학생 화면이 이 회차로 바뀝니다.`;
    }
    if (action === 'remove') {
      const session = findSession(sessionId);
      const has = hasResearchRecord(sessionId);
      if (!window.confirm(`${sessionLabel(session)}를 지울까요?${has ? ' 이 세션의 학생 연구 기록도 함께 지워지며 되돌릴 수 없습니다.' : ''}`)) return;
      resetResearch(sessionId);
      removeSession(sessionId);
      status = `${sessionLabel(session)}를 지웠습니다.`;
    }
    if (action === 'code-toggle') {
      const session = findSession(sessionId);
      setSessionCodeOpen(sessionId, session.codeOpen === false);
      status = `${sessionLabel(session)}의 세션 코드를 ${session.codeOpen === false ? '닫았습니다. 새로 들어올 수 없고, 이미 들어온 학생은 계속 활동합니다' : '열었습니다'}.`;
    }
    if (action === 'code-new') {
      const session = findSession(sessionId);
      if (!window.confirm(`${sessionLabel(session)}의 세션 코드를 새로 만들까요? 예전 코드로는 더 이상 들어올 수 없습니다(이미 들어온 학생은 그대로).`)) return;
      regenerateSessionCode(sessionId);
      status = `${sessionLabel(session)}의 새 세션 코드: ${formatCode(session.code)}`;
    }
    if (action === 'remove-class') {
      removeClass(classId);
      status = '학급을 지웠습니다.';
    }
    draw('[data-session-status]');
  };

  draw();
  root.addEventListener('submit', onSubmit);
  root.addEventListener('change', onChange);
  root.addEventListener('click', onClick);
  return () => {
    root.removeEventListener('submit', onSubmit);
    root.removeEventListener('change', onChange);
    root.removeEventListener('click', onClick);
  };
}
