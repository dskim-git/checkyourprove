// AI와 탐구하기: 홈 (탐구할 명제와 4단계 지도)

import { getProblem } from '../../data/problems/index.js';
import { RESEARCH_STAGES } from '../../data/research.js';
import { getClassroom } from '../../state/classroomStore.js';
import { findStage, isItemComplete, propositionIdsFor, stageStatus } from '../../state/researchStore.js';
import { escapeHtml } from '../../ui/dom.js';
import { icons } from '../../ui/icons.js';
import { breadcrumb, notice } from '../../ui/components.js';
import { statementHtml } from '../../ui/mathText.js';

const STATE_TO_NODE = { submitted: 'certified', progress: 'here', open: 'here', waiting: 'locked', closed: 'locked' };

/** 지금 할 단계의 상태 한 줄 (홈 타일 등) */
export function researchSummary(classroom = getClassroom()) {
  if (!classroom.researchOpen) return '선생님이 아직 열지 않았어요';
  const current = RESEARCH_STAGES.find((s) => stageStatus(s.n, classroom).state !== 'submitted');
  if (!current) return '4단계를 모두 제출했어요';
  return `${current.n}단계 ${current.short}: ${stageStatus(current.n, classroom).label}`;
}

export function renderResearchHome(root) {
  const classroom = getClassroom();
  const crumbs = [{ label: '홈', href: '#/' }, { label: 'AI와 탐구하기' }];
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
      <p class="lead">명제 ${problems.length}개를 네 단계로 탐구합니다. 선생님이 단계를 열어 주면 시작할 수 있고, 제출한 단계는 고칠 수 없어요. AI는 2단계에서만 사용합니다.</p>
    </header>
    <details class="ref-card">
      <summary>이번 탐구의 명제 ${problems.length}개</summary>
      <ol class="statement-list">${problems.map((p, i) => `<li><span class="statement-list__num">명제 ${i + 1}</span><span>${statementHtml(p.statement)}</span></li>`).join('')}</ol>
    </details>
    <ol class="path path--stages" aria-label="탐구 단계">${nodes}</ol>
    <p class="note-chip">${icons.info}<span>사전 설문과 "AI는 어떻게 답할까?" 활동은 다음 업데이트에서 이 화면 앞에 추가됩니다.</span></p>
  </div>`;
  return null;
}
