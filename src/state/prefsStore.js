// 개인 설정 (설정 정리 작업, 2026-11-27): 화면(글자 크기, 대비, 움직임 줄이기), 입력(증명 칸 기본 입력 방식, 손가락으로도 쓰기),
// 닫은 공지. 기기마다 이 브라우저에 둔다(같은 기기의 같은 사람이 쓰는 설정). TODO(Firebase): 로그인한 사용자 문서에도 저장해 기기를 옮겨도 따라가게 한다.
// 화면 설정은 <html>의 data-font-scale, data-contrast, data-motion으로 걸고 CSS(base.css)가 반영한다.

import { readJson, writeJson } from './storage.js';

const STORAGE_KEY = 'checkyourprove.prototype.prefs.v1';

export const FONT_SCALES = [
  { id: 'normal', label: '보통' },
  { id: 'large', label: '크게' },
  { id: 'xlarge', label: '아주 크게' },
];
export const INPUT_MODES = [
  { id: 'auto', label: '마지막에 쓴 방식' },
  { id: 'keyboard', label: '키보드' },
  { id: 'pen', label: '펜 필기' },
];

const DEFAULTS = { fontScale: 'normal', contrast: 'normal', motion: 'system', inputMode: 'auto', fingerDefault: false, dismissedNotices: [] };

let cache = null;
export function getPrefs() {
  cache ??= { ...DEFAULTS, ...(readJson(STORAGE_KEY, {}) ?? {}) };
  if (!Array.isArray(cache.dismissedNotices)) cache.dismissedNotices = [];
  return cache;
}

export function savePrefs(patch) {
  Object.assign(getPrefs(), patch);
  writeJson(STORAGE_KEY, getPrefs());
  applyPrefs();
}

export function resetPrefs() {
  cache = { ...DEFAULTS, dismissedNotices: getPrefs().dismissedNotices };
  writeJson(STORAGE_KEY, cache);
  applyPrefs();
}

/** 화면 설정을 문서에 건다 (앱을 열 때와 바꿀 때) */
export function applyPrefs() {
  const p = getPrefs();
  const el = document.documentElement;
  el.dataset.fontScale = p.fontScale;
  el.dataset.contrast = p.contrast;
  el.dataset.motion = p.motion;
}

export function dismissNotice(id) {
  const p = getPrefs();
  if (!p.dismissedNotices.includes(id)) p.dismissedNotices.push(id);
  writeJson(STORAGE_KEY, p);
}
