// AI와 탐구하기 화면들이 함께 쓰는 입력 부품과 읽기 전용 표시
// 입력 부품은 data-field 경로로 단계 기록의 명제 항목(item)과 연결된다(ui/forms.js bindFields).

import { CHECKLIST_NONE, CONFIDENCE_LABELS, PROOF_METHOD_OPTIONS, REVISION_CHECKLIST, methodOptionLabel } from '../../data/research.js';
import { createInk, inkStats } from '../../state/inkModel.js';
import { inkOf, inputModeFor, noteModeChange } from '../../state/researchStore.js';
import { escapeHtml } from '../../ui/dom.js';
import { icons } from '../../ui/icons.js';
import { symbolBar, textArea } from '../../ui/forms.js';
import { inkViewHtml } from '../../ui/inkCanvas.js';
import { inkPadHtml, mountInkPad } from '../../ui/inkPad.js';
import { mathText } from '../../ui/mathText.js';

const errorSlot = (field) => `<p class="field__error" id="f-${field}-error" data-error-for="${field}" hidden></p>`;

/** 증명법 선택 칩 (+ 기타일 때 직접 쓰기) */
export function methodField({ field, otherField, legend, help = '', value = '', otherValue = '' }) {
  const chips = PROOF_METHOD_OPTIONS.map((option) => `<label class="pick">
      <input type="radio" name="${field}" value="${option.id}" data-field="${field}"${value === option.id ? ' checked' : ''}>
      <span>${escapeHtml(option.label)}</span>
    </label>`).join('');
  return `<fieldset class="field pick-group" id="f-${field}" aria-describedby="f-${field}-error">
    <legend class="field__label">${escapeHtml(legend)} <span class="field__req">(필수)</span></legend>
    ${help ? `<p class="field__help">${escapeHtml(help)}</p>` : ''}
    <div class="pick-group__options">${chips}</div>
    ${errorSlot(field)}
    <div class="pick-group__other"${value === 'other' ? '' : ' hidden'} data-other-for="${field}">
      <label class="visually-hidden" for="f-${otherField}">기타 증명 방법</label>
      <input type="text" class="field__input" id="f-${otherField}" data-field="${otherField}" value="${escapeHtml(otherValue)}" placeholder="사용한 증명 방법을 쓰세요" aria-describedby="f-${otherField}-error">
      ${errorSlot(otherField)}
    </div>
  </fieldset>`;
}

/** 하나를 고르는 문항 (칩 모양 라디오) */
export function choiceField({ field, legend, help = '', options, value = '' }) {
  const chips = options.map((option) => `<label class="pick">
      <input type="radio" name="${field}" value="${option.id}" data-field="${field}"${value === option.id ? ' checked' : ''}>
      <span>${escapeHtml(option.label)}</span>
    </label>`).join('');
  return `<fieldset class="field pick-group" id="f-${field}" aria-describedby="f-${field}-error">
    <legend class="field__label">${escapeHtml(legend)} <span class="field__req">(필수)</span></legend>
    ${help ? `<p class="field__help">${escapeHtml(help)}</p>` : ''}
    <div class="pick-group__options">${chips}</div>
    ${errorSlot(field)}
  </fieldset>`;
}

/** 확신 정도: 별 1~5 */
export function starField({ field, legend, value = null }) {
  const stars = CONFIDENCE_LABELS.map((label, i) => {
    const n = i + 1;
    return `<label class="star${value != null && n <= value ? ' is-on' : ''}">
      <input type="radio" name="${field}" value="${n}" data-field="${field}" data-type="number"${value === n ? ' checked' : ''}>
      <span aria-hidden="true">${icons.star}</span>
      <span class="visually-hidden">${n}점: ${escapeHtml(label)}</span>
    </label>`;
  }).join('');
  return `<fieldset class="field star-group" id="f-${field}" aria-describedby="f-${field}-error">
    <legend class="field__label">${escapeHtml(legend)} <span class="field__req">(필수)</span></legend>
    <div class="star-group__row">${stars}<span class="star-group__text" data-star-text>${value ? `${value}점 ${escapeHtml(CONFIDENCE_LABELS[value - 1])}` : '낮음 1개 ↔ 높음 5개'}</span></div>
    ${errorSlot(field)}
  </fieldset>`;
}

