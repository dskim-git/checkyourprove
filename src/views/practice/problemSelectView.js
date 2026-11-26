// 증명 연습 3: 명제 선택

import { getMethod } from '../../data/methods.js';
import { getLevel, levelIndex } from '../../data/levels.js';
import { problemsByMethod } from '../../data/problems/index.js';
import { isCertified, isUnlocked, clearedCount, requiredClears, problemStatus } from '../../state/practiceProgress.js';
import { escapeHtml } from '../../ui/dom.js';
import { icons } from '../../ui/icons.js';
import { breadcrumb, difficultyTag, notice, renderNotFound } from '../../ui/components.js';
import { practiceHref, statusBadge } from './practiceParts.js';

export function renderProblemSelect(root, [methodId, levelId]) {
  const method = getMethod(methodId);
  const level = getLevel(levelId);
  if (!method || !level) {
    renderNotFound(root);
    return null;
  }
  const number = levelIndex(level.id) + 1;
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
  const percent = Math.min(100, Math.round((cleared / required) * 100));

  const items = problemsByMethod(method.id).map((problem) => {
    const status = problemStatus(level.id, problem.id);
    return `<li>
      <a class="problem is-${status.state}" href="${practiceHref(method.id, level.id, problem.id)}">
        <span class="problem__main">
          <span class="problem__title">${escapeHtml(problem.title)}</span>
          <span class="problem__statement">${escapeHtml(problem.statement)}</span>
          <span class="problem__meta">${difficultyTag(problem.difficulty)}${statusBadge(status)}</span>
        </span>
        <span class="problem__action">${escapeHtml(status.action)}<span class="visually-hidden">: ${escapeHtml(problem.title)}</span>${icons.chevronRight}</span>
      </a>
    </li>`;
  }).join('');

  root.innerHTML = `<div class="page">
    ${breadcrumb(crumbs)}
    <header class="page-intro level-head">
      <span class="level-head__badge num" aria-hidden="true">${number}</span>
      <div>
        <h1><span class="visually-hidden">${number}단계: </span>${escapeHtml(level.title)}</h1>
        <p class="lead">${escapeHtml(level.summary)}</p>
      </div>
    </header>
    <div class="cert-box${certified ? ' is-certified' : ''}">
      <p class="cert-box__title">${certified ? `${icons.award}<span>이 단계를 인증했습니다</span>` : `<span>인증까지 명제 ${Math.max(required - cleared, 0)}개 남음</span>`}</p>
      <div class="progress" role="progressbar" aria-label="인증 진행" aria-valuemin="0" aria-valuemax="${required}" aria-valuenow="${Math.min(cleared, required)}"><span style="--value: ${percent}%"></span></div>
      <p class="cert-box__meta">통과 ${cleared} / ${required}</p>
      <details class="cert-box__rule"><summary>통과 기준</summary><p>${escapeHtml(level.passRule)}</p></details>
    </div>
    <section aria-labelledby="problem-list-heading" class="problem-section">
      <h2 id="problem-list-heading" class="section-title">명제를 고르세요</h2>
      <ul class="problem-list">${items}</ul>
    </section>
  </div>`;
  return null;
}
