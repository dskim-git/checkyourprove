// 교사 채점 기록 (프로토타입: 이 브라우저에만 임시 보관)
//
// 기록 구조
//   { raters: [{ id, name }], currentRater, blind, includeSamples, sortBy('mixed' | 'proposition' | 'propositionStage'),
//     scopeSessionIds(채점·태그·분석에 포함할 세션 id 목록, null이면 모두), rubric: { [기준 id]: { title, desc, levels } } | null,
//     rubricEditedAt, seeds: { [채점자 id]: 숫자 }, scores: { [채점자 id]: { [채점 대상 key]: score } } }
//   score = { criteria: { [기준 id]: 점수 }, completeness, actualMethod, note,
//             transcript('ok'|'error', 2단계), revisions: { [체크리스트 id]: 'fixed'|'not' }(4단계), stuckOvercome(4단계),
//             gradedAt, rubricEditedAt, blind }
//   aiGrades: { [채점자 id]: { [채점 대상 key]: AI 채점 도우미 결과 } } — 채점자가 직접 눌러야 생기고 그 채점자에게만 보인다
//     (다른 채점자의 AI 결과를 보면 독립 채점이 깨지므로) = { criteria, reasons, completeness, actualMethod, summary, total,
//     source, requestId, model, promptVersion, at, rubricEditedAt }
//   score.aiSeen: AI 제안을 본 상태에서 점수를 저장했는가, score.criteriaBeforeAi: AI를 보기 전에 저장했던 기준별 점수
//     (AI가 채점자의 판단을 바꾸었는지 분석할 때 쓴다)
//   채점 대상 key = '학생 id~단계~명제 id' (state/researchRoster.js)
//
// AI 대화 태그 (구현 3-2)
//   chatTags: 교사가 고친 태그 목록(없으면 data/chatTags.js의 기본 목록)
//   chatTagging: { [채점자 id]: { [대화 key]: { messages: { [메시지 번호]: [태그 id] }, conversation: [태그 id], note, taggedAt,
//                  aiSeen, beforeAi } } } — 대화 key = '학생 id~명제 id', 메시지 번호는 대화 기록의 순서(0부터)
//   chatTagAi: { [채점자 id]: { [대화 key]: AI 태그 제안 } } = { messages: { [번호]: [{ tag, reason }] }, conversation: [{ tag, reason }],
//              requestId, model, promptVersion, at }
// aiAsRater(3단계, 사용자 결정 2026-11-27): 켜면 AI 채점을 보조 채점자로 쓴다(점수 출처 "채점자 1과 AI 평균", 채점자 ↔ AI 일치도).
//   끄면 AI 채점은 참고로만 남는다(기본).
// AI가 읽은 글 고치기 (구현 7, 사용자 결정: 필기 글자 변환은 1·2·4단계, 교사만 봄)
//   inkReadingEdits: { [채점 대상 key]: { text, original, at, by(채점자 이름) } } — 학생 기록(item.inkReading)은 그대로 두고
//   교사가 원본 필기와 비교해 고친 글을 따로 둔다. 채점자 모두가 같은 글을 쓴다(사실 확인이지 점수 판단이 아니므로).
// 채점자는 서로의 점수를 채점 화면에서 보지 않는다. 두 채점자가 모두 채점한 증명으로 일치도를 계산한다(services/agreement.js).
// TODO: 로그인 연결 뒤 채점자를 교사 계정으로 바꾸고, 채점 기록은 교사만 읽고 쓰도록 서버 규칙으로 막는다.

import { DEFAULT_CHAT_TAGS } from '../data/chatTags.js';
import { DEFAULT_RUBRIC } from '../data/rubric.js';
import { readJson, removeKey, writeJson } from './storage.js';
import { isFirebase } from './appMode.js';

const STORAGE_KEY = 'checkyourprove.prototype.grading.v1';

