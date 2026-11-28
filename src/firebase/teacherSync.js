// 채점·대화 태그·면담·연구 도구·설문 동기화 (firebase 모드, 로드맵 4-3). dataSync.js가 로그인·역할이 정해지면 부른다.
//
// 받기: settings/tools(채점 도구·면담 기준·녹음 보관 기한), settings/consent, surveys(모두),
//       teacherPrefs/{나}(교사), 담당 회차마다 grading·interviews 모음(교사) → 각 저장소의 applyRemote…
// 쓰기: 저장소의 save가 부르면 마지막으로 서버와 맞춘 값(last)과 견주어 바뀐 것만 쓴다.
//   채점은 칸 하나(점수[채점자][대상] 등)만 mergeFields로 써서 두 교사가 같은 학생을 동시에 채점해도 서로 덮어쓰지 않는다.

import {
  collection, deleteDoc, deleteField, doc, FieldPath, getDoc, onSnapshot, setDoc,
} from 'firebase/firestore';
import {
  applyRemoteGradingDocs, applyRemotePrefs, applyRemoteTools, BY_RATER, getGrading, isSampleKey, parseServerStudentId, PREF_KEYS,
  setGradingBackend, TOOL_KEYS,
} from '../state/gradingStore.js';
import { applyRemoteInterviews, applyRemoteInterviewTools, getInterviews, setInterviewBackend } from '../state/interviewStore.js';
import { applyRemoteConsent, applyRemoteSurveys, setSurveyBackend } from '../state/surveyStore.js';

let ctx = null; // { db, uid, role, call(path, action, payload), notify(msg), emit() }
let unsubs = [];
let sessionUnsubs = new Map();
const last = new Map(); // 서버와 맞춘 값(JSON 글): 'tools', 'itools', 'prefs', 'consent', 'survey:id', 'leaf:...', 'iv:...'
const clean = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));
const json = (v) => JSON.stringify(v ?? null);
const isAdmin = () => ctx?.role === 'admin';
const isStaff = () => ctx?.role === 'admin' || ctx?.role === 'teacher';
const fail = (what) => (error) => {
  console.warn(`[firestore] ${what}`, error?.code ?? error);
  ctx?.notify(`${what}을(를) 저장하지 못했어요${error?.code === 'permission-denied' ? '(권한이 없어요)' : ''}.`);
};
const pick = (obj, keys) => Object.fromEntries(keys.map((k) => [k, clean(obj?.[k])]));

// ── 채점 칸 ──

/** 서버로 갈 채점 칸들: Map(id → { sessionId, uid, path: [...], value }) */
function gradingLeaves(g) {
  const out = new Map();
  const add = (section, raterId, key, value) => {
    const sid = String(key).split('~')[0];
    if (isSampleKey(sid)) return;
    const who = parseServerStudentId(sid);
    if (!who) return;
    const path = raterId ? [section, raterId, key] : [section, key];
    out.set(`leaf:${who.sessionId}:${who.uid}:${path.join('|')}`, { ...who, path, value });
  };
  BY_RATER.forEach((sec) => Object.entries(g[sec] ?? {}).forEach(([r, m]) => Object.entries(m ?? {}).forEach(([k, v]) => add(sec, r, k, v))));
  Object.entries(g.inkReadingEdits ?? {}).forEach(([k, v]) => add('inkReadingEdits', null, k, v));
  return out;
}

const setIn = (obj, path, value) => {
  let o = obj;
  path.slice(0, -1).forEach((p) => { o = (o[p] ??= {}); });
  o[path.at(-1)] = value;
};

