// 앱 실행 모드 (로드맵 4단계 준비, 2026-11-27 사용자 결정)
//   prototype  지금까지의 앱: 모든 저장이 이 브라우저(localStorage, 녹음은 IndexedDB). Firebase 설정값이 없을 때.
//   demo       시연 모드: demo.html(<html data-app-mode="demo">)로 열면 켜진다. prototype과 같은 브라우저 저장을 쓰되
//              저장 키 접두어가 달라(checkyourprove.demo.) 같은 주소의 본 앱 기록과 섞이지 않고, 서버에는 절대 닿지 않는다.
//              시연 데이터는 #/demo-data에서 JSON 파일로 내보내고 불러온다(파일은 _local_archive/demo/에 보관, 저장소에 올리지 않음).
//   TODO(4-1): firebase 모드(구글 로그인, Firestore)를 더한다.

const fromDom = typeof document !== 'undefined' ? document.documentElement?.dataset?.appMode : null;

export const APP_MODE = fromDom === 'demo' ? 'demo' : 'prototype';
export const isDemo = APP_MODE === 'demo';
/** 모든 저장이 이 브라우저에만 있는가 (prototype, demo) */
export const isBrowserOnly = APP_MODE === 'prototype' || APP_MODE === 'demo';

export const PROTOTYPE_PREFIX = 'checkyourprove.prototype.';
export const DEMO_PREFIX = 'checkyourprove.demo.';
/** 이 모드가 쓰는 저장 키 접두어 */
export const STORE_PREFIX = isDemo ? DEMO_PREFIX : PROTOTYPE_PREFIX;

/** 코드에 적힌 저장 키(checkyourprove.prototype.…)를 이 모드의 실제 키로 바꾼다 */
export function storageKey(key) {
  if (isDemo && key.startsWith(PROTOTYPE_PREFIX)) return DEMO_PREFIX + key.slice(PROTOTYPE_PREFIX.length);
  return key;
}
