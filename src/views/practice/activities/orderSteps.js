// 활동 3: 증명 순서 맞추기 (AI 없이 자동 채점)
// 끌어서 놓기 대신 위·아래 버튼으로 옮긴다. 키보드와 작은 화면에서도 같은 방식으로 쓸 수 있다.

import { REVEAL_AFTER_TRIES } from '../../../data/levels.js';
import { stepText } from '../../../data/proofModel.js';
import { escapeHtml } from '../../../ui/dom.js';
import { icons } from '../../../ui/icons.js';
import { shuffledOrder, triesNote } from './kit.js';

export default {
  createData: (problem) => ({ order: shuffledOrder(problem.steps.length), lastCheck: null, tries: 0, revealed: false }),

  mount(el, ctx) {
    const { problem } = ctx;
    const data = ctx.attempt.data;
    const done = ctx.attempt.status !== 'in-progress';
    const total = problem.steps.length;
    let message = '';

    function render() {
      const items = data.order.map((stepIndex, position) => {
        const mark = data.lastCheck
          ? data.lastCheck[position]
            ? `<span class="order-item__mark is-correct">${icons.check}<span>제자리</span></span>`
            : `<span class="order-item__mark is-wrong">${icons.x}<span>자리 다름</span></span>`
          : '';
        const controls = done ? '' : `<span class="order-item__controls">
            <button type="button" class="icon-button" data-move="up" data-pos="${position}"${position === 0 ? ' disabled' : ''} aria-label="${position + 1}번째 단계를 위로 옮기기">${icons.arrowUp}</button>
            <button type="button" class="icon-button" data-move="down" data-pos="${position}"${position === total - 1 ? ' disabled' : ''} aria-label="${position + 1}번째 단계를 아래로 옮기기">${icons.arrowDown}</button>
          </span>`;
        return `<li class="order-item">
          <span class="order-item__num" aria-hidden="true">${position + 1}</span>
          <span class="order-item__text">${escapeHtml(stepText(problem.steps[stepIndex]))}</span>
          ${mark}
          ${controls}
        </li>`;
      }).join('');

      el.innerHTML = `${done ? '' : '<p class="step-desc">뒤섞인 증명의 단계를 위·아래 버튼으로 옮겨 올바른 순서로 맞춘 뒤 "순서 확인"을 누르세요.</p>'}
        <ol class="order-list" aria-label="증명 단계">${items}</ol>
        <p class="feedback" aria-live="polite">${escapeHtml(message)}</p>
        ${done ? '' : `<div class="actions">
          ${triesNote(data.tries)}
          ${data.tries >= REVEAL_AFTER_TRIES ? '<button type="button" class="button button--ghost" data-action="reveal">정답 보기</button>' : ''}
          <button type="button" class="button button--primary" data-action="check">순서 확인</button>
        </div>`}`;
    }

    function move(position, direction) {
      const target = direction === 'up' ? position - 1 : position + 1;
      if (target < 0 || target >= total) return;
      [data.order[position], data.order[target]] = [data.order[target], data.order[position]];
      data.lastCheck = null;
      message = `${position + 1}번째 단계를 ${target + 1}번째 자리로 옮겼습니다.`;
      ctx.save();
      render();
      const focusTarget = el.querySelector(`[data-move="${direction}"][data-pos="${target}"]`);
      (focusTarget && !focusTarget.disabled ? focusTarget : el.querySelector(`[data-pos="${target}"]:not(:disabled)`))?.focus();
    }

    function check() {
      data.tries += 1;
      data.lastCheck = data.order.map((stepIndex, position) => stepIndex === position);
      const correct = data.lastCheck.filter(Boolean).length;
      if (correct === total) {
        ctx.save();
        ctx.finish({ passed: !data.revealed });
        return;
      }
      message = `${total}개 단계 중 ${correct}개가 제자리에 있습니다. "자리 다름" 표시가 있는 단계를 옮겨 보세요.`;
      ctx.save();
      render();
    }

    function reveal() {
      if (!window.confirm('정답을 보면 이 명제는 이번에 통과로 인정되지 않습니다. 정답을 볼까요?')) return;
      data.revealed = true;
      data.order = [...Array(total).keys()];
      data.lastCheck = null;
      ctx.save();
      ctx.finish({ passed: false });
    }

    const onClick = (event) => {
      const moveButton = event.target.closest('[data-move]');
      if (moveButton && !moveButton.disabled) {
        move(Number(moveButton.dataset.pos), moveButton.dataset.move);
        return;
      }
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (action === 'check') check();
      if (action === 'reveal') reveal();
    };

    render();
    el.addEventListener('click', onClick);
    return null;
  },
};
