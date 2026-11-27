// AI와 탐구하기: 홈 (탐구할 명제와 4단계 지도)

import { getProblem } from '../../data/problems/index.js';
import { RESEARCH_STAGES } from '../../data/research.js';
import { getClassroom } from '../../state/classroomStore.js';
import {
  findStage, getConsent, getPrinciple, getSurveyResponse, isItemComplete, postSurveyState, preStageBlocker, propositionIdsFor, researchParticipating, stageStatus,
} from '../../state/researchStore.js';
import { escapeHtml } from '../../ui/dom.js';
import { icons } from '../../ui/icons.js';
import { breadcrumb, notice } from '../../ui/components.js';
import { statementHtml } from '../../ui/mathText.js';
import { currentUser, isApproved } from '../../state/accountStore.js';
import { activeSessionId, setActiveSession } from '../../state/sessionStore.js';
import { joinByCode, sessionCodeForm } from '../accountView.js';

const STATE_TO_NODE = { submitted: 'certified', progress: 'here', open: 'here', waiting: 'locked', closed: 'locked' };

/** 준비·마무리 단계 한 줄: { href, title, desc, status, state: 'here'|'done'|'locked'|'skip' } */
function taskRow({ href, title, desc, status, state }) {
  const mark = state === 'done' ? icons.check : state === 'locked' ? icons.lock : state === 'skip' ? icons.x : icons.pencil;
  const inner = `<span class="task-row__mark" aria-hidden="true">${mark}</span>
    <span class="task-row__text"><span class="task-row__title">${escapeHtml(title)}</span><span class="task-row__desc">${escapeHtml(desc)}</span><span class="task-row__status">${escapeHtml(status)}</span></span>`;
  return `<li>${href ? `<a class="task-row is-${state}" href="${href}">${inner}</a>` : `<div class="task-row is-${state}" aria-disabled="true">${inner}</div>`}</li>`;
}

/** 준비: 연구 동의, 사전 설문 (1단계를 시작하기 전) */
function prepSection(classroom) {
  const rows = [];
  if (classroom.consentRequired) {
    const c = getConsent();
    rows.push(taskRow({
      href: '#/research/consent',
      title: '연구 참여 동의',
      desc: '내 기록을 연구에 써도 되는지 고릅니다. 참여하지 않아도 활동은 똑같이 해요.',
      status: c.agreed === true ? '동의함 (바꿀 수 있어요)' : c.agreed === false ? '참여하지 않음 (바꿀 수 있어요)' : '먼저 답해 주세요',
      state: c.agreed == null ? 'here' : 'done',
    }));
  }
  if (classroom.surveyId) {
    const res = getSurveyResponse('pre');
    const participating = researchParticipating(classroom);
    const blocker = preStageBlocker(classroom);
    let row;
    if (res?.submittedAt) row = { href: '#/research/survey/pre', status: '제출 완료', state: 'done' };
    else if (!participating && getConsent().agreed === false) row = { status: '연구에 참여하지 않아 하지 않아요', state: 'skip' };
    else if (blocker?.step === 'consent') row = { status: '연구 동의 뒤에 할 수 있어요', state: 'locked' };
    else if (!classroom.surveyPreOpen) row = { status: '선생님이 아직 열지 않았어요', state: 'locked' };
    else row = { href: '#/research/survey/pre', status: res ? '작성 중' : '시작할 수 있어요', state: 'here' };
    rows.push(taskRow({ title: '사전 설문', desc: '탐구를 시작하기 전 지금의 생각을 답합니다.', ...row }));
  }
  if (classroom.principleOpen) {
    const pr = getPrinciple();
    const blocker = preStageBlocker(classroom);
    const answered = pr ? Object.keys(pr.answers).length : 0;
    let row;
    if (pr?.finishedAt) row = { href: '#/research/principle', status: '마침 (다시 볼 수 있어요)', state: 'done' };
    else if (blocker && blocker.step !== 'principle') row = { status: blocker.step === 'consent' ? '연구 동의 뒤에 할 수 있어요' : '사전 설문 뒤에 할 수 있어요', state: 'locked' };
    else row = { href: '#/research/principle', status: !pr ? '약 20분, 시작할 수 있어요' : answered ? `${answered}문항 했어요, 이어서 하기` : '설명을 보는 중, 이어서 하기', state: 'here' };
    rows.push(taskRow({ title: 'AI는 어떻게 답할까?', desc: 'AI가 답을 만드는 원리를 그림으로 보고, AI 답을 확인하는 방법을 문제로 익힙니다.', ...row }));
  }
  if (!rows.length) return '';
  return `<section class="task-group" aria-labelledby="prep-title"><h2 class="task-group__title" id="prep-title">시작하기 전에</h2><ol class="task-list">${rows.join('')}</ol></section>`;
}

