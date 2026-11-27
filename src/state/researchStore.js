// AI와 탐구하기(연구 모드) 기록 저장소 (프로토타입: 이 브라우저에만 임시 보관)
//
// 기록 구조
//   { propositionIds, stages: { '1': stageRecord, ... }, updatedAt }
//   stageRecord = { startedAt, submittedAt, activeMs, leaves, items: { [명제 id]: item } }
//   item = 단계별 입력값 + 작성 과정 기록(track)
//   증명 칸(1·4단계 proof, 2단계 aiProof)은 펜 필기 ink[필드]와 입력 방식 inputMode[필드]를 함께 둔다(state/inkModel.js).
// 학생이 1단계를 처음 열 때 명제 목록을 고정한다(교사가 나중에 바꿔도 이 학생의 기록은 같은 명제로 이어진다).
// 제출한 단계는 다시 고칠 수 없다.
// 연구 동의 consent = { agreed: true|false|null, at, version, history: [{ at, agreed, version }] }
// 설문 surveys = { pre|post: { surveyId, startedAt, submittedAt, activeMs, answers: { [문항 id]: 값 }, answeredAt: { [문항 id]: 시각 }, changes } }
//   동의하지 않은 학생은 연구용 설문을 하지 않고 1~4단계 활동만 한다(기록은 연구 분석에서 기본으로 빠진다).
// 원리 활동 principle = { version, startedAt, finishedAt, activeMs, answers: { [문항 id]: { choice, correct, at, ms } }, reflection }
//   동의하지 않은 학생도 수업 활동으로 한다(기록은 연구 분석에서 빠짐).
// 연구 기록은 세션(학급 × 회차)마다 따로 저장한다. 인자 없이 부르면 진행 중 세션의 기록이다(state/sessionStore.js).
// TODO: Firestore 연동 시 학생별 문서로 옮기고, 제출 뒤 수정 금지와 단계 열림 여부를 보안 규칙·서버에서 확인한다.

import { readJson, writeJson, removeKey } from './storage.js';
import { PROOF_HELP_MIN, transcriptMatch, transcriptOk } from '../services/proofHelp.js';
import { hasInk, inkEnough } from './inkModel.js';
import { activeSessionId, findSession } from './sessionStore.js';

const LEGACY_KEY = 'checkyourprove.prototype.research.v1';
const SNAPSHOT_LIMIT = 200;

/** 세션의 저장 키 (세션 기능 전 기록을 옮긴 첫 세션은 기존 키를 그대로 쓴다) */
const keyOf = (sessionId) => (findSession(sessionId)?.legacy ? LEGACY_KEY : `${LEGACY_KEY}.${sessionId}`);

const caches = new Map();
const now = () => new Date().toISOString();

export function getResearch(sessionId = activeSessionId()) {
  if (!caches.has(sessionId)) caches.set(sessionId, readJson(keyOf(sessionId), null) ?? { propositionIds: null, stages: {}, updatedAt: null });
  return caches.get(sessionId);
}

export function saveResearch(sessionId = activeSessionId()) {
  const record = getResearch(sessionId);
  record.updatedAt = now();
  return writeJson(keyOf(sessionId), record);
}

export function resetResearch(sessionId = activeSessionId()) {
  removeKey(keyOf(sessionId));
  caches.delete(sessionId);
}

// ── 연구 동의와 사전·사후 설문 ──

export function getConsent(sessionId = activeSessionId()) {
  const record = getResearch(sessionId);
  record.consent ??= { agreed: null, at: null, version: null, history: [] };
  return record.consent;
}

/** 동의하거나 그만두기(바꿀 때마다 기록이 남는다) */
export function answerConsent(agreed, version, sessionId = activeSessionId()) {
  const consent = getConsent(sessionId);
  const at = now();
  consent.history.push({ at, agreed, version });
  Object.assign(consent, { agreed, at, version });
  return saveResearch(sessionId);
}

export function getSurveyResponse(kind, sessionId = activeSessionId()) {
  const record = getResearch(sessionId);
  record.surveys ??= {};
  return record.surveys[kind] ?? null;
}

