// AI 요청과 AI 설정 (로드맵 5-1, 2026-11-29 사용자 결정)
// - 서버 모드(firebase): 모든 AI 요청은 서버 함수 api/ai.js를 거친다(브라우저는 OpenRouter를 부르지 않음).
//   firebase/dataSync.js가 setAiBackend로 연결하고, 교사·관리자에게는 settings/ai(용도별 모델·한도)를 applyRemoteAiSettings로 넣는다.
// - 프로토타입·시연 모드: 지금처럼 더미 AI(services/mockAiService.js 등). 설정은 기본값만 보인다.

import { isFirebase } from './appMode.js';
import { aiLimits, aiModels } from '../data/aiConfig.js';

let backend = null;
/** { fetch(action, payload) → Promise<결과 | { error }> } */
export function setAiBackend(b) {
  backend = b;
}

let settings = { models: aiModels(), limits: aiLimits() };
export function applyRemoteAiSettings(data) {
  settings = { models: aiModels(data?.models), limits: aiLimits(data?.limits) };
}
/** 지금 용도별 모델·한도(교사·관리자가 받음. 학생과 프로토타입은 기본값) */
export const aiSettings = () => settings;

const call = (action, payload = {}) => (backend?.fetch ? backend.fetch(action, payload) : Promise.resolve({ error: '서버에 연결되지 않았어요.' }));

/** 서버 모드에서 실제 AI(서버 함수)를 쓰는가 */
export const usesServerAi = () => isFirebase && Boolean(backend);

/**
 * 연구 모드 2단계 대화 한 번. 실패하면 { error }(쓴 메시지는 화면에 그대로 남긴다)
 * @returns {Promise<{ text, model, usedFallback, promptVersion, logId, curriculumFlags, guard, guardVersion } | { error }>}
 */
export const askResearchAi = ({ sessionId, propositionId, messages }) => call('researchChat', {
  sessionId,
  propositionId,
  messages: messages.map((m) => ({ role: m.role, text: m.text })),
});

// 관리자 설정 > AI
export const loadAiAdmin = () => call('aiAdmin');
export const loadModelList = () => call('models');
export const saveAiModels = (models, extra = {}) => call('saveAiModels', { models, ...extra });
export const saveAiLimits = (limits) => call('saveAiLimits', { limits });
export const savePrompt = (id, template, note = '') => call('savePrompt', { id, template, note });
export const resetPrompt = (id) => call('resetPrompt', { id });
// 교사 설정 > 증명 연습: 학급별 하루 한도
export const setClassAiLimits = (classId, limits) => call('setClassAiLimits', { classId, limits });
