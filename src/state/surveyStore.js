// 연구 설문(문항 세트)과 연구 동의서 저장소 (프로토타입: 이 브라우저에만 임시 보관)
//
// 기록 구조
//   { surveys: [survey], consent: { version, title, body, editedAt } }
//   survey = { id, title, intro, questions: [question], createdAt, lockedAt, example?, defaultVersion?(기본 설문의 판),
//              instrument: { name, citation, reliability, adaptation, permission }(평가도구 정보),
//              domains: [{ id, label }](하위 요인, 없으면 기본 3개), scale: { points: 4~7, labels }(척도) }
//   question = { id, domain, type: 'scale'|'choice'|'short'|'long', text, options?(객관식), reverse?(척도 역문항),
//                sourceNo?(원도구 문항 번호), sourceText?(원도구 문항 원문) }
// 사전·사후 설문은 같은 문항 세트를 쓴다. 학생이 응답을 시작하면 그 설문은 잠겨(lockedAt) 문항을 고칠 수 없다.
// 고치려면 "복사해서 새 설문"을 만든다. 세션마다 쓸 설문을 고른다(state/sessionStore.js의 surveyId).
// 학생 응답·동의는 세션의 연구 기록에 둔다(state/researchStore.js: consent, surveys).
// TODO(Firebase): 설문은 교사 문서로, 응답은 학생 문서로 옮기고 잠금은 서버 규칙으로 강제한다.

import { DEFAULT_CONSENT, DEFAULT_SURVEY, DEFAULT_SURVEY_ID, DEFAULT_SURVEY_VERSION, SCALE_PRESETS, SURVEY_DOMAINS } from '../data/surveyDefaults.js';
import { readJson, writeJson } from './storage.js';

const STORAGE_KEY = 'checkyourprove.prototype.surveys.v1';
let cache = null;
const now = () => new Date().toISOString();
const newId = (prefix) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

const freshDefault = () => ({ ...JSON.parse(JSON.stringify(DEFAULT_SURVEY)), createdAt: now(), lockedAt: null });

export function getSurveyData() {
  if (cache) return cache;
  cache = readJson(STORAGE_KEY, null) ?? { surveys: [freshDefault()], consent: { ...DEFAULT_CONSENT, editedAt: null } };
  if (!Array.isArray(cache.surveys)) cache.surveys = [freshDefault()];
  cache.consent ??= { ...DEFAULT_CONSENT, editedAt: null };
  // 손대지 않은 옛 판 기본 설문(예시 문항, 응답 전)은 새 판(추천 초안)으로 바꾼다. 응답이 시작된 설문은 그대로 둔다.
  const i = cache.surveys.findIndex((x) => x.id === DEFAULT_SURVEY_ID);
  const old = cache.surveys[i];
  if (old && old.example && !old.lockedAt && old.defaultVersion !== DEFAULT_SURVEY_VERSION) {
    cache.surveys[i] = freshDefault();
    writeJson(STORAGE_KEY, cache);
  }
  return cache;
}

export const saveSurveyData = () => writeJson(STORAGE_KEY, getSurveyData());

export const listSurveys = () => getSurveyData().surveys;
export const findSurvey = (id) => getSurveyData().surveys.find((s) => s.id === id) ?? (id === DEFAULT_SURVEY_ID ? DEFAULT_SURVEY : null);
export const consentDoc = () => getSurveyData().consent;

export function createSurvey(title = '새 설문') {
  const survey = {
    id: newId('survey'), title, intro: DEFAULT_SURVEY.intro, questions: [], createdAt: now(), lockedAt: null,
    instrument: {}, domains: SURVEY_DOMAINS.map((d) => ({ ...d })), scale: { points: 5, labels: [...SCALE_PRESETS[5]] },
  };
  getSurveyData().surveys.push(survey);
  saveSurveyData();
  return survey;
}

/** 복사해서 새 설문 (잠긴 설문을 고쳐 쓰고 싶을 때) */
export function copySurvey(id) {
  const from = findSurvey(id);
  if (!from) return null;
  const survey = { ...JSON.parse(JSON.stringify(from)), id: newId('survey'), title: `${from.title} (복사본)`, createdAt: now(), lockedAt: null, example: false, defaultVersion: undefined };
  getSurveyData().surveys.push(survey);
  saveSurveyData();
  return survey;
}

/** 잠기지 않은 설문만 고친다 */
export function updateSurvey(id, patch) {
  const survey = getSurveyData().surveys.find((s) => s.id === id);
  if (!survey || survey.lockedAt) return false;
  Object.assign(survey, patch, { example: false });
  return saveSurveyData();
}

/** 잠기지 않은 설문만 지운다(세션이 쓰고 있으면 화면에서 막는다) */
export function removeSurvey(id) {
  const data = getSurveyData();
  const survey = data.surveys.find((s) => s.id === id);
  if (!survey || survey.lockedAt) return false;
  data.surveys = data.surveys.filter((s) => s.id !== id);
  return saveSurveyData();
}

/** 학생이 응답을 시작하면 잠근다 */
export function lockSurvey(id) {
  const survey = getSurveyData().surveys.find((s) => s.id === id);
  if (!survey || survey.lockedAt) return;
  survey.lockedAt = now();
  saveSurveyData();
}

export function saveConsent({ title, body }) {
  const consent = getSurveyData().consent;
  const changed = consent.body !== body || consent.title !== title;
  Object.assign(consent, { title, body, editedAt: now() });
  // 내용이 바뀌면 판을 올려, 학생이 어느 판에 동의했는지 남는다
  if (changed) consent.version = `consent-${Date.now().toString(36)}`;
  return saveSurveyData();
}

export const newQuestionId = () => newId('q');
