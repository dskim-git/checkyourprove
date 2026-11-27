// 관리자 설정 (설정 정리 작업, 2026-11-27 사용자 결정): 연습 모드 기본값, 가입 규칙, 공지, 문의처, 개인정보 요청, 관리 기록
// 프로토타입: 이 브라우저에만 임시 보관. TODO(Firebase): settings/admin 문서(관리자만 쓰기, 공지·문의처는 모두 읽기),
//   requests/{id}(본인 쓰기, 관리자 읽기·처리), audit/{id}(서버만 쓰기, 관리자 읽기).
//
// 기록 구조 (저장 키 checkyourprove.prototype.admin.v1)
//   { practice: { requiredClears, revealAfterTries, soloPassScore, practiceAi, unlockAll },
//     signup: { rosterAutoApprove, allowGuests },
//     contact: { name, email, note },
//     notices: [{ id, title, body, audience: 'all'|'students'|'teachers', until('YYYY-MM-DD'|''), createdAt, by }],
//     requests: [{ id, uid, researchId, type: 'delete-records'|'delete-account', reason, at, status: 'open'|'done', note, doneAt }],
//     audit: [{ at, by, action, detail }] }

import { readJson, writeJson } from './storage.js';

const STORAGE_KEY = 'checkyourprove.prototype.admin.v1';

/** 증명 연습 기본값 (관리자가 정하고, 교사는 학급마다 바꿀 수 있다) */
export const PRACTICE_DEFAULTS = { requiredClears: 2, revealAfterTries: 3, soloPassScore: 80, practiceAi: true, unlockAll: false };

export const PRACTICE_FIELDS = [
  { id: 'requiredClears', label: '활동 단계 인증 기준', help: '한 활동 단계에서 이만큼 명제를 통과하면 인증되고 다음 단계가 열립니다.', type: 'number', min: 1, max: 8, unit: '개' },
  { id: 'revealAfterTries', label: '정답·예시 보기가 나오는 시도 횟수', help: '이 횟수만큼 시도하면 "정답 보기"(빈칸·순서)와 "예시 보기"(단계 쓰기) 버튼이 나옵니다. 보면 그 시도는 통과로 인정하지 않습니다.', type: 'number', min: 1, max: 10, unit: '번' },
  { id: 'soloPassScore', label: '혼자 증명하기 통과 점수', help: 'AI 채점 점수가 이 점수 이상이면 통과입니다.', type: 'number', min: 50, max: 100, unit: '점' },
  { id: 'practiceAi', label: '증명 연습에서 AI 쓰기', help: '끄면 AI 점검·코치·채점을 쓰는 활동(빈 단계 채우기, 단계별로 쌓기, AI 코치와 증명하기, 혼자 증명하기)이 잠깁니다. 연구 기간에 연습 모드 AI를 끌 때 씁니다.', type: 'bool' },
  { id: 'unlockAll', label: '모든 활동 단계 열기', help: '인증하지 않아도 모든 활동을 고를 수 있습니다(시연·수업 진행용).', type: 'bool' },
];

export const NOTICE_AUDIENCES = [
  { id: 'all', label: '모두' },
  { id: 'students', label: '학생·일반인' },
  { id: 'teachers', label: '교사·관리자' },
];

export const REQUEST_TYPES = [
  { id: 'delete-records', label: '내 기록 삭제 요청' },
  { id: 'delete-account', label: '계정 삭제(탈퇴) 요청' },
];

const DEFAULTS = () => ({
  practice: { ...PRACTICE_DEFAULTS },
  signup: { rosterAutoApprove: true, allowGuests: true },
  contact: { name: '', email: '', note: '' },
  notices: [],
  requests: [],
  audit: [],
});