// ── 서버 연결 (firebase 모드, 로드맵 4-3, 2026-11-28 사용자 결정) ──
// 화면은 지금처럼 getGrading()의 한 덩어리를 읽고, 바꾸는 함수는 모두 saveGrading()으로 끝난다.
// 서버 모드에서 saveGrading()은 firebase/gradingSync.js가 바뀐 것만 골라 쓴다:
//   채점 대상별 칸(점수·AI 채점·대화 태그·AI 태그·읽은 글 고치기) → sessions/{회차}/grading/{학생 uid}의 그 칸 하나(동시에 채점해도 덮어쓰지 않게)
//   루브릭·대화 태그 목록·채점자 자리·AI 보조 채점자 → settings/tools(관리자), 보기 설정 → teacherPrefs/{교사 uid}
//   예시 학생(sample-…)의 채점은 지금처럼 이 브라우저에 둔다(서버에 없는 가상 학생).
// 서버 학생 id는 '회차id_uid'(state/researchRoster.js). 같은 학생이 여러 회차에 있어도 채점이 섞이지 않는다.
export const TOOL_KEYS = ['raters', 'rubric', 'rubricEditedAt', 'chatTags', 'aiAsRater'];
export const PREF_KEYS = ['currentRater', 'blind', 'includeSamples', 'sortBy', 'scopeSessionIds', 'includeNonConsent', 'analysisSource', 'seeds'];
export const BY_RATER = ['scores', 'aiGrades', 'chatTagging', 'chatTagAi'];
/** 채점 대상·대화 key의 학생 id가 예시 학생인가 */
export const isSampleKey = (key) => String(key).startsWith('sample-');
/** 서버 학생 id '회차id_uid' → { sessionId, uid } (아니면 null) */
export function parseServerStudentId(studentId) {
  const s = String(studentId);
  const i = s.indexOf('_');
  return i > 0 ? { sessionId: s.slice(0, i), uid: s.slice(i + 1) } : null;
}
let backend = null;
/** firebase/gradingSync.js가 연결한다: { save(g) } */
export function setGradingBackend(b) {
  backend = b;
}
/** 예시 학생 칸만 남긴 사본(서버 모드에서 이 브라우저에 둘 것) */
function samplePart(g) {
  const pick = (m) => Object.fromEntries(Object.entries(m ?? {}).filter(([k]) => isSampleKey(k)));
  const out = { inkReadingEdits: pick(g.inkReadingEdits) };
  BY_RATER.forEach((sec) => { out[sec] = Object.fromEntries(Object.entries(g[sec] ?? {}).map(([r, m]) => [r, pick(m)])); });
  return out;
}

const DEFAULTS = () => ({
  raters: [{ id: 'r1', name: '채점자 1' }, { id: 'r2', name: '채점자 2' }],
  currentRater: 'r1',
  blind: true,
  includeSamples: true,
  sortBy: 'mixed',
  scopeSessionIds: null,
  includeNonConsent: false,
  rubric: null,
  rubricEditedAt: null,
  seeds: {},
  scores: { r1: {}, r2: {} },
  aiGrades: {},
  chatTags: null,
  chatTagging: {},
  chatTagAi: {},
  inkReadingEdits: {},
  aiAsRater: false,
});

let cache = null;

export function getGrading() {
  if (isFirebase) {
    // 서버 모드: 연구 도구·보기 설정·학생 채점은 서버에서 들어온다. 이 브라우저에는 예시 학생 칸만.
    cache ??= { ...DEFAULTS(), ...samplePart(readJson(STORAGE_KEY, {}) ?? {}) };
    return cache;
  }
  cache ??= { ...DEFAULTS(), ...readJson(STORAGE_KEY, {}) };
  return cache;
}

export function saveGrading() {
  if (isFirebase) {
    writeJson(STORAGE_KEY, samplePart(getGrading()));
    backend?.save(getGrading());
    return true;
  }
  return writeJson(STORAGE_KEY, getGrading());
}

// ── 채점자 자리 (2026-11-28 사용자 결정: 자리 방식, 자리 수와 맡을 교사를 조정) ──

/** 채점자 자리 더하기 (r1, r2, r3 …) */
export function addRater(name) {
  const g = getGrading();
  const n = g.raters.reduce((m, r) => Math.max(m, Number(String(r.id).slice(1)) || 0), 0) + 1;
  const rater = { id: `r${n}`, name: String(name ?? '').trim() || `채점자 ${n}`, uid: null };
  g.raters.push(rater);
  g.scores[rater.id] ??= {};
  saveGrading();
  return rater;
}

/** 채점자 자리 빼기(최소 한 자리). 그 자리의 점수는 지우지 않고 남긴다(다시 더하면 이어짐) */
export function removeRater(id) {
  const g = getGrading();
  if (g.raters.length <= 1) return false;
  g.raters = g.raters.filter((r) => r.id !== id);
  if (g.currentRater === id) g.currentRater = g.raters[0].id;
  return saveGrading();
}

/** 자리를 맡을 교사(uid, 서버 모드). 그 교사가 채점 화면을 열면 이 자리가 처음부터 골라져 있다 */
export function setRaterTeacher(id, uid) {
  const r = getGrading().raters.find((x) => x.id === id);
  if (!r) return false;
  r.uid = uid || null;
  return saveGrading();
}

