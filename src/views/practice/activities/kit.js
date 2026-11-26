// 활동 모듈이 함께 쓰는 도구

import { escapeHtml } from '../../../ui/dom.js';
import { icons } from '../../../ui/icons.js';

export function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** 0..n-1을 섞되, 원래 순서와 같으면 다시 섞는다. */
export function shuffledOrder(n) {
  const identity = [...Array(n).keys()];
  let order = shuffle(identity);
  while (n > 1 && order.every((value, index) => value === index)) order = shuffle(identity);
  return order;
}

/** 1..n-2(첫 단계와 마지막 단계 제외) 중 count개를 골라 오름차순으로 돌려준다. */
export function pickMiddleSteps(n, count) {
  const middle = [...Array(Math.max(n - 2, 0)).keys()].map((i) => i + 1);
  const pool = middle.length >= count ? middle : [...Array(n).keys()];
  return shuffle(pool).slice(0, count).sort((a, b) => a - b);
}

const VERDICT_TEXT = { pass: '통과', partial: '통과, 보완하면 더 좋아요', fail: '보완 필요', info: '안내' };
const VERDICT_ICON = { pass: icons.check, partial: icons.check, fail: icons.alert, info: icons.info };

/** 잘 쓴 부분 · 고칠 곳 · 고칠 점 · 고치는 방법 (AI 점검·코치·채점이 함께 쓰는 안내 목록) */
export function feedbackDetails({ good = [], where = null, fixes = [], how = '' } = {}) {
  const parts = [];
  if (good.length) {
    parts.push(`<div class="fb-part fb-part--good"><p class="fb-part__label">${icons.check}<span>잘 쓴 부분</span></p><ul>${good.map((g) => `<li>${escapeHtml(g)}</li>`).join('')}</ul></div>`);
  }
  if (where) {
    parts.push(`<div class="fb-part fb-part--where"><p class="fb-part__label">${icons.pencil}<span>고칠 곳</span></p><p>${escapeHtml(where)}</p></div>`);
  }
  if (fixes.length) {
    parts.push(`<div class="fb-part fb-part--fix"><p class="fb-part__label">${icons.alert}<span>고칠 점</span></p><ul>${fixes.map((f) => `<li>${escapeHtml(f)}</li>`).join('')}</ul></div>`);
  }
  if (how) {
    parts.push(`<div class="fb-part fb-part--how"><p class="fb-part__label">${icons.info}<span>이렇게 고쳐 보세요</span></p><p>${escapeHtml(how)}</p></div>`);
  }
  return parts.join('');
}

/** AI 점검 결과 상자 (상태를 아이콘과 글자로 함께 표시) */
export function aiFeedback(feedback, { title = 'AI 점검' } = {}) {
  if (!feedback) return '';
  return `<div class="ai-feedback is-${feedback.verdict}">
    <p class="ai-feedback__head">${VERDICT_ICON[feedback.verdict]}<span>${escapeHtml(title)}: ${VERDICT_TEXT[feedback.verdict]}</span></p>
    <p>${escapeHtml(feedback.message)}</p>
    ${feedbackDetails(feedback)}
  </div>`;
}

export function setBusy(button, busy, busyText) {
  if (!button) return;
  if (busy) {
    button.dataset.label = button.textContent;
    button.textContent = busyText;
  } else if (button.dataset.label) {
    button.textContent = button.dataset.label;
  }
  button.disabled = busy;
}

export const triesNote = (tries) => `<p class="actions__note">시도 ${tries}회</p>`;
