// 교사 업무판 (설정 정리 작업, 2026-11-27 사용자 결정): 설정은 빼고 오늘 할 일만 둔다.
// 공지·보관 기한 알림, 진행 중 세션(세션 코드, 탐구 열기·단계 열기 빠른 스위치), 업무 바로가기, 증명 연습·탐구 진행 현황.
// 설정은 교사 설정(#/teacher/settings), 관리자 설정(#/admin), 내 설정(#/settings)으로 나뉜다.

import { isFirebase } from '../state/appMode.js';
import { sessionRecords } from '../state/researchStore.js';
import { findUser } from '../state/accountStore.js';
import { METHODS, getMethod } from '../data/methods.js';
import { LEVELS, getLevel } from '../data/levels.js';
import { getProblem } from '../data/problems/index.js';
import { RESEARCH_STAGES } from '../data/research.js';
import { SAMPLE_ACTIVITY } from '../data/sampleRecords.js';
import { getClassroom, saveClassroom } from '../state/classroomStore.js';
import { activeSession, ensureSessionCode, formatCode, getSessions, sessionLabel, setActiveSession } from '../state/sessionStore.js';
import { sessionMembers } from '../state/accountStore.js';
import {
  findStage, getConsent, getResearch, getSurveyResponse, inkOf, propositionIdsFor, resetResearch, stageStatus,
} from '../state/researchStore.js';
import { hasInk } from '../state/inkModel.js';
import { escapeHtml, formatDateTime } from '../ui/dom.js';
import { breadcrumb, notice } from '../ui/components.js';
import { formatActive } from './research/stageView.js';
import { PROOF_HELP_MIN } from '../services/proofHelp.js';
import { fillRetentionAlert } from './teacher/recordingsView.js';

const TASKS = [
  { href: '#/teacher/grading', title: '증명 채점', desc: '1·2·4단계 증명을 루브릭으로 채점' },
  { href: '#/teacher/chats', title: 'AI 대화 태그', desc: '2단계 대화에 태그 붙이기' },
  { href: '#/teacher/analysis', title: '연구 분석', desc: '학생별 변화, 학급 분석, CSV' },
  { href: '#/teacher/interviews', title: '면담', desc: '후보 추천, 면담 기록과 녹음' },
  { href: '#/teacher/recordings', title: '녹음 관리', desc: '면담 녹음 듣기·내려받기' },
  { href: '#/teacher/principle', title: '원리 활동 진행', desc: '설명 띄우기, 학생에게 열 화면' },
];