let cache = null;
const now = () => new Date().toISOString();
const newId = (p) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export function getAdmin() {
  if (!cache) {
    const raw = readJson(STORAGE_KEY, {}) ?? {};
    const d = DEFAULTS();
    cache = {
      practice: { ...d.practice, ...(raw.practice ?? {}) },
      signup: { ...d.signup, ...(raw.signup ?? {}) },
      contact: { ...d.contact, ...(raw.contact ?? {}) },
      notices: Array.isArray(raw.notices) ? raw.notices : [],
      requests: Array.isArray(raw.requests) ? raw.requests : [],
      audit: Array.isArray(raw.audit) ? raw.audit : [],
    };
  }
  return cache;
}
const save = () => writeJson(STORAGE_KEY, getAdmin());
export function resetAdminCache() {
  cache = null;
}

// ── 관리 기록 ──

/** 중요한 관리 작업을 기록한다(누가, 언제, 무엇을). by는 화면에서 넘긴 사람 이름 또는 이메일 */
export function logAction(action, detail = '', by = '') {
  const d = getAdmin();
  d.audit.unshift({ at: now(), by, action, detail });
  if (d.audit.length > 500) d.audit.length = 500;
  save();
}

// ── 연습 기본값·가입 규칙·문의처 ──

export function savePracticeDefaults(patch, by) {
  Object.assign(getAdmin().practice, patch);
  save();
  logAction('연습 기본값 변경', Object.entries(patch).map(([k, v]) => `${k}=${v}`).join(', '), by);
}

export function saveSignupRules(patch, by) {
  Object.assign(getAdmin().signup, patch);
  save();
  logAction('가입 규칙 변경', Object.entries(patch).map(([k, v]) => `${k}=${v}`).join(', '), by);
}

export function saveContact(patch) {
  Object.assign(getAdmin().contact, patch);
  return save();
}

// ── 공지 ──

const today = () => new Date().toISOString().slice(0, 10);

export function addNotice({ title, body, audience = 'all', until = '' }, by) {
  const n = { id: newId('n'), title: String(title).trim(), body: String(body ?? '').trim(), audience, until, createdAt: now(), by };
  getAdmin().notices.unshift(n);
  save();
  logAction('공지 올림', n.title, by);
  return n;
}

export function removeNotice(id, by) {
  const d = getAdmin();
  const n = d.notices.find((x) => x.id === id);
  d.notices = d.notices.filter((x) => x.id !== id);
  save();
  if (n) logAction('공지 내림', n.title, by);
}

/** 지금 보여 줄 공지 (역할에 맞고 기한이 지나지 않은 것). role: 'student'|'guest'|'teacher'|'admin'|null(로그인 안 함 → 모두) */
export function activeNotices(role) {
  const group = role === 'teacher' || role === 'admin' ? 'teachers' : role ? 'students' : null;
  return getAdmin().notices.filter((n) => (!n.until || n.until >= today()) && (n.audience === 'all' || !group || n.audience === group));
}

// ── 개인정보 요청 ──

export function addRequest({ uid, researchId, type, reason }) {
  const r = { id: newId('rq'), uid, researchId, type, reason: String(reason ?? '').trim(), at: now(), status: 'open', note: '', doneAt: null };
  getAdmin().requests.unshift(r);
  save();
  return r;
}

export const requestsOf = (uid) => getAdmin().requests.filter((r) => r.uid === uid);

export function closeRequest(id, note, by) {
  const r = getAdmin().requests.find((x) => x.id === id);
  if (!r) return false;
  Object.assign(r, { status: 'done', note: String(note ?? '').trim(), doneAt: now() });
  save();
  logAction('개인정보 요청 처리', `${r.researchId} ${REQUEST_TYPES.find((t) => t.id === r.type)?.label ?? r.type}${r.note ? `: ${r.note}` : ''}`, by);
  return true;
}

const csvCell = (v) => {
  if (v == null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function auditCsv() {
  const rows = [['시각', '한 사람', '작업', '내용'], ...getAdmin().audit.map((a) => [a.at, a.by, a.action, a.detail])];
  return `﻿${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}`;
}
