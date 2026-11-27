// 계정·역할·가입 승인·연결표·연구 윤리 설정 (로드맵 3단계 화면 프로토타입, 브라우저에만 임시 보관)
// 사용자 결정(2026-11-27, docs/data-spec.md):
//   로그인은 구글 계정. 처음 한 번 정보를 입력한다(학생: 학년도·학번·이름, 일반인: 이름·소속·가입 이유).
//   관리자가 올린 학생 명단과 맞는 학생은 바로 승인되고, 나머지와 일반인은 관리자가 승인한다.
//   역할: 관리자(가입 승인·연결표·연구 윤리 설정, 교사 일도 함), 교사(학급·세션·채점·분석), 학생, 일반인.
//   증명 연습은 승인되면 바로 쓰고, AI와 탐구하기는 교사가 준 세션 코드를 입력해야 한다(일반인도 코드가 있으면 가능,
//   일반인의 탐구 기록은 연구 분석에서 기본으로 빠짐).
//   실명 ↔ 연구 번호 연결표는 서버에 두고 관리자만 보고 내려받고 지운다.
// 프로토타입: 구글 로그인 대신 이메일을 입력해 로그인을 흉내 내고, 처음 로그인한 계정을 관리자로 만든다.
// TODO(로드맵 4단계 Firebase): Firebase Auth(Google 제공자)로 바꾸고, 사용자 문서는 users/{uid}(본인과 관리자만),
//   연결 정보(이름·학번·이메일)는 따로 links/{uid}(관리자만)로 나눈다. 역할은 관리자만 쓰는 사용자 지정 클레임으로 둔다.
//
// 기록 구조 (저장 키 checkyourprove.prototype.accounts.v1)
//   { users: [user], currentUid, roster: [{ year, studentNo, name, addedAt }], ethics }
//   user = { uid, email, role: 'admin'|'teacher'|'student'|'guest', status: 'profile'|'pending'|'approved'|'rejected',
//            profile: { kind: 'student', year, studentNo, name } | { kind: 'guest', name, affiliation, reason } | null,
//            researchId(가명 연구 번호), sessionIds: [세션 id], guardianConsent(보호자 연구 동의 받은 날짜) | null,
//            createdAt, submittedAt, approvedAt, approvedBy, autoApproved, unlinkedAt(연결 정보를 지운 시각) }
//   ethics = { irb: false, studyTitle, approvalNo, piName, piContact, irbContact, studyEnd('YYYY-MM-DD'), retentionYears: 3,
//              deleteBy('YYYY-MM-DD', IRB를 받지 않을 때 관리자가 정한 자료 삭제일) }

import { readJson, writeJson } from './storage.js';
import { getAdmin, logAction as logLocal } from './adminStore.js';
import { isFirebase } from './appMode.js';

// ── 서버 연결 (firebase 모드, 로드맵 4-1) ──
// 화면 코드는 그대로 두려고 함수 모양(동기)을 지킨다. 바꾸는 함수는 메모리 값을 먼저 바꾸고(화면이 바로 바뀜)
// 서버 함수(api/account.js)에 보낸다. 서버가 Firestore에 쓰면 firebase/accountSync.js가 onSnapshot으로 받아
// applyRemoteAccounts로 메모리 값을 바꾸고 'checkyourprove:accounts' 이벤트를 보낸다(라우터가 화면을 다시 그림).
// 서버가 거절하면 accountSync가 마지막 서버 값으로 되돌리고 오류를 알린다. 이 모드에서는 이 브라우저에 계정을 저장하지 않는다.
let backend = null;
/** firebase/accountSync.js가 연결한다: { call(action, payload), signIn(), signOut() } */
export function setAccountBackend(b) {
  backend = b;
}
const remote = (action, payload = {}) => backend?.call(action, payload);
/** 세션 코드로 들어가기(firebase 모드): 서버가 코드·열림·승인을 확인한다. 돌려줌 Promise<{ sessionId } | { error }> */
export const joinSessionByCode = (code) => (backend ? backend.join(code) : Promise.resolve({ error: '서버에 연결되지 않았어요.' }));
/** 구글 로그인(팝업, firebase 모드). 실패하면 오류를 던진다 */
export const signInWithGoogle = () => (backend ? backend.signIn() : Promise.reject(new Error('서버에 연결되지 않았어요.')));
/** 관리 기록: 서버 모드에서는 서버가 남긴다 */
const logAction = (...args) => {
  if (!isFirebase) logLocal(...args);
};

/** 관리 기록에 남길 "한 사람" */
const actor = () => {
  const u = currentUser();
  return u ? (u.profile?.name || u.email || u.researchId) : '미리보기';
};

const STORAGE_KEY = 'checkyourprove.prototype.accounts.v1';
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // 헷갈리는 0·O·1·I 뺌

