// 증명 연습 1: 증명법 선택

import { METHODS } from '../../data/methods.js';
import { LEVELS } from '../../data/levels.js';
import { problemsByMethod } from '../../data/problems/index.js';
import { levelStates } from '../../state/practiceProgress.js';
import { escapeHtml } from '../../ui/dom.js';
import { breadcrumb } from '../../ui/components.js';
import { levelMeter } from './practiceParts.js';

export function renderMethodSelect(root) {
  const tiles = METHODS.map((method) => {
    const states = levelStates(method.id);
    const certified = states.filter((s) => s.certified).length;
    const next = states.find((s) => s.unlocked && !s.certified);
    return `<li>
      <a class="tile tile--method" href="#/practice/${method.id}">
        <span class="tile__eyebrow">${escapeHtml(method.course)}</span>
        <span class="tile__title">${escapeHtml(method.label)}</span>
        <span class="tile__desc">${escapeHtml(method.description)}</span>
        ${levelMeter(states)}
        <span class="tile__meta">인증 ${certified} / ${LEVELS.length}${next ? ` · 다음: ${escapeHtml(next.level.title)}` : certified === LEVELS.length ? ' · 모든 단계 인증' : ''} · 명제 ${problemsByMethod(method.id).length}개</span>
      </a>
    </li>`;
  }).join('');

  root.innerHTML = `<div class="page">
    ${breadcrumb([{ label: '홈', href: '#/' }, { label: '증명 연습하기' }])}
    <header class="page-intro">
      <h1>어떤 증명법을 연습할까요?</h1>
      <p class="lead">증명법마다 일곱 가지 활동이 쉬운 것부터 차례로 열립니다.</p>
    </header>
    <ul class="tile-grid tile-grid--two" aria-label="증명법 선택">${tiles}</ul>
  </div>`;
  return null;
}
