// 폼 입력 도구: 라벨이 연결된 입력 필드, 자동 임시 보존, 필수 입력 확인, 수학 기호 입력

import { escapeHtml, formatTime, setPath } from './dom.js';

const SYMBOLS = [
  ['²', '제곱'],
  ['³', '세제곱'],
  ['√', '루트'],
  ['≤', '작거나 같다'],
  ['≥', '크거나 같다'],
  ['≠', '같지 않다'],
  ['×', '곱하기'],
  ['⋯', '줄임표'],
  ['∴', '따라서'],
];

export function symbolBar(targetId) {
  const buttons = SYMBOLS.map(
    ([symbol, name]) =>
      `<button type="button" class="symbol-bar__btn" data-insert="${symbol}" data-target="${targetId}" aria-label="${name} 기호 넣기">${symbol}</button>`,
  ).join('');
  return `<div class="symbol-bar" role="group" aria-label="수학 기호 넣기">${buttons}</div>`;
}

/**
 * 라벨·도움말·오류 메시지가 연결된 여러 줄 입력 필드.
 * data-field 경로(예: 'draft.text')로 세션 객체의 값과 연결된다.
 */
export function textArea({ id, field, label, help = '', value = '', rows = 6, required = false, symbols = false }) {
  const describedBy = [help ? `${id}-help` : '', `${id}-error`].filter(Boolean).join(' ');
  return `<div class="field">
    <label class="field__label" for="${id}">${escapeHtml(label)}${required ? ' <span class="field__req">(필수)</span>' : ''}</label>
    ${help ? `<p class="field__help" id="${id}-help">${escapeHtml(help)}</p>` : ''}
    ${symbols ? symbolBar(id) : ''}
    <textarea id="${id}" class="field__input" data-field="${field}" rows="${rows}" aria-describedby="${describedBy}"${required ? ' aria-required="true"' : ''}>${escapeHtml(value)}</textarea>
    <p class="field__error" id="${id}-error" hidden></p>
  </div>`;
}

/** 1~5 단계 선택 (라디오 그룹) */
export function scaleField({ id, field, legend, help = '', value = null, options }) {
  const describedBy = [help ? `${id}-help` : '', `${id}-error`].filter(Boolean).join(' ');
  const choices = options
    .map((label, index) => {
      const level = index + 1;
      return `<label class="scale__option">
        <input type="radio" name="${id}" value="${level}" data-field="${field}" data-type="number"${value === level ? ' checked' : ''}>
        <span class="scale__num">${level}</span>
        <span class="scale__text">${escapeHtml(label)}</span>
      </label>`;
    })
    .join('');
  return `<fieldset class="scale" id="${id}" aria-describedby="${describedBy}">
    <legend class="field__label">${escapeHtml(legend)} <span class="field__req">(필수)</span></legend>
    ${help ? `<p class="field__help" id="${id}-help">${escapeHtml(help)}</p>` : ''}
    <div class="scale__options">${choices}</div>
    <p class="field__error" id="${id}-error" hidden></p>
  </fieldset>`;
}

export function saveStatusText(session) {
  return session.updatedAt ? `${formatTime(session.updatedAt)}에 이 브라우저에 임시 저장됨` : '';
}

/**
 * root 안의 [data-field] 입력을 기록 객체와 연결하고, 입력할 때마다 잠시 뒤 자동 저장한다.
 * save는 기록을 저장하는 함수다(필수).
 * 반환한 flush()는 대기 중인 저장을 즉시 실행하고, dispose()는 연결을 해제한다.
 */
export function bindFields(root, session, save) {
  let timer = null;

  const persist = () => {
    timer = null;
    const ok = save(session);
    const status = root.querySelector('[data-save-status]');
    if (status) {
      status.textContent = ok ? saveStatusText(session) : '이 브라우저에 저장하지 못했습니다. 내용을 따로 복사해 두세요.';
    }
  };

  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      persist();
    }
  };

  const onInput = (event) => {
    const el = event.target.closest?.('[data-field]');
    if (!el || !root.contains(el)) return;
    if (el.type === 'radio' && !el.checked) return;

    const value = el.dataset.type === 'number' ? Number(el.value) : el.value;
    setPath(session, el.dataset.field, value);
    clearError(root, el);

    const status = root.querySelector('[data-save-status]');
    if (status) status.textContent = '저장 중…';
    clearTimeout(timer);
    timer = setTimeout(persist, 400);
  };

  root.addEventListener('input', onInput);
  root.addEventListener('change', onInput);
  window.addEventListener('pagehide', flush);

  return {
    flush,
    dispose() {
      flush();
      root.removeEventListener('input', onInput);
      root.removeEventListener('change', onInput);
      window.removeEventListener('pagehide', flush);
    },
  };
}

function clearError(root, el) {
  const owner = el.type === 'radio' ? el.closest('fieldset') : el;
  if (!owner) return;
  owner.removeAttribute('aria-invalid');
  const error = root.querySelector(`#${owner.id}-error`);
  if (error) {
    error.hidden = true;
    error.textContent = '';
  }
}