/** 별 표시가 바뀌면 칠한 별과 설명을 갱신한다. */
export function syncStars(root) {
  root.querySelectorAll('.star-group').forEach((group) => {
    const checked = Number(group.querySelector('input:checked')?.value ?? 0);
    group.querySelectorAll('.star').forEach((star, i) => star.classList.toggle('is-on', i < checked));
    const text = group.querySelector('[data-star-text]');
    if (text && checked) text.textContent = `${checked}점 ${CONFIDENCE_LABELS[checked - 1]}`;
  });
}

/** 보완할 점 체크리스트 (kind: 'myChecklist' | 'aiChecklist') */
export function checklistField({ field, legend, values = [] }) {
  const items = [...REVISION_CHECKLIST, CHECKLIST_NONE].map((item) => `<label class="checkline">
      <input type="checkbox" data-check="${field}" value="${item.id}"${values.includes(item.id) ? ' checked' : ''}>
      <span><strong>${escapeHtml(item.label)}</strong>${item.desc ? `<span class="checkline__desc">${escapeHtml(item.desc)}</span>` : ''}</span>
    </label>`).join('');
  return `<fieldset class="field checklist" id="f-${field}" aria-describedby="f-${field}-error">
    <legend class="field__label">${escapeHtml(legend)} <span class="field__req">(필수)</span></legend>
    <p class="field__help">해당하는 것을 모두 고르세요.</p>
    <div class="checklist__items">${items}</div>
    ${errorSlot(field)}
  </fieldset>`;
}

/** 반영 비율: 10칸(한 칸 10%). 왼쪽부터 칠한 칸이 나의 답변, 나머지가 AI의 답변 */
export function ratioField({ field, value = null }) {
  const cells = Array.from({ length: 10 }, (_, i) => `<button type="button" class="ratio__cell${value != null && i < value ? ' is-mine' : ''}" data-ratio="${i + 1}" aria-label="나의 답변 ${(i + 1) * 10}%로 표시" tabindex="-1"></button>`).join('');
  const summary = value == null ? '아직 표시하지 않았어요' : `나의 답변 ${value * 10}%, AI의 답변 ${100 - value * 10}%`;
  return `<fieldset class="field ratio" id="f-${field}" aria-describedby="f-${field}-error f-${field}-help">
    <legend class="field__label">반영 비율 <span class="field__req">(필수)</span></legend>
    <p class="field__help" id="f-${field}-help">최종 증명에 나의 답변이 반영된 만큼 왼쪽부터 칸을 칠하세요. 한 칸은 10%이고, 칠하지 않은 칸은 AI 답변이 반영된 비율입니다.</p>
    <div class="ratio__ends" aria-hidden="true"><span>나의 답변</span><span>AI의 답변</span></div>
    <div class="ratio__cells" aria-hidden="true">${cells}</div>
    <label class="visually-hidden" for="f-${field}-range">나의 답변 반영 비율(10% 단위)</label>
    <input type="range" class="ratio__range" id="f-${field}-range" min="0" max="10" step="1" value="${value ?? 5}" data-field="${field}" data-type="number" aria-valuetext="나의 답변 ${(value ?? 5) * 10}%">
    <p class="ratio__summary" data-ratio-text>${escapeHtml(summary)}</p>
    ${errorSlot(field)}
  </fieldset>`;
}

export function syncRatio(root, value) {
  root.querySelectorAll('.ratio__cell').forEach((cell, i) => cell.classList.toggle('is-mine', i < value));
  const text = root.querySelector('[data-ratio-text]');
  if (text) text.textContent = `나의 답변 ${value * 10}%, AI의 답변 ${100 - value * 10}%`;
  const range = root.querySelector('.ratio__range');
  if (range) range.setAttribute('aria-valuetext', `나의 답변 ${value * 10}%`);
}