/** 마무리: 사후 설문 (4단계 제출 뒤) */
function postSection(classroom) {
  const state = postSurveyState(classroom);
  if (state === 'none') return '';
  const map = {
    closed: { status: '선생님이 아직 열지 않았어요', state: 'locked' },
    waiting: { status: '4단계를 제출하면 할 수 있어요', state: 'locked' },
    open: { href: '#/research/survey/post', status: '시작할 수 있어요', state: 'here' },
    progress: { href: '#/research/survey/post', status: '작성 중', state: 'here' },
    submitted: { href: '#/research/survey/post', status: '제출 완료', state: 'done' },
  };
  return `<section class="task-group" aria-labelledby="post-title"><h2 class="task-group__title" id="post-title">마무리</h2><ol class="task-list">${taskRow({ title: '사후 설문', desc: '탐구를 마친 뒤 사전 설문과 같은 문항에 다시 답합니다.', ...map[state] })}</ol></section>`;
}

/** 지금 할 단계의 상태 한 줄 (홈 타일 등) */
export function researchSummary(classroom = getClassroom()) {
  if (!classroom.researchOpen) return '선생님이 아직 열지 않았어요';
  const current = RESEARCH_STAGES.find((s) => stageStatus(s.n, classroom).state !== 'submitted');
  if (!current) return '4단계를 모두 제출했어요';
  return `${current.n}단계 ${current.short}: ${stageStatus(current.n, classroom).label}`;
}

/**
 * 계정으로 로그인한 학생·일반인은 세션 코드로 들어온 세션에서만 탐구한다(로드맵 3단계 사용자 결정).
 * 로그인하지 않은 상태(프로토타입 미리보기)는 지금처럼 교사가 고른 진행 중 세션으로 활동한다.
 * 돌려줌: 대신 그릴 화면이 있으면 그 정리 함수, 없으면 undefined(탐구 홈을 그린다)
 */
function sessionGate(root, crumbs) {
  const user = currentUser();
  if (!user || user.role === 'admin' || user.role === 'teacher') return undefined;
  if (!isApproved(user)) {
    root.innerHTML = `<div class="page">${breadcrumb(crumbs)}<h1>AI와 탐구하기</h1>${notice('lock', '가입 승인을 기다리고 있어요', '관리자가 승인하면 세션 코드로 들어올 수 있어요.')}<p><a class="button button--secondary" href="#/account">계정 보기</a></p></div>`;
    return null;
  }
  if (user.sessionIds.includes(activeSessionId())) return undefined;
  if (user.sessionIds.length) {
    // 프로토타입: 이 기기의 진행 세션을 이 사용자가 마지막으로 들어간 세션으로 맞춘다
    setActiveSession(user.sessionIds[user.sessionIds.length - 1]);
    return undefined;
  }
  let error = '';
  const draw = () => {
    root.innerHTML = `<div class="page">${breadcrumb(crumbs)}
      <header class="page-intro"><h1>AI와 탐구하기</h1><p class="lead">선생님이 알려 준 세션 코드를 입력하면 시작할 수 있어요.</p></header>
      <section class="panel account-box">${sessionCodeForm({ error })}</section>
    </div>`;
    root.querySelector('#session-code')?.focus();
  };
  const onSubmit = (event) => {
    if (!event.target.matches('[data-code-form]')) return;
    event.preventDefault();
    const result = joinByCode(event.target.querySelector('[name="code"]').value);
    const done = (err) => {
      error = err;
      if (err) draw();
    };
    // 서버 모드는 Promise(서버가 코드를 확인), 프로토타입은 바로
    if (typeof result === 'string') done(result);
    else result.then(done);
  };
  draw();
  root.addEventListener('submit', onSubmit);
  return () => root.removeEventListener('submit', onSubmit);
}

