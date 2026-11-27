// 면담 녹음 파일 저장소 (구현 7, 프로토타입: 이 브라우저의 IndexedDB)
//
// 녹음 = { id, studentId, pseudonym, sessionLabel, sample, createdAt, durationMs, mimeType, size, blob, transcript: null }
// 녹음 파일은 localStorage에 넣기에 커서 IndexedDB에 둔다. IndexedDB를 쓸 수 없으면(사생활 보호 모드 등) 이 탭의 메모리에만 두고
// 화면에 알린다(새로 고치면 사라짐). 보관 기한(연구 종료일)은 state/interviewStore.js의 retentionUntil.
// 사용자 결정(2026-11-27): 연구 기간 동안 보관, 녹음 관리 화면에서 듣기·내려받기·삭제, 기한이 다가오거나 지나면 알림(자동 삭제는 하지 않음).
// TODO(Firebase): Firebase Storage(교사만 읽고 쓰는 경로)로 옮기고 이 모듈의 함수만 바꾼다. 전사(transcript)는 서버 함수가
//   음성 인식 API를 불러 채운다(AGENTS.md 5절 "면담 녹음과 전사").

const DB_NAME = 'checkyourprove.prototype.recordings';
const STORE = 'recordings';
const memory = new Map();
let dbPromise = null;
let usingMemory = false;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') throw new Error('no indexedDB');
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        usingMemory = true;
        resolve(null);
      };
    } catch {
      usingMemory = true;
      resolve(null);
    }
  });
  return dbPromise;
}

/** IndexedDB를 쓰지 못해 메모리에만 두는 중인가 */
export const recordingsInMemory = async () => {
  await openDb();
  return usingMemory;
};

function run(mode, fn) {
  return openDb().then((db) => {
    if (!db) return fn(null);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      const req = fn(store);
      tx.oncomplete = () => resolve(req?.result);
      tx.onerror = () => reject(tx.error);
    });
  });
}

/** 녹음 목록 (새것부터) */
export async function listRecordings({ studentId = null } = {}) {
  const all = await run('readonly', (store) => (store ? store.getAll() : null)) ?? [...memory.values()];
  return all.filter((r) => !studentId || r.studentId === studentId).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function saveRecording(rec) {
  const full = { transcript: null, ...rec, size: rec.size ?? rec.blob?.size ?? 0 };
  await run('readwrite', (store) => (store ? store.put(full) : null));
  if (usingMemory) memory.set(full.id, full);
  return full;
}

export async function deleteRecording(id) {
  memory.delete(id);
  await run('readwrite', (store) => (store ? store.delete(id) : null));
}

export async function deleteAllRecordings() {
  memory.clear();
  await run('readwrite', (store) => (store ? store.clear() : null));
}

/** 내려받을 파일 이름 (예: 면담녹음_예시학생01_20261128-1320.webm) */
export function recordingFileName(rec) {
  const d = new Date(rec.createdAt);
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  const who = String(rec.pseudonym ?? rec.studentId).replace(/[\\/:*?"<>|()\s]+/g, '');
  const ext = String(rec.mimeType ?? '').includes('mp4') ? 'm4a' : String(rec.mimeType ?? '').includes('ogg') ? 'ogg' : 'webm';
  return `면담녹음_${who}_${stamp}.${ext}`;
}

/** 보관 기한 상태: { state: 'none'|'ok'|'soon'|'over', days } (soon = 14일 이내) */
export function retentionState(until, today = new Date()) {
  if (!until) return { state: 'none', days: null };
  const end = new Date(`${until}T23:59:59`);
  const days = Math.ceil((end - today) / 86400000);
  if (Number.isNaN(days)) return { state: 'none', days: null };
  return { state: days < 0 ? 'over' : days <= 14 ? 'soon' : 'ok', days };
}

export const formatDuration = (ms) => {
  const s = Math.round((ms ?? 0) / 1000);
  return `${Math.floor(s / 60)}분 ${String(s % 60).padStart(2, '0')}초`;
};

export const formatSize = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round((bytes ?? 0) / 1024))}KB`);