/**
 * 필수 입력 확인. 비어 있는 항목에 오류 메시지를 표시하고 첫 항목으로 초점을 옮긴다.
 * checks: [{ field, message, min? }] 또는 라디오 그룹은 [{ field, group: fieldset id, message }]
 */
export function validateRequired(root, checks) {
  let firstInvalid = null;

  for (const check of checks) {
    const owner = check.group
      ? root.querySelector(`#${check.group}`)
      : root.querySelector(`[data-field="${check.field}"]`);
    if (!owner) continue;

    const ok = check.group
      ? Boolean(owner.querySelector('input:checked'))
      : owner.value.trim().length >= (check.min ?? 1);

    const error = root.querySelector(`#${owner.id}-error`);
    if (error) {
      error.hidden = ok;
      error.textContent = ok ? '' : check.message;
    }
    if (ok) {
      owner.removeAttribute('aria-invalid');
    } else {
      owner.setAttribute('aria-invalid', 'true');
      firstInvalid ??= check.group ? owner.querySelector('input') : owner;
    }
  }

  firstInvalid?.focus();
  return !firstInvalid;
}

/** 수학 기호 버튼 처리. 처리했으면 true를 돌려준다. */
export function handleSymbolInsert(event, root) {
  const button = event.target.closest('[data-insert]');
  if (!button || !root.contains(button)) return false;
  const textarea = root.querySelector(`#${button.dataset.target}`);
  if (!textarea) return true;

  const { selectionStart, selectionEnd, value } = textarea;
  const symbol = button.dataset.insert;
  textarea.value = value.slice(0, selectionStart) + symbol + value.slice(selectionEnd);
  textarea.focus();
  textarea.selectionStart = textarea.selectionEnd = selectionStart + symbol.length;
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}

/** 대화 입력창에서 Ctrl(또는 Cmd) + Enter로 보내기 */
export function handleChatShortcut(event) {
  if (event.target.id === 'chat-input' && event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    event.target.form?.requestSubmit();
  }
}

// ── 글 입력 칸은 키보드로만 (펜 손글씨 막기) ─────────────
// iPad의 Scribble(애플펜슬 손글씨 → 글자)이나 Android의 스타일러스 손글씨 입력은 펜으로 글 칸에 바로 쓰게 한다.
// 연구 모드에서는 글 칸을 키보드로만 쓰게 하려고, 펜 터치의 기본 동작을 막고 펜으로 톡 누르면 칸에 초점만 준다(키보드가 뜸).
// 펜 필기는 증명 칸의 "펜" 모드(ui/inkPad.js)에서만 쓴다. 화면의 막기는 기록용 안내이며 보안 경계가 아니다.

const TEXT_SELECTOR = 'textarea, input[type="text"]';
const TAP_PX = 10;

const stylusTouches = (event) => [...(event.changedTouches ?? [])].filter((t) => t.touchType === 'stylus');

/**
 * root 안의 글 입력 칸에서 펜 손글씨를 막는다.
 * onBlocked(el): 펜으로 쓰려다 막힌 순간(한 번 긋기마다 한 번) — 안내 표시·기록용
 * @returns {() => void} 해제 함수
 */
export function keyboardOnlyText(root, { onBlocked, exclude = '[data-ink-pad]' } = {}) {
  let start = null; // { el, x, y, moved }

  const target = (event) => {
    const el = event.target.closest?.(TEXT_SELECTOR);
    return el && root.contains(el) && !el.closest(exclude) ? el : null;
  };

  const onTouchStart = (event) => {
    const el = target(event);
    const touch = stylusTouches(event)[0];
    if (!el || !touch) return;
    if (event.cancelable) event.preventDefault();
    start = { el, x: touch.clientX, y: touch.clientY, moved: false };
  };
  const onTouchMove = (event) => {
    const touch = stylusTouches(event)[0];
    if (!start || !touch) return;
    if (event.cancelable) event.preventDefault();
    if (!start.moved && Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > TAP_PX) {
      start.moved = true;
      onBlocked?.(start.el);
    }
  };
  const onTouchEnd = (event) => {
    if (!start || !stylusTouches(event).length) return;
    if (event.cancelable) event.preventDefault();
    // 펜으로 톡 누르면 칸에 초점을 주어 키보드로 쓰게 한다.
    if (!start.moved) start.el.focus();
    start = null;
  };

  root.addEventListener('touchstart', onTouchStart, { passive: false, capture: true });
  root.addEventListener('touchmove', onTouchMove, { passive: false, capture: true });
  root.addEventListener('touchend', onTouchEnd, { passive: false, capture: true });
  return () => {
    root.removeEventListener('touchstart', onTouchStart, { capture: true });
    root.removeEventListener('touchmove', onTouchMove, { capture: true });
    root.removeEventListener('touchend', onTouchEnd, { capture: true });
  };
}
