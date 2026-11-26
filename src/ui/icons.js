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
  award: svg('<circle cx="12" cy="9" r="5.5"/><path d="m8.5 13.5-1.5 7 5-2.5 5 2.5-1.5-7"/>'),
};