/** 이 교사가 맡은 자리(없으면 null) */
export const raterOfTeacher = (uid) => getGrading().raters.find((r) => uid && r.uid === uid) ?? null;

/** 짝지은 채점자들(일치도): 두 명 이상이면 모든 짝 */
export function raterPairs(g = getGrading()) {
  const pairs = [];
  g.raters.forEach((a, i) => g.raters.slice(i + 1).forEach((b) => pairs.push([a, b])));
  return pairs;
}

export function resetGrading() {
  cache = null;
  removeKey(STORAGE_KEY);
}

export function updateGradingSettings(patch) {
  Object.assign(getGrading(), patch);
  return saveGrading();
}

export const currentRater = () => {
  const g = getGrading();
  return g.raters.find((r) => r.id === g.currentRater) ?? g.raters[0];
};

export function renameRater(id, name) {
  const rater = getGrading().raters.find((r) => r.id === id);
  if (rater && name.trim()) rater.name = name.trim();
}

// ── 서버 값 넣기 (firebase/gradingSync.js) ──

/** settings/tools의 채점 도구 */
export function applyRemoteTools(tools) {
  const g = getGrading();
  TOOL_KEYS.forEach((k) => { if (tools && k in tools) g[k] = tools[k]; });
  if (!Array.isArray(g.raters) || !g.raters.length) g.raters = DEFAULTS().raters;
}
/** teacherPrefs/{uid} */
export function applyRemotePrefs(prefs) {
  const g = getGrading();
  PREF_KEYS.forEach((k) => { if (prefs && k in prefs) g[k] = prefs[k]; });
  g.seeds ??= {};
}
/** 한 회차의 학생별 채점 문서들로 그 회차 학생의 칸을 바꾼다. docs: [{ uid, data }] */
export function applyRemoteGradingDocs(sessionId, docs) {
  const g = getGrading();
  const mine = (key) => String(key).startsWith(`${sessionId}_`);
  const strip = (m) => Object.keys(m ?? {}).forEach((k) => { if (mine(k)) delete m[k]; });
  BY_RATER.forEach((sec) => { g[sec] ??= {}; Object.values(g[sec]).forEach(strip); });
  g.inkReadingEdits ??= {};
  strip(g.inkReadingEdits);
  docs.forEach(({ data }) => {
    BY_RATER.forEach((sec) => Object.entries(data?.[sec] ?? {}).forEach(([r, m]) => {
      g[sec][r] ??= {};
      Object.assign(g[sec][r], m);
    }));
    Object.assign(g.inkReadingEdits, data?.inkReadingEdits ?? {});
  });
}

// ── 루브릭 (교사가 기준 이름·설명·점수 설명을 고칠 수 있다) ──

/** 지금 쓰는 루브릭: 기본 루브릭에 교사가 고친 글을 덮어쓴다. 점수 범위는 바꾸지 않는다. */
export function activeRubric() {
  const edits = getGrading().rubric ?? {};
  return DEFAULT_RUBRIC.map((c) => {
    const e = edits[c.id] ?? {};
    return { ...c, title: e.title || c.title, desc: e.desc || c.desc, levels: { ...c.levels, ...(e.levels ?? {}) } };
  });
}

export function saveRubric(edits) {
  const g = getGrading();
  g.rubric = edits;
  g.rubricEditedAt = new Date().toISOString();
  return saveGrading();
}

export function resetRubric() {
  const g = getGrading();
  g.rubric = null;
  g.rubricEditedAt = new Date().toISOString();
  return saveGrading();
}

// ── 점수 ──

// ── AI가 읽은 글 고치기 ──

export const readingEditOf = (key) => getGrading().inkReadingEdits?.[key] ?? null;

export function saveReadingEdit(key, text, original) {
  const g = getGrading();
  g.inkReadingEdits ??= {};
  g.inkReadingEdits[key] = { text, original, at: new Date().toISOString(), by: currentRater().name };
  return saveGrading();
}

export function clearReadingEdit(key) {
  delete getGrading().inkReadingEdits?.[key];
  return saveGrading();
}

export const scoreOf = (raterId, key) => getGrading().scores[raterId]?.[key] ?? null;

export function saveScore(raterId, key, score) {
  const g = getGrading();
  g.scores[raterId] ??= {};
  g.scores[raterId][key] = { ...score, gradedAt: new Date().toISOString(), rubricEditedAt: g.rubricEditedAt, blind: g.blind };
  return saveGrading();
}