export function ensureSurveyResponse(kind, surveyId, sessionId = activeSessionId()) {
  const record = getResearch(sessionId);
  record.surveys ??= {};
  record.surveys[kind] ??= { surveyId, startedAt: now(), submittedAt: null, activeMs: 0, answers: {}, answeredAt: {}, changes: 0 };
  return record.surveys[kind];
}

/** 연구 참여(설문을 하는가): 동의를 받지 않는 세션이면 참여로 본다 */
export const researchParticipating = (classroom, sessionId = activeSessionId()) => !classroom.consentRequired || getConsent(sessionId).agreed === true;

/** 1단계 전에 해야 할 일: { step: 'consent'|'pre', label } 또는 null */
export function preStageBlocker(classroom, sessionId = activeSessionId()) {
  if (classroom.consentRequired && getConsent(sessionId).agreed == null) return { step: 'consent', label: '먼저 연구 동의에 답하세요' };
  if (researchParticipating(classroom, sessionId) && classroom.surveyId && classroom.surveyPreOpen && !getSurveyResponse('pre', sessionId)?.submittedAt) {
    return { step: 'pre', label: '먼저 사전 설문을 하세요' };
  }
  if (classroom.principleOpen && !getResearch(sessionId).principle?.finishedAt) return { step: 'principle', label: '먼저 "AI는 어떻게 답할까?" 활동을 하세요' };
  return null;
}

export const getPrinciple = (sessionId = activeSessionId()) => getResearch(sessionId).principle ?? null;

export function ensurePrinciple(version, sessionId = activeSessionId()) {
  const record = getResearch(sessionId);
  record.principle ??= { version, startedAt: now(), finishedAt: null, activeMs: 0, answers: {}, reflection: '' };
  return record.principle;
}

/** 사후 설문 상태: 'none'(하지 않음) | 'closed'(선생님이 열지 않음) | 'waiting'(4단계 제출 전) | 'open' | 'progress' | 'submitted' */
export function postSurveyState(classroom, sessionId = activeSessionId()) {
  if (!classroom.surveyId || !researchParticipating(classroom, sessionId)) return 'none';
  const res = getSurveyResponse('post', sessionId);
  if (res?.submittedAt) return 'submitted';
  if (!classroom.surveyPostOpen) return 'closed';
  if (!findStage(4)?.submittedAt) return 'waiting';
  return res ? 'progress' : 'open';
}

/** 세션에 학생 기록이 있는가 (1단계를 시작했는가) */
export const hasResearchRecord = (sessionId) => Boolean(getResearch(sessionId).propositionIds);

/** 이 학생이 연구 활동에서 다루는 명제 목록 (시작 전에는 교사 설정을 따른다) */
export function propositionIdsFor(classroom) {
  return getResearch().propositionIds ?? classroom.researchPropositionIds;
}

// penOnText: 글 칸(의견 등)에 펜으로 쓰려다 막힌 횟수 (글 칸은 키보드로만 쓴다)
const track = () => ({ activeMs: 0, firstInputAt: null, inputCount: 0, deleteCount: 0, snapshots: [], methodChanges: [], modeChanges: [], penOnText: 0 });

// 증명 칸의 펜 필기: ink[필드] = 필기 기록(state/inkModel.js), inputMode[필드] = 'keyboard' | 'pen'
const pen = () => ({ ink: {}, inputMode: {} });

