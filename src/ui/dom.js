// DOM·문자열 공통 도구

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** 사용자 입력을 HTML에 넣기 전에 반드시 거친다. */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

export const nowIso = () => new Date().toISOString();

let idSequence = 0;
export const newId = (prefix) => `${prefix}-${Date.now().toString(36)}-${(idSequence++).toString(36)}`;

export function formatTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

export function formatDateTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('ko-KR', {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** 'revision.text' 같은 경로로 중첩 객체의 값을 바꾼다. */
export function setPath(target, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  const parent = keys.reduce((node, key) => node[key], target);
  parent[last] = value;
}