/** 추가 확인(옮겨 적기, 보완 여부 등)만 덧붙인다 */
export function updateScore(raterId, key, patch) {
  const current = scoreOf(raterId, key);
  if (!current) return false;
  Object.assign(current, patch);
  return saveGrading();
}

// ── AI 채점 도우미 결과 ──

export const aiGradeOf = (raterId, key) => getGrading().aiGrades?.[raterId]?.[key] ?? null;

export function saveAiGrade(raterId, key, result) {
  const g = getGrading();
  g.aiGrades ??= {};
  g.aiGrades[raterId] ??= {};
  g.aiGrades[raterId][key] = { ...result, rubricEditedAt: g.rubricEditedAt };
  return saveGrading();
}

export const totalOf = (score) => (score ? Object.values(score.criteria ?? {}).reduce((sum, v) => sum + Number(v), 0) : null);

// ── 블라인드 순서: 채점자마다 고정된 무작위 순서 ──

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** keys를 채점자별 고정 무작위 순서로 섞는다(새 대상이 생겨도 기존 대상끼리의 순서는 유지) */
export function blindOrder(raterId, keys) {
  const g = getGrading();
  if (g.seeds[raterId] == null) {
    g.seeds[raterId] = Math.floor(Math.random() * 2 ** 31);
    saveGrading();
  }
  const rank = (key) => {
    let h = g.seeds[raterId];
    for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 2654435761) >>> 0;
    return seeded(h)();
  };
  return [...keys].sort((a, b) => rank(a) - rank(b));
}

// ── AI 대화 태그 ──

/** 지금 쓰는 태그 목록 */
export const activeChatTags = () => getGrading().chatTags ?? DEFAULT_CHAT_TAGS.map((t) => ({ ...t }));

export function saveChatTags(tags) {
  getGrading().chatTags = tags;
  return saveGrading();
}

export function resetChatTags() {
  getGrading().chatTags = null;
  return saveGrading();
}

export const chatTagRecord = (raterId, key) => getGrading().chatTagging?.[raterId]?.[key] ?? null;

/** 대화 태그 기록을 만들거나 가져온다 */
export function ensureChatTagRecord(raterId, key) {
  const g = getGrading();
  g.chatTagging ??= {};
  g.chatTagging[raterId] ??= {};
  g.chatTagging[raterId][key] ??= { messages: {}, conversation: [], note: '', taggedAt: null, aiSeen: false };
  return g.chatTagging[raterId][key];
}

/** 태그 하나를 붙이거나 뗀다. index가 null이면 대화 전체 태그. AI 제안을 본 상태면 aiSeen을 남긴다. */
export function toggleChatTag(raterId, key, index, tagId, on) {
  const record = ensureChatTagRecord(raterId, key);
  const list = index == null ? record.conversation : (record.messages[index] ??= []);
  const has = list.includes(tagId);
  if (on && !has) list.push(tagId);
  if (!on && has) list.splice(list.indexOf(tagId), 1);
  if (index != null && !list.length) delete record.messages[index];
  record.taggedAt = new Date().toISOString();
  if (chatTagAiOf(raterId, key)) record.aiSeen = true;
  return saveGrading();
}

export function saveChatTagNote(raterId, key, note) {
  const record = ensureChatTagRecord(raterId, key);
  record.note = note;
  record.taggedAt = new Date().toISOString();
  return saveGrading();
}

/** 태그를 다 붙였다고 표시한다(태그가 하나도 없어도 "확인함"으로 남길 수 있게) */
export function markChatTagged(raterId, key) {
  const record = ensureChatTagRecord(raterId, key);
  record.doneAt = new Date().toISOString();
  record.taggedAt ??= record.doneAt;
  return saveGrading();
}

export const chatTagAiOf = (raterId, key) => getGrading().chatTagAi?.[raterId]?.[key] ?? null;

/** AI 태그 제안을 저장한다. 이미 붙인 태그가 있고 AI를 처음 보는 것이면 그때의 태그를 beforeAi로 남긴다. */
export function saveChatTagAi(raterId, key, result) {
  const g = getGrading();
  g.chatTagAi ??= {};
  g.chatTagAi[raterId] ??= {};
  const record = chatTagRecord(raterId, key);
  if (record && !record.aiSeen && !record.beforeAi) {
    record.beforeAi = { messages: JSON.parse(JSON.stringify(record.messages)), conversation: [...record.conversation] };
  }
  g.chatTagAi[raterId][key] = result;
  return saveGrading();
}
