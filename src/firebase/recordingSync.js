// 면담 녹음 Firebase Storage 연결 (firebase 모드, 로드맵 4-4). dataSync.js가 교사·관리자일 때 연결한다.
//   파일: Storage recordings/{회차}/{학생 uid}/{녹음 id}.{확장자} (담당 교사·관리자만, storage.rules)
//   정보: Firestore sessions/{회차}/recordings/{녹음 id} = { id, studentId, uid, pseudonym, sessionLabel, sample:false, createdAt, durationMs,
//         mimeType, size, path, url(내려받기 주소), transcript, by(올린 교사 uid), uploadedAt }
// 녹음은 먼저 이 기기(IndexedDB)에 두고 올린다. 올리면 기기 사본을 지우고, 실패하면 남겨 두었다가 다음 목록 때 다시 올린다
// (state/recordingStore.js). 내려받기 이름은 파일의 Content-Disposition으로 정한다(다른 주소라 a[download]가 듣지 않으므로).

import { collection, deleteDoc, doc, getDocs, setDoc } from 'firebase/firestore';
import { deleteObject, getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';
import { recordingFileName, setRecordingBackend } from '../state/recordingStore.js';
import { getSessions } from '../state/sessionStore.js';
import { parseServerStudentId } from '../state/gradingStore.js';

let ctx = null; // { app, db, uid }
let storage = null;
const known = new Map(); // 녹음 id → { sessionId, path }

const ext = (mime) => (String(mime).includes('mp4') ? 'm4a' : String(mime).includes('ogg') ? 'ogg' : 'webm');
const mySessionIds = () => getSessions().sessions.map((s) => s.id).filter((id) => !id.startsWith('pending-'));

async function list() {
  if (!ctx) return [];
  const out = [];
  await Promise.all(mySessionIds().map(async (sid) => {
    try {
      const snap = await getDocs(collection(ctx.db, 'sessions', sid, 'recordings'));
      snap.forEach((d) => {
        const r = d.data();
        known.set(d.id, { sessionId: sid, path: r.path });
        out.push({ ...r, id: d.id, blob: null });
      });
    } catch (error) {
      console.warn('[firestore] 녹음 목록', sid, error?.code);
    }
  }));
  return out;
}

/** 녹음 하나를 올린다. 성공하면 true */
async function upload(rec) {
  if (!ctx || !rec?.blob) return false;
  const who = parseServerStudentId(rec.studentId);
  if (!who) return false;
  const path = `recordings/${who.sessionId}/${who.uid}/${rec.id}.${ext(rec.mimeType)}`;
  const contentType = String(rec.mimeType || 'audio/webm').split(';')[0] || 'audio/webm';
  try {
    const fileRef = ref(storage, path);
    await uploadBytes(fileRef, rec.blob, {
      contentType,
      contentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(recordingFileName(rec))}`,
    });
    const url = await getDownloadURL(fileRef);
    const { blob, pending, ...meta } = rec;
    void blob;
    void pending;
    await setDoc(doc(ctx.db, 'sessions', who.sessionId, 'recordings', rec.id), {
      ...JSON.parse(JSON.stringify(meta)), uid: who.uid, path, url, by: ctx.uid, uploadedAt: new Date().toISOString(), sample: false,
    });
    known.set(rec.id, { sessionId: who.sessionId, path });
    return true;
  } catch (error) {
    console.warn('[storage] 녹음 올리기', error?.code ?? error);
    return false;
  }
}

async function remove(id) {
  if (!ctx) return;
  if (!known.has(id)) await list();
  const k = known.get(id);
  if (!k) return;
  await deleteObject(ref(storage, k.path)).catch((e) => console.warn('[storage] 녹음 지우기', e?.code));
  await deleteDoc(doc(ctx.db, 'sessions', k.sessionId, 'recordings', id));
  known.delete(id);
}

async function removeAll() {
  const all = await list();
  for (const r of all) await remove(r.id);
}

export function startRecordingSync(next) {
  ctx = next;
  storage = getStorage(next.app);
  setRecordingBackend({ list, upload, remove, removeAll });
}

export function stopRecordingSync() {
  ctx = null;
  known.clear();
  setRecordingBackend(null);
}