async function saveGrading(g) {
  if (!ctx) return;
  try {
    if (isAdmin()) {
      const tools = pick(g, TOOL_KEYS);
      if (json(tools) !== last.get('tools')) {
        await setDoc(doc(ctx.db, 'settings', 'tools'), tools, { mergeFields: TOOL_KEYS });
        last.set('tools', json(tools));
      }
    }
    if (isStaff()) {
      const prefs = pick(g, PREF_KEYS);
      if (json(prefs) !== last.get('prefs')) {
        await setDoc(doc(ctx.db, 'teacherPrefs', ctx.uid), prefs);
        last.set('prefs', json(prefs));
      }
    }
    // 학생 채점 칸: 바뀐 것과 지워진 것만, 문서마다 모아서
    const now = gradingLeaves(g);
    const byDoc = new Map();
    const put = (sessionId, uid, path, value, id, text) => {
      const k = `${sessionId}/${uid}`;
      if (!byDoc.has(k)) byDoc.set(k, { sessionId, uid, data: {}, fields: [], marks: [] });
      const d = byDoc.get(k);
      setIn(d.data, path, value);
      d.fields.push(new FieldPath(...path));
      d.marks.push([id, text]);
    };
    now.forEach((leaf, id) => {
      const text = json(leaf.value);
      if (last.get(id) !== text) put(leaf.sessionId, leaf.uid, leaf.path, clean(leaf.value), id, text);
    });
    [...last.keys()].filter((id) => id.startsWith('leaf:') && !now.has(id)).forEach((id) => {
      const [, sessionId, uid, p] = id.split(':');
      put(sessionId, uid, p.split('|'), deleteField(), id, null);
    });
    for (const d of byDoc.values()) {
      await setDoc(doc(ctx.db, 'sessions', d.sessionId, 'grading', d.uid), d.data, { mergeFields: d.fields });
      d.marks.forEach(([id, text]) => (text == null ? last.delete(id) : last.set(id, text)));
    }
  } catch (error) {
    fail('채점 기록')(error);
  }
}

// ── 면담 ──

async function saveInterviews(d) {
  if (!ctx) return;
  try {
    if (isAdmin()) {
      const tools = { interviewThresholds: clean(d.thresholds), retentionUntil: d.retentionUntil ?? null };
      if (json(tools) !== last.get('itools')) {
        await setDoc(doc(ctx.db, 'settings', 'tools'), tools, { mergeFields: ['interviewThresholds', 'retentionUntil'] });
        last.set('itools', json(tools));
      }
    }
    const ids = new Set([...Object.keys(d.selected), ...Object.keys(d.records), ...[...last.keys()].filter((k) => k.startsWith('iv:')).map((k) => k.slice(3))]);
    for (const studentId of ids) {
      const who = parseServerStudentId(studentId);
      if (!who || String(studentId).startsWith('sample-')) continue;
      const data = { selection: clean(d.selected[studentId] ?? null), record: clean(d.records[studentId] ?? null) };
      const text = json(data);
      const key = `iv:${studentId}`;
      if (last.get(key) === text || (!last.has(key) && !data.selection && !data.record)) continue;
      const ref = doc(ctx.db, 'sessions', who.sessionId, 'interviews', who.uid);
      if (!data.selection && !data.record) await deleteDoc(ref);
      else await setDoc(ref, data);
      last.set(key, text);
    }
  } catch (error) {
    fail('면담 기록')(error);
  }
}

// ── 설문·동의서 (관리자) ──

async function saveSurveys(data) {
  if (!ctx || !isAdmin()) return;
  try {
    const ids = new Set(data.surveys.map((s) => s.id));
    for (const s of data.surveys) {
      const text = json(clean(s));
      if (last.get(`survey:${s.id}`) === text || s.lockedAt) continue;
      await setDoc(doc(ctx.db, 'surveys', s.id), clean(s));
      last.set(`survey:${s.id}`, text);
    }
    for (const key of [...last.keys()].filter((k) => k.startsWith('survey:'))) {
      const id = key.slice(7);
      if (!ids.has(id)) {
        await deleteDoc(doc(ctx.db, 'surveys', id));
        last.delete(key);
      }
    }
    const consent = clean(data.consent);
    if (json(consent) !== last.get('consent')) {
      await setDoc(doc(ctx.db, 'settings', 'consent'), consent);
      last.set('consent', json(consent));
    }
  } catch (error) {
    fail('설문·동의서')(error);
  }
}

// ── 시작 ──

function connect() {
  setGradingBackend({ save: saveGrading });
  setInterviewBackend({ save: saveInterviews });
  setSurveyBackend({
    save: saveSurveys,
    lock: (id) => ctx?.call('/api/account', 'lockSurvey', { id }),
  });
}