const alsoText = (mode, item, field) => {
  if (mode === 'keyboard') {
    const strokes = inkStats(inkOf(item, field)).strokes;
    return strokes ? `펜으로 쓴 필기(획 ${strokes}개)도 함께 제출돼요.` : '';
  }
  const chars = String(item[field] ?? '').trim().length;
  return chars ? `키보드로 쓴 글(${chars}자)도 함께 제출돼요.` : '';
};

/**
 * 증명 입력 칸: 키보드(수학 기호 버튼 포함)와 펜 필기를 바꿔 쓸 수 있다. 두 내용은 모두 보존·제출된다.
 * penNote: 펜으로 쓸 때만 보이는 안내
 */
export function proofField({ field, label, help, item, rows = 9, penNote = '' }) {
  const id = `f-${field}`;
  const mode = inputModeFor(item, field);
  const pen = mode === 'pen';
  const switchBtn = (to, icon, text) => `<button type="button" class="mode-switch__item${mode === to ? ' is-on' : ''}" aria-pressed="${mode === to}" data-mode-to="${to}" data-mode-field="${field}">${icon}<span>${text}</span></button>`;
  const also = (m) => {
    const text = alsoText(m, item, field);
    return `<p class="proof-input__also" data-also="${m}"${text ? '' : ' hidden'}>${icons.info}<span>${escapeHtml(text)}</span></p>`;
  };
  return `<div class="field proof-input" id="${id}-wrap" data-proof-input="${field}">
    <div class="proof-input__head">
      <label class="field__label" id="${id}-label" for="${id}">${escapeHtml(label)} <span class="field__req">(필수)</span></label>
      <div class="mode-switch" role="group" aria-label="입력 방식">
        ${switchBtn('keyboard', icons.keyboard, '키보드')}${switchBtn('pen', icons.pencil, '펜')}
      </div>
    </div>
    <p class="field__help" id="${id}-help">${escapeHtml(help)}</p>
    <div class="proof-input__pane" data-pane="keyboard"${pen ? ' hidden' : ''}>
      ${symbolBar(id)}
      <textarea id="${id}" class="field__input" data-field="${field}" rows="${rows}" aria-describedby="${id}-help ${id}-error" aria-required="true">${escapeHtml(item[field] ?? '')}</textarea>
      ${also('keyboard')}
    </div>
    <div class="proof-input__pane" data-pane="pen"${pen ? '' : ' hidden'}>
      ${penNote ? `<p class="note-chip">${icons.info}<span>${escapeHtml(penNote)}</span></p>` : ''}
      ${inkPadHtml({ id: `${id}-ink`, labelledBy: `${id}-label` })}
      ${also('pen')}
    </div>
    <p class="field__error" id="${id}-error" data-error-for="${field}" hidden></p>
  </div>`;
}

/** 키보드/펜 바꾸기 버튼 처리. 처리했으면 true */
export function handleModeSwitch(event, root, item, pads) {
  const btn = event.target.closest('[data-mode-to]');
  if (!btn || !root.contains(btn)) return false;
  const field = btn.dataset.modeField;
  const to = btn.dataset.modeTo;
  const wrap = root.querySelector(`[data-proof-input="${field}"]`);
  noteModeChange(item, field, to);
  wrap.querySelectorAll('[data-mode-to]').forEach((b) => {
    const on = b.dataset.modeTo === to;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-pressed', String(on));
  });
  wrap.querySelectorAll('[data-pane]').forEach((pane) => { pane.hidden = pane.dataset.pane !== to; });
  ['keyboard', 'pen'].forEach((m) => {
    const note = wrap.querySelector(`[data-also="${m}"]`);
    const text = alsoText(m, item, field);
    note.hidden = !text;
    note.querySelector('span').textContent = text;
  });
  if (to === 'pen') pads.find((p) => p.field === field)?.pad.refresh();
  else wrap.querySelector('textarea')?.focus();
  return true;
}

