// 내 기록 보기: 증명법별 인증 현황, 최근 활동, AI와 탐구하기 기록

import { METHODS, getMethod } from '../data/methods.js';
import { LEVELS, getLevel } from '../data/levels.js';
import { getProblem } from '../data/problems/index.js';
import { MODES } from '../data/modes.js';
import { getClassroom } from '../state/classroomStore.js';
import { listAttempts, clearAllAttempts } from '../state/attemptStore.js';
import { findSession, clearAllSessions } from '../state/sessionStore.js';
import { levelStates } from '../state/practiceProgress.js';
import { escapeHtml, formatDateTime } from '../ui/dom.js';
import { icons } from '../ui/icons.js';
import { breadcrumb } from '../ui/components.js';
import { levelMeter, practiceHref, statusBadge } from './practice/practiceParts.js';

function attemptStatus(attempt) {
  const score = attempt.score != null ? ` · ${attempt.score}점` : '';
  if (attempt.status === 'passed') return { state: 'passed', label: `통과${score}` };
  if (attempt.status === 'ended') return { state: 'ended', label: `미통과${score}` };
  return { state: 'progress', label: attempt.passedAt ? '다시 푸는 중 (통과 기록 있음)' : '진행 중' };
}

export function renderRecords(root) {
  const draw = () => {
    const certRows = METHODS.map((method) => {
      const states = levelStates(method.id);
      const certified = states.filter((s) => s.certified).length;
      return `<li class="cert-row">
        <div class="cert-row__main">
          <p class="cert-row__title">${escapeHtml(method.label)}</p>
          ${levelMeter(states)}
        </div>
        <p class="cert-row__count">인증 ${certified} / ${LEVELS.length}</p>
        <a class="button button--secondary" href="${practiceHref(method.id)}">연습하기<span class="visually-hidden">: ${escapeHtml(method.label)}</span></a>
      </li>`;
    }).join('');

    const attempts = listAttempts().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const rows = attempts.map((attempt) => {
      const problem = getProblem(attempt.problemId);
      const level = getLevel(attempt.levelId);
      if (!problem || !level) return '';
      return `<tr>
        <td>${escapeHtml(formatDateTime(attempt.updatedAt))}</td>
        <td>${escapeHtml(getMethod(attempt.method).shortLabel)}</td>
        <td>${escapeHtml(level.title)}</td>
        <td>${escapeHtml(problem.title)}</td>
        <td>${statusBadge(attemptStatus(attempt))}</td>
        <td><a href="${practiceHref(attempt.method, attempt.levelId, attempt.problemId)}">보기<span class="visually-hidden">: ${escapeHtml(level.title)} ${escapeHtml(problem.title)}</span></a></td>
      </tr>`;
    }).join('');

    const classroom = getClassroom();
    const researchProblem = getProblem(classroom.researchProblemId);
    const researchSession = researchProblem ? findSession('research', researchProblem.id) : null;
    const researchLine = !researchSession || !researchSession.draft.text.trim()
      ? '<p class="empty-text">아직 기록이 없습니다.</p>'
      : `<p>${escapeHtml(researchProblem.title)} · ${researchSession.completedAt
          ? `${icons.done} 완료 (${escapeHtml(formatDateTime(researchSession.completedAt))})`
          : `${icons.progress} 진행 중 (${researchSession.step + 1} / ${MODES.research.steps.length}단계)`}
          · <a href="#/research/${researchProblem.id}">보기</a></p>`;

    root.innerHTML = `<div class="page">
      ${breadcrumb([{ label: '홈', href: '#/' }, { label: '내 기록' }])}
      <header class="page-intro">
        <h1>내 기록</h1>
        <p class="lead">증명법별 인증 현황과 지금까지 한 활동을 확인합니다.</p>
      </header>

      <section class="panel" aria-labelledby="cert-heading">
        <h2 id="cert-heading" class="section-title">증명법별 인증 현황</h2>
        <ul class="cert-list">${certRows}</ul>
      </section>

      <section class="panel" aria-labelledby="recent-heading">
        <h2 id="recent-heading" class="section-title">증명 연습 기록</h2>
        ${rows
          ? `<div class="table-wrap" role="region" aria-labelledby="recent-heading" tabindex="0">
              <table class="data-table">
                <thead><tr><th scope="col">마지막 활동</th><th scope="col">증명법</th><th scope="col">활동</th><th scope="col">명제</th><th scope="col">결과</th><th scope="col"><span class="visually-hidden">열기</span></th></tr></thead>
                <tbody>${rows}</tbody>
              </table>
            </div>`
          : '<p class="empty-text">아직 증명 연습 기록이 없습니다.</p>'}
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
    clearAllSessions();
    draw();
  };

  draw();
  root.addEventListener('click', onClick);
  return () => root.removeEventListener('click', onClick);
}
