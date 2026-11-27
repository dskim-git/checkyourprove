// 팝업 창(모달): 화면을 옮기지 않고 기록을 읽기 전용으로 보여 준다. <dialog>를 쓰고 Esc·닫기 버튼·바깥 누르기로 닫는다.

import { escapeHtml } from './dom.js';
import { icons } from './icons.js';

/**
 * @param {{ title: string, html: string, footer?: string, onMount?: (body: HTMLElement) => (() => void) | void }} options
 * @returns {() => void} 닫기
 */
export function openModal({ title, html, footer = '', onMount }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'modal';
  dialog.setAttribute('aria-labelledby', 'modal-title');
  dialog.innerHTML = `<div class="modal__head">
      <h2 class="modal__title" id="modal-title">${escapeHtml(title)}</h2>
      <button type="button" class="icon-button" data-modal-close aria-label="닫기">${icons.x}</button>
    </div>
    <div class="modal__body">${html}</div>
    ${footer ? `<div class="modal__foot">${footer}</div>` : ''}`;
  document.body.append(dialog);
  const opener = document.activeElement;
  let cleanup = null;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    cleanup?.();
    if (dialog.open && dialog.close) dialog.close();
    dialog.remove();
    opener?.focus?.();
  };
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog || event.target.closest('[data-modal-close]') || event.target.closest('a[href]')) close();
  });
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });
  if (dialog.showModal) dialog.showModal();
  else dialog.setAttribute('open', '');
  cleanup = onMount?.(dialog.querySelector('.modal__body')) ?? null;
  dialog.querySelector('[data-modal-close]').focus();
  return close;
}
