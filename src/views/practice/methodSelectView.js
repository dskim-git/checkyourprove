// 증명 연습 1: 증명법 선택

import { METHODS } from '../../data/methods.js';
import { LEVELS } from '../../data/levels.js';
import { problemsByMethod } from '../../data/problems/index.js';
import { levelStates } from '../../state/practiceProgress.js';
import { escapeHtml } from '../../ui/dom.js';
import { icons } from '../../ui/icons.js';
import { breadcrumb } from '../../ui/components.js';
import { levelMeter } from './practiceParts.js';

export function renderMethodSelect(root) {
  const tiles = METHODS.map((method, index) => {
    const states = levelStates(method.id);
    const certified = states.filter((s) => s.certified).length;
    const next = states.find((s) => s.unlocked && !s.certified);
    const nextLine = next
      ? `다음 활동: ${escapeHtml(next.level.title)}`
      : certified === LEVELS.length ? '모든 단계를 인증했어요' : '';
    return `<li>
      <a class="method-card method-card--${index + 1}" href="#/practice/${method.id}">
        <span class="method-card__top">
          <span class="method-card__title">${escapeHtml(method.label)}</span>
          <span class="method-card__count num">${certified}<span>/${LEVELS.length}</span></span>
        </span>
        <span class="method-card__desc">${escapeHtml(method.description)}</span>
        ${levelMeter(states)}
        <span class="method-card__foot">
          <span>${nextLine}</span>
          <span class="method-card__meta">${escapeHtml(method.course)}, 명제 ${problemsByMethod(method.id).length}개</span>
        </span>
        <span class="method-card__go">${icons.chevronRight}</span>
      </a>
    </li>`;
  }).join('');

  root.innerHTML = `<div class="page">
    ${breadcrumb([{ label: '홈', href: '#/' }, { label: '증명 연습하기' }])}
    <header class="page-intro">
      <h1>어떤 증명법을 연습할까요?</h1>
      <p class="lead">증명법마다 일곱 가지 활동이 쉬운 것부터 차례로 열립니다.</p>
    </header>
    <a class="guide-link" href="#/practice/guide">
      <span class="guide-link__art" aria-hidden="true"><span>p</span>${icons.chevronRight}<span>q</span></span>
      <span class="guide-link__text"><span class="guide-link__title">증명법 한눈에 보기</span><span class="guide-link__desc">직접증명법과 간접증명법이 어떻게 다른지 그림과 움직임으로 살펴봐요.</span></span>
      <span class="guide-link__go">${icons.chevronRight}</span>
    </a>
    <ul class="method-list" aria-label="증명법 선택">${tiles}</ul>
  </div>`;
  return null;
}
