// 증명 연습 2: 활동 단계 지도 (쉬운 단계부터 길처럼 이어진다)
// 이전 단계를 인증해야 다음 단계가 열린다. 테스트 버전에서는 모든 단계가 열려 있다.

import { getMethod } from '../../data/methods.js';
import { TEST_FREE_NAVIGATION } from '../../data/levels.js';
import { getClassroom } from '../../state/classroomStore.js';
import { levelStates } from '../../state/practiceProgress.js';
import { escapeHtml } from '../../ui/dom.js';
import { icons } from '../../ui/icons.js';
import { breadcrumb, renderNotFound } from '../../ui/components.js';
import { practiceHref } from './practiceParts.js';

export function renderLevelSelect(root, [methodId]) {
  const method = getMethod(methodId);
  if (!method) {
    renderNotFound(root);
    return null;
  }
  const states = levelStates(method.id);
  const { unlockAll } = getClassroom();
  const here = states.find((s) => s.unlocked && !s.certified);

  const nodes = states.map((s) => {
    const { level } = s;
    const isHere = s === here;
    const mark = s.certified ? icons.check : s.unlocked ? `<span class="num">${s.index + 1}</span>` : icons.lock;
    const status = s.certified
      ? `인증 완료, 통과 ${s.cleared}개`
      : s.unlocked
        ? `인증까지 통과 ${s.cleared} / ${s.required}`
        : '잠김: 이전 단계를 인증하면 열립니다';
    const body = `<span class="path-node__dot" aria-hidden="true">${mark}</span>
      <span class="path-node__text">
        ${isHere ? '<span class="path-node__here">여기부터</span>' : ''}
        <span class="path-node__title">${escapeHtml(level.title)}</span>
        <span class="path-node__status">${status}</span>
        <span class="path-node__ai">${level.usesAi ? 'AI 사용' : 'AI 없이'}</span>
      </span>`;
    const label = `<span class="visually-hidden">${s.index + 1}단계${s.unlocked ? '' : '(잠김)'}: </span>`;
    return `<li class="path__step">
      ${s.unlocked
        ? `<a class="path-node is-${s.state}${isHere ? ' is-here' : ''}" href="${practiceHref(method.id, level.id)}">${label}${body}</a>`
        : `<div class="path-node is-locked" aria-disabled="true">${label}${body}</div>`}
    </li>`;
  }).join('');

  const freeNote = TEST_FREE_NAVIGATION
    ? '테스트 버전이라 인증과 관계없이 모든 단계가 열려 있습니다. 인증 기록은 그대로 쌓입니다.'
    : unlockAll ? '교사 화면에서 "모든 단계 열기"가 켜져 있어 모든 단계가 열려 있습니다. 인증 기록은 그대로 쌓입니다.' : '';

  root.innerHTML = `<div class="page">
    ${breadcrumb([{ label: '홈', href: '#/' }, { label: '증명 연습하기', href: '#/practice' }, { label: method.label }])}
    <header class="page-intro">
      <h1>${escapeHtml(method.label)}</h1>
      <p class="lead">위에서부터 쉬운 활동입니다. 한 단계에서 명제 ${states[0].required}개를 통과하면 인증 배지를 받고 다음 단계가 열립니다.</p>
    </header>
    ${freeNote ? `<p class="note-chip">${icons.info}<span>${freeNote}</span></p>` : ''}
    <ol class="path" aria-label="활동 단계">${nodes}</ol>
  </div>`;
  return null;
}
