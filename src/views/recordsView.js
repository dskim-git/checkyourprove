// 내 기록 보기: 증명법별 인증 현황, 최근 활동, AI와 탐구하기 기록

import { METHODS, getMethod } from '../data/methods.js';
import { LEVELS, getLevel } from '../data/levels.js';
import { getProblem } from '../data/problems/index.js';
import { RESEARCH_STAGES } from '../data/research.js';
import { getClassroom } from '../state/classroomStore.js';
import { listAttempts, clearAllAttempts } from '../state/attemptStore.js';
import { findStage, resetResearch, stageStatus } from '../state/researchStore.js';
import { formatActive } from './research/stageView.js';
import { levelStates } from '../state/practiceProgress.js';
import { passedCount, streak } from '../state/motivation.js';
import { escapeHtml, formatDateTime } from '../ui/dom.js';
import { icons } from '../ui/icons.js';
import { breadcrumb } from '../ui/components.js';
import { levelMeter, practiceHref, statusBadge } from './practice/practiceParts.js';

function attemptStatus(attempt) {
  const score = attempt.score != null ? ` ${attempt.score}점` : '';
  if (attempt.status === 'passed') return { state: 'passed', label: `통과${score}` };
  if (attempt.status === 'ended') return { state: 'ended', label: `미통과${score}` };
  return { state: 'progress', label: attempt.passedAt ? '다시 푸는 중 (통과 기록 있음)' : '진행 중' };
}

function summary() {
  const { days } = streak();
  return `<ul class="stat-strip" aria-label="나의 학습 현황">
    <li class="stat stat--streak${days > 0 ? ' is-on' : ''}"><span class="stat__icon">${icons.flame}</span><span class="stat__value num">${days}<span class="stat__unit">일</span></span><span class="stat__label">연속 학습</span></li>
    <li class="stat"><span class="stat__icon">${icons.check}</span><span class="stat__value num">${passedCount()}<span class="stat__unit">개</span></span><span class="stat__label">통과한 활동</span></li>
    <li class="stat"><span class="stat__icon">${icons.records}</span><span class="stat__value num">${listAttempts().length}<span class="stat__unit">개</span></span><span class="stat__label">활동 기록</span></li>
  </ul>`;
}

export function renderRecords(root) {
  const draw = () => {
    const certRows = METHODS.map((method) => {
      const states = levelStates(method.id);
      const certified = states.filter((s) => s.certified).length;
      return `<li class="cert-row">
        <div class="cert-row__main">
          <p class="cert-row__title">${escapeHtml(method.label)}</p>
          <p class="cert-row__count num">인증 ${certified} / ${LEVELS.length}</p>
        </div>
        ${levelMeter(states)}
        <a class="button button--secondary button--small" href="${practiceHref(method.id)}">연습하기<span class="visually-hidden">: ${escapeHtml(method.label)}</span></a>
      </li>`;
    }).join('');

    const attempts = listAttempts().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const rows = attempts.map((attempt) => {
      const problem = getProblem(attempt.problemId);
      const level = getLevel(attempt.levelId);
      if (!problem || !level) return '';
      return `<li>
        <a class="record" href="${practiceHref(attempt.method, attempt.levelId, attempt.problemId)}">
          <span class="record__main">
            <span class="record__title">${escapeHtml(problem.title)}</span>
            <span class="record__meta">${escapeHtml(getMethod(attempt.method).shortLabel)}, ${LEVELS.indexOf(level) + 1}단계 ${escapeHtml(level.title)}</span>
            <time class="record__time" datetime="${escapeHtml(attempt.updatedAt)}">${escapeHtml(formatDateTime(attempt.updatedAt))}</time>
          </span>
          ${statusBadge(attemptStatus(attempt))}
          <span class="visually-hidden">보기</span>
        </a>
      </li>`;
    }).join('');

    const classroom = getClassroom();
    const researchRows = RESEARCH_STAGES.map((stage) => {
      const status = stageStatus(stage.n, classroom);
      const record = findStage(stage.n);
      if (!record) return '';
      const meta = record.submittedAt
        ? `제출 ${escapeHtml(formatDateTime(record.submittedAt))}, 작업 시간 ${formatActive(record.activeMs)}`
        : `시작 ${escapeHtml(formatDateTime(record.startedAt))}, 작업 시간 ${formatActive(record.activeMs)}`;
      return `<li>
        <a class="record" href="#/research/${stage.n}">
          <span class="record__main">
            <span class="record__title">${stage.n}단계 ${escapeHtml(stage.title)}</span>
            <span class="record__meta">${meta}</span>
          </span>
          <span class="status status--${status.state === 'submitted' ? 'passed' : 'progress'}">${status.state === 'submitted' ? icons.done : icons.progress}<span>${escapeHtml(status.state === 'submitted' ? '제출 완료' : '진행 중')}</span></span>
          <span class="visually-hidden">보기</span>
        </a>
      </li>`;
    }).join('');
    const researchLine = researchRows
      ? `<ul class="record-list">${researchRows}</ul>`
      : '<p class="empty-text">아직 기록이 없습니다. <a href="#/research">AI와 탐구하기</a>에서 시작해 보세요.</p>';

    root.innerHTML = `<div class="page">
      ${breadcrumb([{ label: '홈', href: '#/' }, { label: '내 기록' }])}
      <header class="page-intro">
        <h1>내 기록</h1>
        <p class="lead">증명법별 인증 현황과 지금까지 한 활동을 확인합니다.</p>
      </header>
      ${summary()}

      <section class="panel" aria-labelledby="cert-heading">
        <h2 id="cert-heading" class="section-title">증명법별 인증 배지</h2>
        <ul class="cert-list">${certRows}</ul>
      </section>

      <section class="panel" aria-labelledby="recent-heading">
        <h2 id="recent-heading" class="section-title">증명 연습 기록</h2>
        ${rows
          ? `<ul class="record-list" aria-labelledby="recent-heading">${rows}</ul>`
          : '<p class="empty-text">아직 증명 연습 기록이 없습니다. <a href="#/practice">증명 연습하기</a>에서 첫 활동을 시작해 보세요.</p>'}
      </section>

      <section class="panel" aria-labelledby="research-record-heading">
        <h2 id="research-record-heading" class="section-title">AI와 탐구하기 기록</h2>
        ${researchLine}
      </section>

      <details class="disclosure proto-tools">
        <summary>프로토타입 도구</summary>
        <p class="disclosure__note">기록은 이 브라우저에만 임시로 보관됩니다.</p>
        <button type="button" class="button button--ghost" data-action="clear-all">이 브라우저의 기록 모두 지우기</button>
      </details>
    </div>`;
  };

  const onClick = (event) => {
    if (!event.target.closest('[data-action="clear-all"]')) return;
    if (!window.confirm('이 브라우저에 저장된 모든 기록(증명 연습, AI와 탐구하기)을 지울까요? 지운 내용은 되돌릴 수 없습니다.')) return;
    clearAllAttempts();
    resetResearch();
    draw();
  };

  draw();
  root.addEventListener('click', onClick);
  return () => root.removeEventListener('click', onClick);
}