const ITEM_FACTORIES = {
  1: () => ({ method: '', methodOther: '', proof: '', confidence: null, stuck: '', ...pen(), track: track() }),
  2: () => ({
    aiMethod: '', aiMethodOther: '', aiProof: '', confidence: null, notable: '',
    pasteAttempts: 0, tabSwitches: 0, chat: { messages: [], requestLog: [] }, ...pen(), track: track(),
  }),
  3: () => ({
    compareNote: '', myAdvantage: '', moreAccurate: '',
    myChecklist: [], stuckResolved: '',
    aiChecklist: [], aiIssues: '', aiHelpful: '',
    plan: '', aiOpinion: '', track: track(),
  }),
  4: () => ({ method: '', methodOther: '', proof: '', usedFromMine: '', usedFromAi: '', ratioMine: null, confidence: null, ...pen(), track: track() }),
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

/** 증명 칸의 필기 기록 (없으면 null) */
export const inkOf = (item, field) => item.ink?.[field] ?? null;

/** 증명 칸에 글이나 필기가 있는가 (필기도 "작성함"으로 인정) */
export const proofWritten = (item, field) => String(item[field] ?? '').trim().length > 0 || hasInk(inkOf(item, field));

/** 입력 방식(키보드/펜) 바꾸기를 기록하고, 다음 칸의 기본 입력 방식으로 기억한다. */
export function noteModeChange(item, field, to) {
  item.inputMode ??= {};
  const from = item.inputMode[field] ?? 'keyboard';
  item.inputMode[field] = to;
  getResearch().inputPref = to;
  if (from !== to) (item.track.modeChanges ??= []).push({ at: now(), field, from, to });
}

/** 증명 칸을 처음 열 때의 입력 방식: 고른 적이 있으면 그것, 필기만 있으면 펜, 글만 있으면 키보드, 아니면 마지막으로 쓴 방식 */
export function inputModeFor(item, field) {
  if (item.inputMode?.[field]) return item.inputMode[field];
  const text = String(item[field] ?? '').trim().length > 0;
  const ink = hasInk(inkOf(item, field));
  if (ink && !text) return 'pen';
  if (text && !ink) return 'keyboard';
  return getResearch().inputPref ?? 'keyboard';
}

/**
 * 2단계 옮겨 적기 확인 방법: 'text'(옮겨 적은 글이 AI 답과 일치) | 'teacher'(필기로 옮겨 적어 교사가 대화와 비교해 확인)
 * 필기는 글자 비교를 할 수 없어 양(획 수·길이)만 확인한다.
 */
export function transcriptCheckOf(item) {
  const text = String(item.aiProof ?? '').trim();
  if (text && transcriptOk(item.aiProof, proofHelpTexts(item))) return 'text';
  if (inkEnough(inkOf(item, 'aiProof'))) return 'teacher';
  return null;
}

/** 2단계 제출 때 교사용으로 남기는 옮겨 적기 기록 */
export function recordTranscript(item) {
  const text = String(item.aiProof ?? '').trim();
  item.transcriptMatch = text ? transcriptMatch(item.aiProof, proofHelpTexts(item)) : null;
  item.transcriptCheck = transcriptCheckOf(item);
}

/** 2단계: 증명 도움으로 인정된 AI 답들 (명제 증명 단계의 핵심을 PROOF_HELP_MIN 이상 담은 답) */
export const proofHelpTexts = (item) => (item.chat?.messages ?? [])
  .filter((m) => m.role === 'ai' && (m.coverage ?? 0) >= PROOF_HELP_MIN)
  .map((m) => m.text);

/** 2단계: AI에게서 증명 도움을 한 번 이상 받았는가 (받아야 기록하기로 넘어갈 수 있다) */
export const hasProofHelp = (item) => proofHelpTexts(item).length > 0;

/**
 * 채워야 할 항목: [{ field, message }] — 화면에 나오는 순서대로.
 * 모든 항목이 필수다. 의견을 쓰는 칸은 쓸 내용이 없으면 "없음"이라고 쓰게 한다.
 */
export function missingFields(n, item) {
  const missing = [];
  const need = (ok, field, message) => !ok && missing.push({ field, message });
  const filled = (v) => String(v ?? '').trim().length > 0;
  const text = (field, message) => need(filled(item[field]), field, message);
  const NONE = '쓸 내용이 없으면 "없음"이라고 쓰세요.';
  if (n === 1 || n === 4) {
    need(filled(item.method), 'method', '증명 방법을 고르세요.');
    if (item.method === 'other') text('methodOther', '사용한 증명 방법을 쓰세요.');
    need(proofWritten(item, 'proof'), 'proof', '증명을 키보드나 펜으로 쓰세요. 끝까지 못 했다면 쓴 데까지 적으세요.');
  }
  if (n === 1) {
    need(item.confidence != null, 'confidence', '확신 정도를 별로 고르세요.');
    text('stuck', `어려웠던 점이나 막힌 점을 쓰세요. ${NONE}`);
  }
  if (n === 2) {
    need(hasProofHelp(item), 'chat', '먼저 "AI와 대화"에서 AI에게 이 명제의 증명을 물어 증명 도움을 받으세요.');
    need(proofWritten(item, 'aiProof'), 'aiProof', 'AI의 증명을 키보드나 펜으로 옮겨 적으세요.');
    if (proofWritten(item, 'aiProof') && hasProofHelp(item) && !transcriptCheckOf(item)) {
      need(false, 'aiProof', filled(item.aiProof)
        ? '옮겨 적은 내용이 AI의 답변과 많이 다르거나 너무 짧아요. 위의 대화에서 AI의 증명을 보고 그대로 옮겨 적으세요.'
        : '펜으로 옮겨 적은 양이 너무 적어요. 위의 대화에서 AI의 증명을 보고 그대로 옮겨 적으세요.');
    }
    need(filled(item.aiMethod), 'aiMethod', 'AI가 사용한 증명 방법을 고르세요.');
    if (item.aiMethod === 'other') text('aiMethodOther', 'AI가 사용한 증명 방법을 쓰세요.');
    need(item.confidence != null, 'confidence', '확신 정도를 별로 고르세요.');
    text('notable', `AI 답변에서 특징적인 점을 쓰세요. ${NONE}`);
  }
  if (n === 3) {
    text('compareNote', '두 증명의 공통점과 차이점을 쓰세요.');
    text('myAdvantage', `내 증명이 AI의 증명보다 나은 점을 쓰세요. ${NONE}`);
    need(filled(item.moreAccurate), 'moreAccurate', '어느 증명이 더 정확한지 고르세요.');
    need(item.myChecklist.length > 0, 'myChecklist', '내 증명에서 보완할 점을 하나 이상 고르세요. 없으면 "찾지 못했다"를 고르세요.');
    need(filled(item.stuckResolved), 'stuckResolved', '막힌 점이 해결되었는지 고르세요.');
    need(item.aiChecklist.length > 0, 'aiChecklist', 'AI 증명에서 보완할 점을 하나 이상 고르세요. 없으면 "찾지 못했다"를 고르세요.');
    text('aiIssues', 'AI 증명에서 보완할 부분과 이유를 쓰세요. 찾지 못했다면 "찾지 못함"이라고 쓰세요.');
    text('aiHelpful', `AI의 답변 중 도움이 된 점을 쓰세요. ${NONE}`);
    text('plan', '최종 증명에 어떻게 활용할지 쓰세요.');
    text('aiOpinion', `AI에 대한 나의 의견을 쓰세요. ${NONE}`);
  }
  if (n === 4) {
    text('usedFromMine', `나의 증명에서 가져온 부분을 쓰세요. ${NONE}`);
    text('usedFromAi', `AI의 증명에서 가져온 부분을 쓰세요. ${NONE}`);
    need(item.ratioMine != null, 'ratioMine', '반영 비율을 칸으로 표시하세요.');
    need(item.confidence != null, 'confidence', '확신 정도를 별로 고르세요.');
  }
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
  // 1단계를 아직 시작하지 않았으면 연구 동의·사전 설문을 먼저 한다(이미 시작한 기록은 막지 않는다)
  if (n === 1 && !stage) {
    const blocker = preStageBlocker(classroom);
    if (blocker) return { state: 'waiting', label: blocker.label };
  }
  if (stage) return { state: 'progress', label: '진행 중' };
  return { state: 'open', label: '시작할 수 있어요' };
}

export const canEnterStage = (n, classroom) => ['open', 'progress', 'submitted'].includes(stageStatus(n, classroom).state);
