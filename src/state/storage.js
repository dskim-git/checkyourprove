// 브라우저 임시 보관 (localStorage)
// 프로토타입 전용. 사생활 보호 모드 등에서 저장이 막혀도 앱이 동작하도록 예외를 삼킨다.
// TODO: Firestore 연동 시 이 모듈을 사용하는 스토어(sessionStore, classroomStore)의 구현을 교체한다.

// 앱 이름을 checkyourproof → checkyourprove로 바꾸기 전의 저장 키 (이미 쌓인 테스트 기록을 옮겨 온다)
const LEGACY_PREFIX = 'checkyourproof.';
const PREFIX = 'checkyourprove.';

function migrateLegacy(key) {
  if (!key.startsWith(PREFIX)) return null;
  const legacyKey = LEGACY_PREFIX + key.slice(PREFIX.length);
  const raw = window.localStorage.getItem(legacyKey);
  if (raw === null) return null;
  window.localStorage.setItem(key, raw);
  window.localStorage.removeItem(legacyKey);
  return raw;
}

export function readJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key) ?? migrateLegacy(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // 무시
  }
}
