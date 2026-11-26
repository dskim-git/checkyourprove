// 증명 연습 2: 활동 단계 선택 (이전 단계를 인증해야 다음 단계가 열림)

import { getMethod } from '../../data/methods.js';
import { TEST_FREE_NAVIGATION } from '../../data/levels.js';
import { getClassroom } from '../../state/classroomStore.js';
import { levelStates } from '../../state/practiceProgress.js';
import { escapeHtml } from '../../ui/dom.js';
import { icons } from '../../ui/icons.js';
import { breadcrumb, notice, renderNotFound } from '../../ui/components.js';
import { practiceHref } from './practiceParts.js';

export function renderLevelSelect(root, [methodId]) {
  const method = getMethod(methodId);
  if (!method) {
    renderNotFound(root);
    return null;
  }
  const states = levelStates(method.id);
  const { unlockAll } = getClassroom();

  const items = states.map((s) => {
    const { level } = s;
    const stateLine = s.certified
      ? `<span class="status status--passed">${icons.award}<span>인증 완료 · 통과 ${s.cleared}개</span></span>`
      : s.unlocked
        ? `<span class="status status--progress">${icons.progress}<span>인증까지 통과 ${s.cleared} / ${s.required}</span></span>`
        : `<span class="status status--new">${icons.lock}<span>잠김 · 이전 단계를 인증하면 열립니다</span></span>`;
    const aiTag = level.usesAi ? '<span class="tag">AI 사용</span>' : '<span class="tag">AI 없이</span>';
    const body = `<span class="level-card__num" aria-hidden="true">${s.index + 1}</span>
      <span class="level-card__body">
        <span class="level-card__title">${escapeHtml(level.title)} ${aiTag}</span>
        <span class="level-card__desc">${escapeHtml(level.summary)}</span>
        <span class="level-card__rule">통과 기준: ${escapeHtml(level.passRule)}</span>
        ${stateLine}
      </span>`;
    return s.unlocked
      ? `<li><a class="level-card is-${s.state}" href="${practiceHref(method.id, level.id)}"><span class="visually-hidden">${s.index + 1}단계: </span>${body}</a></li>`
      : `<li><div class="level-card is-locked" aria-disabled="true"><span class="visually-hidden">${s.index + 1}단계(잠김): </span>${body}</div></li>`;
  }).join('');

  root.innerHTML = `<div class="page">
    ${breadcrumb([{ label: '홈', href: '#/' }, { label: '증명 연습하기', href: '#/practice' }, { label: method.label }])}
    <header class="page-intro">
      <p class="eyebrow">${escapeHtml(method.course)} · ${escapeHtml(method.label)}</p>
      <h1>어떤 활동으로 연습할까요?</h1>
      <p class="lead">위에서부터 쉬운 활동입니다. 한 단계에서 명제 ${states[0].required}개를 통과하면 그 단계가 인증되고 다음 단계가 열립니다.</p>
    </header>
    ${TEST_FREE_NAVIGATION ? notice('info', '테스트 버전: 모든 단계가 열려 있습니다', '인증과 관계없이 원하는 단계로 자유롭게 이동할 수 있습니다. 인증 기록은 그대로 쌓입니다.') : unlockAll ? notice('info', '시연용으로 모든 단계가 열려 있습니다', '교사 화면 미리보기에서 "모든 단계 열기"가 켜져 있습니다. 인증 기록은 그대로 쌓입니다.') : ''}
    <ol class="level-list" aria-label="활동 단계">${items}</ol>
  </div>`;
  return null;
}
