// 여러 화면에서 함께 쓰는 마크업 조각

import { escapeHtml, formatTime } from './dom.js';
import { icons } from './icons.js';
import { statementHtml } from './mathText.js';
import { getMethod } from '../data/methods.js';

/**
 * 앱식 뒤로 가기 줄. crumbs: [{ label, href? }] — 마지막 항목이 현재 화면.
 * 화면에는 바로 위 단계로 가는 버튼 하나만 보이고, 전체 경로는 화면 읽기 프로그램에 전달한다.
 */
export function breadcrumb(crumbs) {
  const parent = [...crumbs.slice(0, -1)].reverse().find((crumb) => crumb.href);
  const trail = crumbs.map((crumb) => crumb.label).join(', ');
  return `<nav class="backbar" aria-label="현재 위치">
    ${parent ? `<a class="backbar__link" href="${parent.href}">${icons.chevronLeft}<span>${escapeHtml(parent.label)}</span></a>` : ''}
    <span class="visually-hidden">현재 위치: ${escapeHtml(trail)}</span>
  </nav>`;
}

export function methodTag(methodId) {
  return `<span class="tag">${escapeHtml(getMethod(methodId).shortLabel)}</span>`;
}

export function difficultyTag(difficulty) {
  return `<span class="tag tag--difficulty">난이도 ${escapeHtml(difficulty)}</span>`;
}

/** 단계 표시. current가 steps.length와 같으면 모든 단계를 마친 상태다. */
export function stepIndicator(steps, current) {
  const total = steps.length;
  const items = steps
    .map((label, index) => {
      const state = index < current ? 'done' : index === current ? 'current' : 'todo';
      const srText = { done: '완료', current: '현재 단계', todo: '남은 단계' }[state];
      return `<li class="steps__item is-${state}"${state === 'current' ? ' aria-current="step"' : ''}>
        <span class="steps__marker" aria-hidden="true">${state === 'done' ? '✓' : index + 1}</span>
        <span class="steps__label">${escapeHtml(label)}<span class="visually-hidden"> (${srText})</span></span>
      </li>`;
    })
    .join('');
  const summary = current >= total ? '모든 단계 완료' : `${current + 1} / ${total}단계: ${steps[current]}`;
  return `<nav class="steps" aria-label="활동 단계">
    <p class="steps__summary" aria-hidden="true">${escapeHtml(summary)}</p>
    <ol class="steps__list">${items}</ol>
  </nav>`;
}

export function propositionBlock(problem) {
  const method = getMethod(problem.method);
  return `<div class="proposition-wrap"><section class="proposition" aria-label="명제">
    <p class="proposition__label">명제</p>
    <p class="proposition__statement">${statementHtml(problem.statement)}</p>
    <ul class="proposition__meta" aria-label="명제 정보">
      <li class="tag tag--strong">${escapeHtml(method.label)}</li>
      <li class="tag">${escapeHtml(method.course)}</li>
      <li class="tag tag--difficulty">난이도 ${escapeHtml(problem.difficulty)}</li>
    </ul>
  </section></div>`;
}

const NOTICE_ICONS = { info: icons.info, warn: icons.alert, success: icons.check, lock: icons.lock, eye: icons.eye, eyeOff: icons.eyeOff };

export function notice(kind, title, body, { iconName = kind } = {}) {
  return `<div class="notice notice--${kind}" role="note">
    <span class="notice__icon">${NOTICE_ICONS[iconName] ?? icons.info}</span>
    <div class="notice__body">
      <p class="notice__title">${escapeHtml(title)}</p>
      ${body ? `<p>${escapeHtml(body)}</p>` : ''}
    </div>
  </div>`;
}

export function stepHeading(number, title, description = '') {
  return `<h2 id="step-heading" class="step-title" tabindex="-1"><span class="step-title__num">${number}단계</span> ${escapeHtml(title)}</h2>
    ${description ? `<p class="step-desc">${escapeHtml(description)}</p>` : ''}`;
}

/** 증명 등 여러 줄 텍스트를 그대로 보여 준다(줄바꿈 유지). */
export function proofText(text, { emptyText = '작성한 내용이 없습니다.' } = {}) {
  return text?.trim()
    ? `<div class="proof-text">${escapeHtml(text)}</div>`
    : `<p class="empty-text">${escapeHtml(emptyText)}</p>`;
}

export function mockAiNote(text = '프로토타입: AI 점검은 실제 AI가 아니라 예시 규칙으로 동작합니다. 각 단계의 핵심(식의 꼴, 근거, 결론)이 드러나면 문자나 표현이 달라도 인정하지만, 예시와 아주 다른 방식으로 쓴 증명은 알아보지 못할 수 있습니다.') {
  return `<details class="proto-note">
    <summary>${icons.info}<span>프로토타입 AI 안내</span></summary>
    <p>${escapeHtml(text)}</p>
  </details>`;
}

export function chatMessages(messages, { pending = false } = {}) {
  if (!messages.length && !pending) {
    return '<li class="chat__empty">아직 대화가 없습니다.</li>';
  }
  const items = messages.map((message) => {
    const who = message.role === 'ai' ? 'AI 도우미' : '나';
    return `<li class="chat__msg chat__msg--${message.role}">
      <p class="chat__who">${who} <time datetime="${escapeHtml(message.at)}">${formatTime(message.at)}</time></p>
      <div class="chat__body">${escapeHtml(message.text)}</div>
    </li>`;
  });
  if (pending) {
    items.push(`<li class="chat__msg chat__msg--ai is-pending">
      <p class="chat__who">AI 도우미</p>
      <div class="chat__body">응답을 작성하고 있습니다…</div>
    </li>`);
  }
  return items.join('');
}

/** 대화창: 메시지 목록과 입력 폼 */
export function chatPanel({ messages, pending, label, help }) {
  return `<div class="chat">
    ${mockAiNote('프로토타입: AI 응답은 미리 준비한 예시 문장이며 실제 AI가 아닙니다.')}
    <ol class="chat__log" data-chat-log aria-label="AI 대화 기록" aria-live="polite">${chatMessages(messages, { pending })}</ol>
    <form class="chat__form" data-chat-form novalidate>
      <label class="field__label" for="chat-input">${escapeHtml(label)}</label>
      <p class="field__help" id="chat-input-help">${escapeHtml(help)} Ctrl + Enter로 보낼 수 있습니다.</p>
      <textarea id="chat-input" class="field__input" rows="3" aria-describedby="chat-input-help"></textarea>
      <div class="chat__form-actions">
        <button type="submit" class="button button--secondary" data-chat-send${pending ? ' disabled' : ''}>보내기</button>
      </div>
    </form>
  </div>`;
}

/** AI 요청 입력 미리보기(개발·연구 확인용) */
export function requestPreview(request) {
  const body = request
    ? `<pre class="code-block"><code>${escapeHtml(JSON.stringify(request, null, 2))}</code></pre>`
    : '<p class="empty-text">아직 보낸 요청이 없습니다.</p>';
  return `<details class="disclosure">
    <summary>마지막 AI 요청 입력 보기</summary>
    <p class="disclosure__note">실제 서비스에서는 서버가 이 형식으로 입력을 구성합니다. 지금은 더미 응답을 사용합니다.</p>
    ${body}
  </details>`;
}

export function renderNotFound(root) {
  root.innerHTML = `<div class="page">
    <h1>화면을 찾을 수 없습니다</h1>
    <p>주소가 바뀌었거나 없는 화면입니다.</p>
    <p><a class="button button--secondary" href="#/">처음 화면으로</a></p>
  </div>`;
}