export const ROLES = [
  { id: 'admin', label: '관리자' },
  { id: 'teacher', label: '교사' },
  { id: 'student', label: '학생' },
  { id: 'guest', label: '일반인' },
];
export const STATUS_LABELS = { profile: '정보 입력 전', pending: '승인 대기', approved: '승인됨', rejected: '거절됨' };
export const roleLabel = (id) => ROLES.find((r) => r.id === id)?.label ?? id;

export const DEFAULT_ETHICS = { irb: false, studyTitle: '', approvalNo: '', piName: '', piContact: '', irbContact: '', studyEnd: '', retentionYears: 3, deleteBy: '' };

let cache = null;
const now = () => new Date().toISOString();

function normalize(raw) {
  const d = raw && typeof raw === 'object' ? raw : {};
  return {
    users: Array.isArray(d.users) ? d.users.filter((u) => u && u.uid).map((u) => ({ sessionIds: [], ...u, sessionIds: Array.isArray(u.sessionIds) ? u.sessionIds : [] })) : [],
    currentUid: d.currentUid ?? null,
    roster: Array.isArray(d.roster) ? d.roster : [],
    ethics: { ...DEFAULT_ETHICS, ...(d.ethics ?? {}) },
  };
}

export function getAccounts() {
  cache ??= normalize(readJson(STORAGE_KEY, null));
  return cache;
}
const save = () => (isFirebase ? true : writeJson(STORAGE_KEY, getAccounts()));
export function resetAccountsCache() {
  cache = null;
}

/** 서버 값으로 바꾼다(firebase 모드). data = { users, currentUid, roster, ethics } */
export function applyRemoteAccounts(data) {
  cache = normalize(data);
  window.dispatchEvent(new window.CustomEvent('checkyourprove:accounts'));
}