export function renderResearchHome(root) {
  const crumbs = [{ label: '홈', href: '#/' }, { label: 'AI와 탐구하기' }];
  const gate = sessionGate(root, crumbs);
  if (gate !== undefined) return gate;
  const classroom = getClassroom();
  if (!classroom.researchOpen) {
    root.innerHTML = `<div class="page">
      ${breadcrumb(crumbs)}
      <h1>AI와 탐구하기</h1>
      ${notice('lock', '아직 열리지 않았습니다', '선생님이 AI와 탐구하기를 열면 시작할 수 있습니다.')}
    </div>`;
    return null;
  }

  const ids = propositionIdsFor(classroom);
  const problems = ids.map(getProblem).filter(Boolean);
  const nodes = RESEARCH_STAGES.map((stage) => {
    const status = stageStatus(stage.n, classroom);
    const record = findStage(stage.n);
    const done = record ? ids.filter((id) => record.items[id] && isItemComplete(stage.n, record.items[id])).length : 0;
    const progress = status.state === 'progress' ? `, 명제 ${done}/${ids.length} 작성` : '';
    const enterable = ['open', 'progress', 'submitted'].includes(status.state);
    const node = STATE_TO_NODE[status.state];
    const mark = status.state === 'submitted' ? icons.check : enterable ? `<span class="num">${stage.n}</span>` : icons.lock;
    const body = `<span class="path-node__dot" aria-hidden="true">${mark}</span>
      <span class="path-node__text">
        ${enterable && status.state !== 'submitted' ? '<span class="path-node__here">지금 할 단계</span>' : ''}
        <span class="path-node__title">${stage.n}단계 ${escapeHtml(stage.title)}</span>
        <span class="path-node__desc">${escapeHtml(stage.summary)}</span>
        <span class="path-node__status">${escapeHtml(status.label)}${progress}</span>
        ${stage.usesAi ? '<span class="path-node__ai">AI 사용</span>' : ''}
      </span>`;
    return `<li class="path__step">
      ${enterable
        ? `<a class="path-node is-${node}" href="#/research/${stage.n}">${body}</a>`
        : `<div class="path-node is-locked" aria-disabled="true">${body}</div>`}
    </li>`;
  }).join('');

  root.innerHTML = `<div class="page">
    ${breadcrumb(crumbs)}
    <header class="page-intro">
      <h1>AI와 탐구하기</h1>
      <p class="grade-who"><span class="tag">${escapeHtml(classroom.sessionLabel)}</span></p>
      <p class="lead">명제 ${problems.length}개를 네 단계로 탐구합니다. 선생님이 단계를 열어 주면 시작할 수 있고, 제출한 단계는 고칠 수 없어요. AI는 2단계에서만 사용합니다.</p>
    </header>
    <details class="ref-card">
      <summary>이번 탐구의 명제 ${problems.length}개</summary>
      <ol class="statement-list">${problems.map((p, i) => `<li><span class="statement-list__num">명제 ${i + 1}</span><span>${statementHtml(p.statement)}</span></li>`).join('')}</ol>
    </details>
    ${prepSection(classroom)}
    <ol class="path path--stages" aria-label="탐구 단계">${nodes}</ol>
    ${postSection(classroom)}
  </div>`;
  return null;
}
