// 이 브라우저의 앱 기록 전체를 JSON 파일 하나로 내보내고 불러오기 (시연 데이터, 2026-11-27 사용자 결정)
//
// 파일 형식 { app: 'checkyourprove', kind: 'browser-data', format: 1, exportedAt, mode,
//            storage: { [접두어 뒤 키]: 저장된 문자열 }, recordings: [{ ...녹음 정보, blob: null, data: base64 }] }
// 접두어(checkyourprove.prototype. / checkyourprove.demo.)를 떼고 저장하므로 프로토타입에서 내보낸 파일을 시연 모드에서 그대로 불러온다.
// 불러오기는 이 모드의 기록을 모두 지운 뒤 파일 내용으로 바꾼다. 서버(Firebase)에는 닿지 않는다.

import { APP_MODE, PROTOTYPE_PREFIX, STORE_PREFIX } from './appMode.js';
import { deleteAllRecordings, listRecordings, saveRecording } from './recordingStore.js';

const FORMAT = 1;

function ls() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** 접두어로 시작하는 localStorage 기록 { 접두어 뒤 키: 문자열 } */
function readPrefixed(prefix) {
  const store = ls();
  const out = {};
  if (!store) return out;
  for (let i = 0; i < store.length; i += 1) {
    const key = store.key(i);
    if (key?.startsWith(prefix)) out[key.slice(prefix.length)] = store.getItem(key);
  }
  return out;
}

function clearPrefixed(prefix) {
  const store = ls();
  if (!store) return;
  const keys = [];
  for (let i = 0; i < store.length; i += 1) {
    const key = store.key(i);
    if (key?.startsWith(prefix)) keys.push(key);
  }
  keys.forEach((k) => store.removeItem(k));
}

async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return window.btoa(bin);
}

function base64ToBlob(data, type) {
  const bin = window.atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: type || 'application/octet-stream' });
}

const safeParse = (raw) => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

/** 기록 요약: 저장 항목 수, 계정·세션·연구 기록 세션 수, 녹음 수 */
export function summarize(storage, recordings = []) {
  const accounts = safeParse(storage['accounts.v1'] ?? 'null');
  const sessions = safeParse(storage['sessions.v1'] ?? 'null');
  return {
    keys: Object.keys(storage).length,
    users: (accounts?.users ?? []).length,
    sessions: (sessions?.sessions ?? []).length,
    researchSessions: Object.keys(storage).filter((k) => k.startsWith('research.v1')).length,
    recordings: recordings.length,
    recordingBytes: recordings.reduce((s, r) => s + (r.size ?? 0), 0),
  };
}

/** 이 모드의 기록 요약 */
export async function currentSummary() {
  return summarize(readPrefixed(STORE_PREFIX), await listRecordings());
}

/** 시연 모드에서, 같은 주소의 프로토타입 기록(본 앱이 브라우저 저장을 쓸 때 쌓인 것) 요약. 없으면 null */
export function prototypeSummary() {
  if (STORE_PREFIX === PROTOTYPE_PREFIX) return null;
  const storage = readPrefixed(PROTOTYPE_PREFIX);
  return Object.keys(storage).length ? summarize(storage) : null;
}

/** 내보낼 파일 내용 */
export async function exportBrowserData() {
  const recs = await listRecordings();
  const recordings = [];
  for (const r of recs) {
    const { blob, ...meta } = r;
    recordings.push({ ...meta, data: blob ? await blobToBase64(blob) : null });
  }
  return {
    app: 'checkyourprove',
    kind: 'browser-data',
    format: FORMAT,
    exportedAt: new Date().toISOString(),
    mode: APP_MODE,
    storage: readPrefixed(STORE_PREFIX),
    recordings,
  };
}

/** 파일 내용이 맞는지 확인. 맞으면 요약, 아니면 오류 메시지를 던진다 */
export function checkBrowserData(data) {
  if (!data || data.app !== 'checkyourprove' || data.kind !== 'browser-data' || typeof data.storage !== 'object') {
    throw new Error('증명 연습실에서 내보낸 기록 파일이 아니에요.');
  }
  if (data.format > FORMAT) throw new Error('더 새로운 앱에서 내보낸 파일이에요. 앱을 새로 고친 뒤 다시 해 보세요.');
  return summarize(data.storage, data.recordings ?? []);
}

/** 이 모드의 기록을 모두 지우고 파일 내용으로 바꾼다 */
export async function importBrowserData(data) {
  checkBrowserData(data);
  clearPrefixed(STORE_PREFIX);
  const store = ls();
  Object.entries(data.storage).forEach(([k, v]) => {
    if (typeof v === 'string') store?.setItem(STORE_PREFIX + k, v);
  });
  await deleteAllRecordings();
  for (const r of data.recordings ?? []) {
    const { data: b64, ...meta } = r;
    await saveRecording({ ...meta, blob: b64 ? base64ToBlob(b64, meta.mimeType) : null });
  }
}

/** 시연 모드: 같은 주소의 프로토타입 기록을 그대로 복사해 온다(녹음은 데이터베이스가 달라 빠짐) */
export async function copyPrototypeData() {
  await importBrowserData({ app: 'checkyourprove', kind: 'browser-data', format: FORMAT, storage: readPrefixed(PROTOTYPE_PREFIX), recordings: [] });
}

/** 이 모드의 기록을 모두 지운다(빈 상태로 시작) */
export async function clearBrowserData() {
  clearPrefixed(STORE_PREFIX);
  await deleteAllRecordings();
}

/** 내려받을 파일 이름 (예: 증명연습실_시연데이터_20261127-1530.json) */
export function exportFileName(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `증명연습실_${APP_MODE === 'demo' ? '시연데이터' : '브라우저기록'}_${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}.json`;
}