const randomCode = (n) => Array.from({ length: n }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');

/** 가명 연구 번호 (예: R-7K3Q), 겹치지 않게 */
function newResearchId() {
  const used = new Set(getAccounts().users.map((u) => u.researchId));
  let id;
  do id = `R-${randomCode(4)}`; while (used.has(id));
  return id;
}

export const currentUser = () => {
  const d = getAccounts();
  return d.users.find((u) => u.uid === d.currentUid) ?? null;
};
export const findUser = (uid) => getAccounts().users.find((u) => u.uid === uid) ?? null;
export const isApproved = (u) => u?.status === 'approved';
export const canTeach = (u) => isApproved(u) && (u.role === 'admin' || u.role === 'teacher');
export const isAdmin = (u) => isApproved(u) && u.role === 'admin';

/** 이름 (화면 표시용) */
export const displayName = (u) => u?.profile?.name || u?.email || '이름 없음';

// ── 로그인 (시연) ──

/** 구글 로그인 흉내: 이메일로 계정을 찾거나 만든다. 처음 만든 계정은 관리자. */
export function signInDemo(email) {
  if (isFirebase) return null;
  const d = getAccounts();
  const clean = String(email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return null;
  let user = d.users.find((u) => u.email === clean);
  if (!user) {
    const first = d.users.length === 0;
    user = {
      uid: `u-${Date.now().toString(36)}${randomCode(3).toLowerCase()}`,
      email: clean,
      role: first ? 'admin' : 'student',
      status: first ? 'approved' : 'profile',
      profile: first ? { kind: 'guest', name: '관리자', affiliation: '', reason: '처음 로그인한 계정(관리자)' } : null,
      researchId: newResearchId(),
      sessionIds: [],
      guardianConsent: null,
      createdAt: now(),
      approvedAt: first ? now() : null,
      approvedBy: first ? 'first-login' : null,
    };
    d.users.push(user);
  }
  d.currentUid = user.uid;
  save();
  return user;
}

/** 시연용 역할 계정 (서버 연결 전에만 쓴다. 로그인 화면의 "학생/교사/관리자로 보기") */
export const DEMO_ACCOUNTS = {
  student: { email: 'demo-student@demo.local', role: 'student', profile: { kind: 'student', year: new Date().getFullYear(), studentNo: '10101', name: '시연 학생' } },
  teacher: { email: 'demo-teacher@demo.local', role: 'teacher', profile: { kind: 'guest', name: '시연 교사', affiliation: '시연', reason: '시연용 교사 계정' } },
  admin: { email: 'demo-admin@demo.local', role: 'admin', profile: { kind: 'guest', name: '시연 관리자', affiliation: '시연', reason: '시연용 관리자 계정' } },
};

/** 시연용 역할로 로그인 (승인된 계정을 만들거나 찾는다) */
export function signInDemoRole(role) {
  const demo = DEMO_ACCOUNTS[role];
  if (!demo || isFirebase) return null;
  const d = getAccounts();
  let user = d.users.find((u) => u.email === demo.email);
  if (!user) {
    user = {
      uid: `u-demo-${role}`, email: demo.email, role: demo.role, status: 'approved', profile: { ...demo.profile },
      researchId: newResearchId(), sessionIds: [], guardianConsent: null, createdAt: now(), submittedAt: now(), approvedAt: now(), approvedBy: 'demo', demo: true,
    };
    d.users.push(user);
  }
  user.role = demo.role;
  user.status = 'approved';
  d.currentUid = user.uid;
  save();
  return user;
}

export function signOut() {
  getAccounts().currentUid = null;
  if (isFirebase) return backend?.signOut();
  save();
}

// ── 가입 정보와 승인 ──

const norm = (s) => String(s ?? '').replace(/\s+/g, '').trim();
/** 명단에서 같은 학년도·학번·이름 찾기 */
export const rosterMatch = (p) => getAccounts().roster.find((r) => String(r.year) === String(p.year) && norm(r.studentNo) === norm(p.studentNo) && norm(r.name) === norm(p.name)) ?? null;

/**
 * 처음 정보 입력(또는 승인 대기 중 고치기). 학생이 명단과 맞으면 바로 승인.
 * 돌려줌: 'approved' | 'pending' | null(입력 오류)
 */
export function submitProfile(uid, profile) {
  const u = findUser(uid);
  if (!u) return null;
  const p = profile.kind === 'student'
    ? { kind: 'student', year: Number(profile.year), studentNo: norm(profile.studentNo), name: String(profile.name ?? '').trim() }
    : { kind: 'guest', name: String(profile.name ?? '').trim(), affiliation: String(profile.affiliation ?? '').trim(), reason: String(profile.reason ?? '').trim() };
  if (!p.name || (p.kind === 'student' && (!p.year || !/^\d{4,6}$/.test(p.studentNo))) || (p.kind === 'guest' && (!p.affiliation || !p.reason))) return null;
  // 가입 규칙(관리자 설정): 일반인 가입을 받지 않으면 거절
  if (p.kind === 'guest' && !getAdmin().signup.allowGuests && u.role !== 'admin' && u.role !== 'teacher') return null;
  u.profile = p;
  u.submittedAt = now();
  if (u.role !== 'admin' && u.role !== 'teacher') u.role = p.kind === 'student' ? 'student' : 'guest';
  if (isFirebase) {
    // 명단은 관리자만 보므로 판단은 서버가 한다. 바로 승인되면 서버 값이 곧 들어온다.
    if (u.status !== 'approved') u.status = 'pending';
    remote('profile', { profile: p });
    return u.status;
  }
  if (p.kind === 'student' && getAdmin().signup.rosterAutoApprove && rosterMatch(p)) {
    Object.assign(u, { status: 'approved', approvedAt: now(), approvedBy: 'roster', autoApproved: true });
  } else if (u.status !== 'approved') {
    u.status = 'pending';
  }
  save();
  return u.status;
}

export function approveUsers(uids, by = currentUser()?.uid ?? 'admin') {
  uids.forEach((uid) => {
    const u = findUser(uid);
    if (u && u.profile) Object.assign(u, { status: 'approved', approvedAt: now(), approvedBy: by, autoApproved: false });
  });
  if (uids.length) logAction('가입 승인', uids.map((id) => findUser(id)?.researchId).join(', '), actor());
  if (uids.length) remote('approve', { uids });
  return save();
}

export function rejectUser(uid) {
  const u = findUser(uid);
  if (u) {
    u.status = 'rejected';
    logAction('가입 거절', u.researchId, actor());
    remote('reject', { uid });
  }
  return save();
}

export function setRole(uid, role) {
  const u = findUser(uid);
  if (!u || !ROLES.some((r) => r.id === role)) return false;
  // 관리자는 한 명 이상 남아야 한다
  if (u.role === 'admin' && role !== 'admin' && getAccounts().users.filter((x) => x.role === 'admin').length === 1) return false;
  const before = u.role;
  u.role = role;
  logAction('역할 변경', `${u.researchId} ${roleLabel(before)} → ${roleLabel(role)}`, actor());
  remote('setRole', { uid, role });
  return save();
}

export function setGuardianConsent(uid, date) {
  const u = findUser(uid);
  if (u) u.guardianConsent = date || null;
  remote('guardianConsent', { uid, date: date || null });
  return save();
}

// ── 학생 명단 ──

/**
 * 명단 붙여넣기: 한 줄에 한 학생 "학년도, 학번, 이름"(탭·쉼표·공백). 학년도를 빼면 defaultYear.
 * 돌려줌: { added, skipped, approved(명단과 맞아 승인된 대기 학생 수) }
 */
export function addRoster(text, defaultYear) {
  const d = getAccounts();
  let added = 0;
  let skipped = 0;
  String(text ?? '').split(/\r?\n/).forEach((line) => {
    const cells = line.split(/[\t,\s]+/).map((c) => c.trim()).filter(Boolean);
    if (!cells.length) return;
    let year = defaultYear;
    if (/^\d{4}$/.test(cells[0]) && cells.length >= 3) year = Number(cells.shift());
    const [studentNo, ...nameParts] = cells;
    const name = nameParts.join('');
    if (!/^\d{4,6}$/.test(studentNo ?? '') || !name) {
      skipped += 1;
      return;
    }
    if (d.roster.some((r) => String(r.year) === String(year) && r.studentNo === studentNo)) {
      skipped += 1;
      return;
    }
    d.roster.push({ year: Number(year), studentNo, name, addedAt: now() });
    added += 1;
  });
  if (added) logAction('학생 명단 더함', `${added}명`, actor());
  // 이미 승인 대기 중인 학생 중 명단과 맞는 학생은 승인(명단 자동 승인을 켰을 때)
  let approved = 0;
  if (getAdmin().signup.rosterAutoApprove) d.users.filter((u) => u.status === 'pending' && u.profile?.kind === 'student' && rosterMatch(u.profile)).forEach((u) => {
    Object.assign(u, { status: 'approved', approvedAt: now(), approvedBy: 'roster', autoApproved: true });
    approved += 1;
  });
  // 서버 모드: 명단 확인과 승인은 서버가 다시 한다(화면의 수는 미리 계산한 값)
  if (added) remote('addRoster', { text, defaultYear });
  save();
  return { added, skipped, approved };
}

export function removeRosterEntry(year, studentNo) {
  const d = getAccounts();
  d.roster = d.roster.filter((r) => !(String(r.year) === String(year) && r.studentNo === studentNo));
  remote('removeRoster', { year, studentNo });
  return save();
}

// ── 세션 참여 ──

export function joinSession(uid, sessionId) {
  const u = findUser(uid);
  if (!u) return false;
  if (!u.sessionIds.includes(sessionId)) {
    u.sessionIds.push(sessionId);
    remote('joinSession', { sessionId });
  }
  return save();
}

/** 이 세션에 들어온 사용자 */
export const sessionMembers = (sessionId) => getAccounts().users.filter((u) => u.sessionIds.includes(sessionId));

// ── 연결표 (실명 ↔ 연구 번호) ──

/** 연결 정보(이름·학번·소속·이메일)를 지운다. 연구 번호와 기록은 남는다. */
export function unlinkUser(uid) {
  const u = findUser(uid);
  if (!u) return false;
  u.profile = u.profile ? { kind: u.profile.kind, name: '', ...(u.profile.kind === 'student' ? { year: u.profile.year, studentNo: '' } : { affiliation: '', reason: '' }) } : null;
  u.email = '';
  u.unlinkedAt = now();
  logAction('연결 정보 지움', u.researchId, actor());
  if (!unlinkingAll) remote('unlink', { uid });
  return save();
}

let unlinkingAll = false;
export function unlinkAll() {
  unlinkingAll = true;
  getAccounts().users.filter((u) => u.role === 'student' || u.role === 'guest').forEach((u) => unlinkUser(u.uid));
  unlinkingAll = false;
  remote('unlinkAll');
  return save();
}

const csvCell = (v) => {
  if (v == null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** 연결표 CSV (관리자만, Excel용 UTF-8 BOM) */
export function linkTableCsv(sessionLabelOf) {
  const head = ['연구 번호', '구분', '역할', '상태', '이름', '학년도', '학번', '소속', '가입 이유', '이메일', '참여 세션', '보호자 동의', '가입', '승인', '연결 지움'];
  const rows = getAccounts().users.map((u) => [
    u.researchId, u.profile?.kind === 'student' ? '학생' : u.profile ? '일반인' : '', roleLabel(u.role), STATUS_LABELS[u.status],
    u.profile?.name, u.profile?.year, u.profile?.studentNo, u.profile?.affiliation, u.profile?.reason, u.email,
    u.sessionIds.map(sessionLabelOf).join(';'), u.guardianConsent, u.createdAt, u.approvedAt, u.unlinkedAt,
  ]);
  return `﻿${[head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')}`;
}

// ── 연구 윤리 설정 ──

export const ethics = () => getAccounts().ethics;

export function saveEthics(patch) {
  Object.assign(getAccounts().ethics, patch);
  remote('saveEthics', { patch });
  return save();
}

/** 연구 자료 삭제 예정일: IRB면 연구 종료일 + 보존 연수, 아니면 관리자가 정한 날 */
export function dataDeleteDate(e = ethics()) {
  if (e.irb) {
    if (!e.studyEnd) return '';
    const d = new Date(`${e.studyEnd}T00:00:00`);
    d.setFullYear(d.getFullYear() + Number(e.retentionYears || 3));
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  return e.deleteBy || '';
}
