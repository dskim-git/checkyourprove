// 인라인 SVG 아이콘. 장식용이므로 aria-hidden 처리하고, 의미는 옆의 텍스트로 전달한다.

const svg = (paths) =>
  `<svg class="icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`;

export const icons = {
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>'),
  alert: svg('<path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 10v4"/><path d="M12 17h.01"/>'),
  check: svg('<path d="m5 12 4.5 4.5L19 7"/>'),
  lock: svg('<rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  eye: svg('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.8"/>'),
  eyeOff: svg('<path d="M3 3l18 18"/><path d="M10.6 6A9.7 9.7 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-3 3.7"/><path d="M6.6 7.4A15.6 15.6 0 0 0 2.5 12S6 18.5 12 18.5a9 9 0 0 0 4.2-1"/><path d="M9.9 10.2a2.8 2.8 0 0 0 3.9 3.9"/>'),
  x: svg('<path d="M6 6l12 12"/><path d="M18 6 6 18"/>'),
  circle: svg('<circle cx="12" cy="12" r="8"/>'),
  progress: svg('<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor"/>'),
  done: svg('<circle cx="12" cy="12" r="8"/><path d="m8.5 12 2.5 2.5 4.5-5"/>'),
  pencil: svg('<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>'),
  chat: svg('<path d="M4 5h16v11H9l-5 4V5Z"/><path d="M8 9.5h8"/><path d="M8 12.5h5"/>'),
  records: svg('<rect x="5" y="3.5" width="14" height="17" rx="1.5"/><path d="M9 8h6"/><path d="M9 12h6"/><path d="M9 16h3"/>'),
  arrowUp: svg('<path d="M12 19V5"/><path d="m6 11 6-6 6 6"/>'),
  arrowDown: svg('<path d="M12 5v14"/><path d="m6 13 6 6 6-6"/>'),
  chevronLeft: svg('<path d="m15 5-7 7 7 7"/>'),
  chevronRight: svg('<path d="m9 5 7 7-7 7"/>'),
  flame: svg('<path d="M12 21c-3.9 0-6.5-2.6-6.5-6.1 0-3.4 2.4-5.2 3.6-8.4.4 2 1.6 3.2 2.8 3.6.1-2.7 1.3-5 3.4-7.1.3 3.3 4.2 6 4.2 11.2 0 3.9-3 6.8-7.5 6.8Z"/>'),
  star: svg('<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5Z"/>'),
  play: svg('<path d="M8 5.5v13l10.5-6.5L8 5.5Z"/>'),
  stop: svg('<rect x="6.5" y="6.5" width="11" height="11" rx="1.5"/>'),
  keyboard: svg('<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6.5 10h.01M10 10h.01M14 10h.01M17.5 10h.01M8 14h8"/>'),
  eraser: svg('<path d="m14.5 4.5 5 5-9 9H6l-2.5-2.5a1.4 1.4 0 0 1 0-2l11-9.5Z"/><path d="M9 9.5 14.5 15"/><path d="M11 18.5h9"/>'),
  undo: svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  grow: svg('<rect x="4" y="3.5" width="16" height="10" rx="1.5"/><path d="M12 16.5v5"/><path d="m9 19 3 2.5 3-2.5"/>'),
  download: svg('<path d="M12 4v11"/><path d="m7 10.5 5 5 5-5"/><path d="M5 20h14"/>'),
  award: svg('<circle cx="12" cy="9" r="5.5"/><path d="m8.5 13.5-1.5 7 5-2.5 5 2.5-1.5-7"/>'),
};
