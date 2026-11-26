// AI와 탐구하기(연구 모드) 기록 저장소 (프로토타입: 이 브라우저에만 임시 보관)
//
// 기록 구조
//   { propositionIds, stages: { '1': stageRecord, ... }, updatedAt }
//   stageRecord = { startedAt, submittedAt, activeMs, leaves, items: { [명제 id]: item } }
//   item = 단계별 입력값 + 작성 과정 기록(track)
// 학생이 1단계를 처음 열 때 명제 목록을 고정한다(교사가 나중에 바꿔도 이 학생의 기록은 같은 명제로 이어진다).
// 제출한 단계는 다시 고칠 수 없다.
// TODO: Firestore 연동 시 학생별 문서로 옮기고, 제출 뒤 수정 금지와 단계 열림 여부를 보안 규칙·서버에서 확인한다.

import { readJson, writeJson, removeKey } from './storage.js';

const STORAGE_KEY = 'checkyourprove.prototype.research.v1';
const SNAPSHOT_LIMIT = 200;

let cache = null;
const now = () => new Date().toISOString();

export function getResearch() {
  cache ??= readJson(STORAGE_KEY, null) ?? { propositionIds: null, stages: {}, updatedAt: null };
  return cache;
}

export function saveResearch() {
  const record = getResearch();
  record.updatedAt = now();
  return writeJson(STORAGE_KEY, record);
}

export function resetResearch() {
  cache = null;
  removeKey(STORAGE_KEY);
}

/** 이 학생이 연구 활동에서 다루는 명제 목록 (시작 전에는 교사 설정을 따른다) */
export function propositionIdsFor(classroom) {
  return getResearch().propositionIds ?? classroom.researchPropositionIds;
}

const track = () => ({ activeMs: 0, firstInputAt: null, inputCount: 0, deleteCount: 0, snapshots: [], methodChanges: [] });

const ITEM_FACTORIES = {
  1: () => ({ method: '', methodOther: '', proof: '', confidence: null, stuck: '', track: track() }),
  2: () => ({
    aiMethod: '', aiMethodOther: '', aiProof: '', confidence: null, notable: '',
    pasteAttempts: 0, tabSwitches: 0, chat: { messages: [], requestLog: [] }, track: track(),
  }),
  3: () => ({ myChecklist: [], aiChecklist: [], aiIssues: '', aiHelpful: '', aiOpinion: '', track: track() }),
  4: () => ({ method: '', methodOther: '', proof: '', usedFromMine: '', usedFromAi: '', ratioMine: null, confidence: null, track: track() }),
};

export function findStage(n) {
  return getResearch().stages[String(n)] ?? null;
}

/** 단계 기록을 만들거나 가져온다. 처음 여는 순간을 시작 시각으로 남긴다. */
export function ensureStage(n, classroom) {
  const record = getResearch();
  record.propositionIds ??= [...classroom.researchPropositionIds];
  const key = String(n);
  record.stages[key] ??= { startedAt: now(), submittedAt: null, activeMs: 0, leaves: 0, items: {} };
  const stage = record.stages[key];
  record.propositionIds.forEach((id) => {
    stage.items[id] ??= ITEM_FACTORIES[n]();
  });
  saveResearch();
  return stage;
}

/** 작성 과정 기록: 첫 입력 시각, 입력·지우기 횟수 */
export function noteInput(item, inputType = '') {
  item.track.firstInputAt ??= now();
  item.track.inputCount += 1;
  if (inputType.startsWith('delete')) item.track.deleteCount += 1;
}

/** 작성 과정 기록: 증명 글의 중간 저장본 (바뀌었을 때만) */
export function snapshot(item, field) {
  const text = item[field] ?? '';
  const last = item.track.snapshots.filter((s) => s.field === field).at(-1);
  if (last?.text === text) return;
  item.track.snapshots.push({ at: now(), field, text });
  if (item.track.snapshots.length > SNAPSHOT_LIMIT) item.track.snapshots.shift();
}

export function noteMethodChange(item, field, from, to) {
  if (from && from !== to) item.track.methodChanges.push({ at: now(), field, from, to });
}

/** 제출 전에 채워야 할 항목: [{ field, message }] */
export function missingFields(n, item) {
  const missing = [];
  const need = (ok, field, message) => !ok && missing.push({ field, message });
  const filled = (v) => String(v ?? '').trim().length > 0;
  if (n === 1 || n === 4) {
    need(filled(item.method), 'method', '증명 방법을 고르세요.');
    if (item.method === 'other') need(filled(item.methodOther), 'methodOther', '사용한 증명 방법을 쓰세요.');
    need(filled(item.proof), 'proof', '증명을 쓰세요. 끝까지 못 했다면 쓴 데까지 적으세요.');
  }
  if (n === 2) {
    need(filled(item.aiMethod), 'aiMethod', 'AI가 사용한 증명 방법을 고르세요.');
    if (item.aiMethod === 'other') need(filled(item.aiMethodOther), 'aiMethodOther', 'AI가 사용한 증명 방법을 쓰세요.');
    need(filled(item.aiProof), 'aiProof', 'AI의 증명을 옮겨 적으세요.');
  }
  if (n === 3) {
    need(item.myChecklist.length > 0, 'myChecklist', '내 증명에서 보완할 점을 하나 이상 고르세요. 없으면 "찾지 못했다"를 고르세요.');
    need(item.aiChecklist.length > 0, 'aiChecklist', 'AI 증명에서 보완할 점을 하나 이상 고르세요. 없으면 "찾지 못했다"를 고르세요.');
    need(filled(item.aiIssues), 'aiIssues', 'AI 증명에서 보완할 부분과 이유를 쓰세요. 찾지 못했다면 "찾지 못함"이라고 쓰세요.');
  }
  if (n === 4) need(item.ratioMine != null, 'ratioMine', '반영 비율을 표시하세요.');
  if (n !== 3) need(item.confidence != null, 'confidence', '확신 정도를 고르세요.');
  return missing;
}

export function isItemComplete(n, item) {
  return missingFields(n, item).length === 0;
}

export function submitStage(n) {
  const stage = findStage(n);
  if (!stage || stage.submittedAt) return false;
  stage.submittedAt = now();
  saveResearch();
  return true;
}

/**
 * 단계 상태
 * @returns {{ state: 'closed'|'waiting'|'open'|'progress'|'submitted', label: string }}
 */
export function stageStatus(n, classroom) {
  const stage = findStage(n);
  if (stage?.submittedAt) return { state: 'submitted', label: '제출 완료' };
  if (!classroom.researchStagesOpen.includes(n)) return { state: 'closed', label: '선생님이 아직 열지 않았어요' };
  if (n > 1 && !findStage(n - 1)?.submittedAt) return { state: 'waiting', label: `${n - 1}단계를 먼저 제출하세요` };
  if (stage) return { state: 'progress', label: '진행 중' };
  return { state: 'open', label: '시작할 수 있어요' };
}

export const canEnterStage = (n, classroom) => ['open', 'progress', 'submitted'].includes(stageStatus(n, classroom).state);