export function renderTeacher(root) {
  let status = '';
  const draw = () => {
    const classroom = getClassroom();
    const session = activeSession();
    if (!session) {
      // 서버 모드: 아직 담당 학급·회차가 없다
      root.innerHTML = `<div class="page page--teacher">
        ${breadcrumb([{ label: '홈', href: '#/' }, { label: '교사 업무판' }])}
        <header class="page-intro board-head">
          <div><h1>교사 업무판</h1><p class="lead">오늘 수업에 필요한 일을 모았습니다.</p></div>
          <a class="button button--secondary" href="#/teacher/settings">교사 설정</a>
        </header>
        <section class="panel today" aria-labelledby="today-heading">
          <h2 id="today-heading" class="section-title">진행 중 세션</h2>
          <p>아직 담당 학급·회차가 없어요. 학급을 만들고 회차를 열면 세션 코드가 생기고, 학생은 그 코드로 들어와요.</p>
          <p><a class="button button--primary" href="#/teacher/settings/sessions">학급·세션 만들기</a></p>
        </section>
        <section class="panel" aria-labelledby="tasks-heading">
          <h2 id="tasks-heading" class="section-title">업무</h2>
          <ul class="task-grid">${TASKS.map((t) => `<li><a class="task-tile" href="${t.href}"><span class="task-tile__title">${escapeHtml(t.title)}</span><span class="task-tile__desc">${escapeHtml(t.desc)}</span></a></li>`).join('')}</ul>
        </section>
      </div>`;
      return;
    }
    root.innerHTML = `<div class="page page--teacher">
    ${breadcrumb([{ label: '홈', href: '#/' }, { label: '교사 업무판' }])}
    <header class="page-intro board-head">
      <div><h1>교사 업무판</h1><p class="lead">오늘 수업에 필요한 일을 모았습니다.</p></div>
      <a class="button button--secondary" href="#/teacher/settings">교사 설정</a>
    </header>
    ${isFirebase
      ? notice('warn', '서버 연결 진행 중입니다', '학급·세션과 학생의 탐구·연습 기록은 서버에 저장됩니다. 채점·대화 태그·면담·설문 편집과 원리 활동 진행 제어는 아직 이 브라우저에만 저장됩니다(다음 단계에서 옮김). 아래 증명 연습 현황은 예시 데이터입니다.')
      : notice('warn', '프로토타입 상태입니다', '교사 권한 확인, 실제 학생 데이터, 서버 저장은 아직 연결되지 않았습니다. 설정은 이 브라우저에만 저장되며, 아래 학생 기록은 모두 예시 데이터입니다.')}
    <div data-retention-alert></div>

    <section class="panel today" aria-labelledby="today-heading" data-today>
      <div class="section-head">
        <h2 id="today-heading" class="section-title">진행 중 세션</h2>
        <span class="today__code"><span class="meta">세션 코드</span> <strong class="session-code__value num">${escapeHtml(formatCode(ensureSessionCode(session)))}</strong> <span class="meta">들어온 사람 ${sessionMembers(session.id).length}명</span></span>
      </div>
      <div class="field field--inline"><label class="field__label" for="today-session">세션</label>
        <select class="field__select" id="today-session" name="activeSession">${getSessions().sessions.map((s) => `<option value="${s.id}"${s.id === session.id ? ' selected' : ''}>${escapeHtml(sessionLabel(s))}</option>`).join('')}</select></div>
      <div class="today__switches">
        <label class="check"><input type="checkbox" name="quickOpen"${classroom.researchOpen ? ' checked' : ''}><span>학생 홈에서 AI와 탐구하기 열기</span></label>
        <fieldset class="choice-group"><legend class="field__label">단계 열기</legend>
          <div class="pick-group__options">${RESEARCH_STAGES.map((st) => `<label class="pick pick--tag"><input type="checkbox" name="quickStage" value="${st.n}"${classroom.researchStagesOpen.includes(st.n) ? ' checked' : ''}><span>${st.n}단계 ${escapeHtml(st.title)}</span></label>`).join('')}</div>
        </fieldset>
      </div>
      <p class="save-status" role="status" data-today-status>${escapeHtml(status)}</p>
      <p class="meta"><a href="#/teacher/settings/research">탐구 진행 설정 전체</a>(연구 동의, 설문, 원리 활동, 명제) · <a href="#/teacher/settings/sessions">학급·세션 관리</a></p>
    </section>

    <section class="panel" aria-labelledby="tasks-heading">
      <h2 id="tasks-heading" class="section-title">업무</h2>
      <ul class="task-grid">${TASKS.map((t) => `<li><a class="task-tile" href="${t.href}"><span class="task-tile__title">${escapeHtml(t.title)}</span><span class="task-tile__desc">${escapeHtml(t.desc)}</span></a></li>`).join('')}</ul>
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
        <span class="tag tag--proto">${escapeHtml(classroom.sessionLabel)}${isFirebase ? '' : ', 이 브라우저의 학생'}</span>
      </div>
      ${isFirebase
        ? `<div data-research-progress>${serverProgress(session)}</div>`
        : `<p class="meta">서버 연결 전이라 진행 중 세션(${escapeHtml(classroom.sessionLabel)})에서 이 브라우저로 활동한 학생 한 명의 기록만 보입니다. 학생이 1단계를 시작하면 그때의 명제 목록으로 고정됩니다.</p>
      <div data-research-progress>${researchProgress(classroom)}</div>
      <div class="actions actions--start">
        <button type="button" class="button button--ghost" data-action="reset-research">이 세션의 연구 기록 초기화</button>
      </div>`}
    </section>
  </div>`;
  };

  const onChange = (event) => {
    const t = event.target;
    if (t.name === 'activeSession') {
      setActiveSession(t.value);
      status = `진행 중 세션을 ${getClassroom().sessionLabel}(으)로 바꾸었습니다.`;
    } else if (t.name === 'quickOpen') {
      saveClassroom({ researchOpen: t.checked });
      status = t.checked ? 'AI와 탐구하기를 열었습니다.' : 'AI와 탐구하기를 닫았습니다.';
    } else if (t.name === 'quickStage') {
      const stages = [...root.querySelectorAll('[name="quickStage"]:checked')].map((b) => Number(b.value)).sort();
      saveClassroom({ researchStagesOpen: stages });
      status = stages.length ? `${stages.join(', ')}단계를 열었습니다.` : '모든 단계를 닫았습니다.';
    } else return;
    const sel = t.name === 'quickStage' ? `[name="quickStage"][value="${t.value}"]` : `[name="${t.name}"]`;
    draw();
    fillRetentionAlert(root);
    root.querySelector(sel)?.focus();
  };

  const onClick = (event) => {
    if (!event.target.closest('[data-action="reset-research"]')) return;
    if (!window.confirm(`진행 중 세션(${getClassroom().sessionLabel})에서 이 브라우저에 저장된 AI와 탐구하기 기록을 모두 지울까요? 시연·시험용 기능이며 되돌릴 수 없습니다.`)) return;
    resetResearch();
    root.querySelector('[data-research-progress]').innerHTML = researchProgress(getClassroom());
  };

  draw();
  fillRetentionAlert(root);
  root.addEventListener('change', onChange);
  root.addEventListener('click', onClick);
  return () => {
    root.removeEventListener('change', onChange);
    root.removeEventListener('click', onClick);
  };
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

/** 서버 모드: 진행 중 세션에 들어온 학생들의 단계별 시작·제출 수 */
function serverProgress(session) {
  const students = [...sessionRecords(session.id)].filter(([uid]) => {
    const u = findUser(uid);
    return !u || u.role === 'student' || u.role === 'guest';
  }).map(([, record]) => record);
  const joined = sessionMembers(session.id).filter((u) => u.role === 'student' || u.role === 'guest').length;
  const rows = RESEARCH_STAGES.map((stage) => {
    const started = students.filter((r) => r.stages?.[String(stage.n)]).length;
    const submitted = students.filter((r) => r.stages?.[String(stage.n)]?.submittedAt).length;
    return `<tr><th scope="row">${stage.n}단계 ${escapeHtml(stage.short)}</th><td class="num">${started}명</td><td class="num">${submitted}명</td></tr>`;
  }).join('');
  return `<p class="meta">세션 코드로 들어온 학생 ${joined}명, 탐구 기록이 있는 학생 ${students.length}명</p>
    <div class="table-wrap" role="region" aria-label="단계별 진행" tabindex="0"><table class="data-table">
      <thead><tr><th scope="col">단계</th><th scope="col">시작</th><th scope="col">제출</th></tr></thead><tbody>${rows}</tbody></table></div>`;
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