/** 담당 회차마다 채점·면담 모음 구독(교사) */
export function syncTeacherSessions(sessionIds) {
  if (!ctx || !isStaff()) return;
  const want = new Set(sessionIds.filter((id) => !id.startsWith('pending-')));
  sessionUnsubs.forEach((u, id) => {
    if (!want.has(id)) {
      u.forEach((f) => f());
      sessionUnsubs.delete(id);
    }
  });
  want.forEach((sid) => {
    if (sessionUnsubs.has(sid)) return;
    const g = onSnapshot(collection(ctx.db, 'sessions', sid, 'grading'), (snap) => {
      const docs = snap.docs.map((d) => ({ uid: d.id, data: d.data() }));
      applyRemoteGradingDocs(sid, docs);
      // 서버와 맞춘 값으로 기록(다시 쓰지 않게)
      [...last.keys()].filter((k) => k.startsWith(`leaf:${sid}:`)).forEach((k) => last.delete(k));
      gradingLeaves(getGrading()).forEach((leaf, id) => { if (leaf.sessionId === sid) last.set(id, json(leaf.value)); });
      ctx.emit();
    }, (e) => console.warn('[firestore] 채점', e?.code));
    const iv = onSnapshot(collection(ctx.db, 'sessions', sid, 'interviews'), (snap) => {
      const docs = snap.docs.map((d) => ({ studentId: `${sid}_${d.id}`, data: d.data() }));
      applyRemoteInterviews(sid, docs);
      [...last.keys()].filter((k) => k.startsWith(`iv:${sid}_`)).forEach((k) => last.delete(k));
      docs.forEach(({ studentId, data }) => last.set(`iv:${studentId}`, json({ selection: data.selection ?? null, record: data.record ?? null })));
      ctx.emit();
    }, (e) => console.warn('[firestore] 면담', e?.code));
    sessionUnsubs.set(sid, [g, iv]);
  });
}

export function stopTeacherSync() {
  unsubs.forEach((u) => u());
  unsubs = [];
  sessionUnsubs.forEach((u) => u.forEach((f) => f()));
  sessionUnsubs = new Map();
  last.clear();
  ctx = null;
}

/** 시작. 첫 값이 들어오면 끝나는 약속들을 돌려준다 */
export function startTeacherSync(next) {
  stopTeacherSync();
  ctx = next;
  connect();
  const first = [];
  const listen = (ref, apply, what) => first.push(new Promise((resolve) => {
    unsubs.push(onSnapshot(ref, (snap) => {
      apply(snap);
      ctx?.emit();
      resolve();
    }, (e) => { console.warn(`[firestore] ${what}`, e?.code); resolve(); }));
  }));
  listen(doc(ctx.db, 'settings', 'tools'), (snap) => {
    const t = snap.exists() ? snap.data() : {};
    applyRemoteTools(t);
    applyRemoteInterviewTools(t);
    last.set('tools', json(pick(getGrading(), TOOL_KEYS)));
    const d = getInterviews();
    last.set('itools', json({ interviewThresholds: clean(d.thresholds), retentionUntil: d.retentionUntil ?? null }));
  }, '연구 도구');
  listen(doc(ctx.db, 'settings', 'consent'), (snap) => {
    applyRemoteConsent(snap.exists() ? snap.data() : null);
    if (snap.exists()) last.set('consent', json(clean(snap.data())));
  }, '연구 동의서');
  listen(collection(ctx.db, 'surveys'), (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    applyRemoteSurveys(list);
    [...last.keys()].filter((k) => k.startsWith('survey:')).forEach((k) => last.delete(k));
    list.forEach((s) => last.set(`survey:${s.id}`, json(clean(s))));
  }, '설문');
  if (isStaff()) {
    first.push(getDoc(doc(ctx.db, 'teacherPrefs', ctx.uid)).then((snap) => {
      const prefs = snap.exists() ? snap.data() : {};
      applyRemotePrefs(prefs);
      const g = getGrading();
      // 처음이면 내가 맡은 채점자 자리를 고른다
      if (!prefs.currentRater) g.currentRater = g.raters.find((r) => r.uid === ctx.uid)?.id ?? g.raters[0]?.id;
      last.set('prefs', json(pick(g, PREF_KEYS)));
    }).catch((e) => console.warn('[firestore] 보기 설정', e?.code)));
  }
  return first;
}