/** 화면의 필기 칸들을 단계 기록의 명제 항목(item)에 연결한다. */
export function mountProofPads(root, item, { onInput, onChange }) {
  return [...root.querySelectorAll('[data-proof-input]')].map((wrap) => {
    const field = wrap.dataset.proofInput;
    const el = wrap.querySelector('[data-ink-pad]');
    const error = wrap.querySelector(`[data-error-for="${field}"]`);
    const pad = mountInkPad(el, {
      getInk: () => inkOf(item, field),
      ensureInk: () => {
        item.ink ??= {};
        item.ink[field] ??= createInk();
        return item.ink[field];
      },
      onInput: (type) => {
        onInput(type);
        if (error) error.hidden = true;
      },
      onChange,
    });
    return { field, pad };
  });
}

export function noteField({ field, label, help = '', value = '', rows = 3, required = true }) {
  return textArea({ id: `f-${field}`, field, label, help, value, rows, required })
    .replace(`id="f-${field}-error"`, `id="f-${field}-error" data-error-for="${field}"`);
}

/** 제출 전 빠진 항목 표시 */
export function showErrors(root, missing) {
  root.querySelectorAll('[data-error-for]').forEach((el) => {
    el.hidden = true;
    el.textContent = '';
  });
  missing.forEach(({ field, message }) => {
    const slot = root.querySelector(`[data-error-for="${field}"]`);
    if (slot) {
      slot.hidden = false;
      slot.textContent = message;
    }
  });
  let first = missing[0] && root.querySelector(`#f-${missing[0].field}`);
  // 펜으로 쓰는 증명 칸은 글 칸이 숨어 있으므로 칸 전체를 보여 준다
  if (first?.closest('[hidden]')) first = root.querySelector(`#f-${missing[0].field}-wrap`);
  const focusable = first?.matches('fieldset') ? first.querySelector('input') : first?.matches('[data-proof-input]') ? first.querySelector('[data-mode-to].is-on') : first;
  focusable?.focus();
  first?.scrollIntoView({ block: 'center' });
}

// ── 읽기 전용 표시 ─────────────────────────

const plain = (text, empty = '쓰지 않았습니다.') => (String(text ?? '').trim()
  ? `<div class="proof-text">${escapeHtml(text)}</div>`
  : `<p class="empty-text">${escapeHtml(empty)}</p>`);

export const methodText = (id, other) => (id === 'other' ? `기타: ${other || '쓰지 않음'}` : methodOptionLabel(id) || '고르지 않음');

export function starsText(value) {
  if (value == null) return '<span class="meta">표시하지 않음</span>';
  return `<span class="stars-read" role="img" aria-label="확신 정도 ${value}점">${'★'.repeat(value)}<span class="stars-read__off">${'★'.repeat(5 - value)}</span></span> <span class="meta">${value}점</span>`;
}

export function checklistText(values = []) {
  if (!values.length) return '<p class="empty-text">고르지 않았습니다.</p>';
  const all = [...REVISION_CHECKLIST, CHECKLIST_NONE];
  return `<ul class="tag-list">${values.map((id) => `<li class="tag">${escapeHtml(all.find((c) => c.id === id)?.label ?? id)}</li>`).join('')}</ul>`;
}

/** 읽기 전용 정의 목록: [[제목, HTML], ...] */
export function readList(rows) {
  return `<dl class="read-list">${rows.map(([dt, dd]) => `<div><dt>${escapeHtml(dt)}</dt><dd>${dd}</dd></div>`).join('')}</dl>`;
}

export const readProof = plain;

/** 증명 읽기: 키보드로 쓴 글과 펜 필기를 함께 보여 준다. key = '단계|명제 id|필드' (필기 칸을 다시 찾는 데 쓴다) */
export function readProofInk(text, ink, key) {
  const hasText = String(text ?? '').trim().length > 0;
  const hasPen = inkStats(ink).strokes > 0;
  if (!hasText && !hasPen) return plain('');
  return `${hasText ? plain(text) : ''}${hasPen ? inkViewHtml(key, ink) : ''}`;
}
export const statementLine = (problem) => `<p class="read-statement">${mathText(problem.statement)}</p>`;
