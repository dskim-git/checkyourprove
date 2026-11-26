// 증명 연습 3: 명제 선택

import { getMethod } from '../../data/methods.js';
import { getLevel, levelIndex } from '../../data/levels.js';
import { problemsByMethod } from '../../data/problems/index.js';
import { isCertified, isUnlocked, clearedCount, requiredClears, problemStatus } from '../../state/practiceProgress.js';
import { escapeHtml } from '../../ui/dom.js';
import { breadcrumb, difficultyTag, notice, renderNotFound } from '../../ui/components.js';
import { practiceHref, statusBadge } from './practiceParts.js';

export function renderProblemSelect(root, [methodId, levelId]) {
  const method = getMethod(methodId);
  const level = getLevel(levelId);
  if (!method || !level) {
    renderNotFound(root);
    return null;
  }
  const crumbs = [
    { label: '홈', href: '#/' },
    { label: '증명 연습하기', href: '#/practice' },
    { label: method.label, href: practiceHref(method.id) },
    { label: level.title },
  ];

  if (!isUnlocked(method.id, levelIndex(level.id))) {
    root.innerHTML = `<div class="page">
      ${breadcrumb(crumbs)}
      <h1>${escapeHtml(level.title)}</h1>
      ${notice('lock', '아직 열리지 않은 단계입니다', '이전 단계를 먼저 인증하세요.')}
      <p><a class="button button--secondary" href="${practiceHref(method.id)}">활동 단계 목록으로</a></p>
    </div>`;
    return null;
  }

  const cleared = clearedCount(method.id, level.id);
  const required = requiredClears(method.id);
  const certified = isCertified(method.id, level.id);

  const items = problemsByMethod(method.id).map((problem) => {
    const status = problemStatus(level.id, problem.id);
    const buttonClass = status.state === 'new' ? 'button--primary' : 'button--secondary';
    return `<li class="problem">
      <div class="problem__main">
        <p class="problem__meta">${difficultyTag(problem.difficulty)}</p>
        <h3 class="problem__title">${escapeHtml(problem.title)}</h3>
        <p class="problem__statement">${escapeHtml(problem.statement)}</p>
      </div>
      <div class="problem__side">
        ${statusBadge(status)}
        <a class="button ${buttonClass}" href="${practiceHref(method.id, level.id, problem.id)}">
          ${escapeHtml(status.action)}<span class="visually-hidden">: ${escapeHtml(problem.title)}</span>
        </a>
      </div>
    </li>`;
  }).join('');

  root.innerHTML = `<div class="page">
    ${breadcrumb(crumbs)}
    <header class="page-intro">
      <p class="eyebrow">${escapeHtml(method.label)} · ${levelIndex(level.id) + 1}단계</p>
      <h1>${escapeHtml(level.title)}</h1>
      <p class="lead">${escapeHtml(level.summary)}</p>
    </header>
    <div class="cert-box${certified ? ' is-certified' : ''}">
      <p class="cert-box__title">${certified ? '이 단계를 인증했습니다' : `인증까지 명제 ${Math.max(required - cleared, 0)}개 남음`}</p>
      <p class="cert-box__meta">통과 ${cleared} / ${required} · 통과 기준: ${escapeHtml(level.passRule)}</p>
    </div>
    <section aria-labelledby="problem-list-heading" class="problem-section">
      <h2 id="problem-list-heading" class="section-title">명제를 고르세요</h2>
      <ul class="problem-list">${items}</ul>
    </section>
  </div>`;
  return null;
}
