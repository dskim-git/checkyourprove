// 수업 설정 저장소 (프로토타입: 이 브라우저에만 임시 보관)
// 연구 모드 설정(researchOpen, researchPropositionIds, researchStagesOpen)은 진행 중 세션(state/sessionStore.js)에서 읽고 쓴다.
// 화면은 지금처럼 getClassroom()으로 함께 받는다. 증명 연습 설정(requiredClears, unlockAll 등)은 이 저장소에 둔다.
// TODO: 실제 서비스에서는 교사 권한을 서버에서 확인한 뒤에만 설정을 바꿀 수 있어야 한다.

import { DEFAULT_CLASSROOM } from '../data/classroom.js';
import { readJson, writeJson, removeKey } from './storage.js';
import { activeSession, sessionConfig, sessionLabel, updateSession } from './sessionStore.js';

const STORAGE_KEY = 'checkyourprove.prototype.classroom.v1';
const SESSION_FIELDS = ['consentRequired', 'surveyId', 'surveyPreOpen', 'surveyPostOpen'];
const RESEARCH_FIELDS = ['researchOpen', 'researchPropositionIds', 'researchStagesOpen', ...SESSION_FIELDS];

export function getClassroom() {
  const base = { ...DEFAULT_CLASSROOM, ...readJson(STORAGE_KEY, {}) };
  const session = activeSession();
  return {
    ...base,
    sessionId: session.id,
    sessionLabel: sessionLabel(session),
    researchOpen: session.open,
    researchPropositionIds: session.propositionIds,
    researchStagesOpen: session.stagesOpen,
    ...sessionConfig(session),
  };
}

export function saveClassroom(settings) {
  const session = activeSession();
  const patch = {};
  if ('researchOpen' in settings) patch.open = settings.researchOpen;
  if ('researchPropositionIds' in settings) patch.propositionIds = settings.researchPropositionIds;
  if ('researchStagesOpen' in settings) patch.stagesOpen = settings.researchStagesOpen;
  SESSION_FIELDS.forEach((k) => { if (k in settings) patch[k] = settings[k]; });
  if (Object.keys(patch).length) updateSession(session.id, patch);
  const rest = Object.fromEntries(Object.entries(settings).filter(([k]) => !RESEARCH_FIELDS.includes(k) && !['sessionId', 'sessionLabel'].includes(k)));
  return writeJson(STORAGE_KEY, rest);
}

export function resetClassroom() {
  removeKey(STORAGE_KEY);
}
