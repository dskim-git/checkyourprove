// 계정 서버 함수 (로드맵 4-1, docs/data-spec.md 1·2절과 10절)
// POST /api/account  { action, ...값 }  (Authorization: Bearer <Firebase ID 토큰>)
//
// 계정·역할·명단·연결표·연구 윤리 설정·가입 규칙은 모두 이 함수만 쓴다(보안 규칙에서 브라우저 쓰기를 막음).
// 역할은 승인된 사용자에게만 사용자 지정 클레임 { role }으로 붙인다. 승인 전·거절은 클레임 없음 → 보안 규칙에서 권한 없음.
//
// Firestore 구조
//   users/{uid}       { role, status, kind, researchId, sessionIds, createdAt, submittedAt, approvedAt, approvedBy, autoApproved, unlinkedAt }
//   links/{uid}       { email, profile, guardianConsent }  ← 실명 연결 정보, 관리자(와 본인)만 읽음
//   roster/{학년도-학번} { year, studentNo, name, addedAt }
//   researchIds/{연구 번호} { uid }  ← 연구 번호가 겹치지 않게
//   settings/ethics, settings/signup
//   audit/{자동}       { at, action, detail, by }  ← 관리 기록(서버만 씀)

import { adminAuth, db, fieldValue, handler, HttpError } from './_lib/server.js';

const ROLES = ['admin', 'teacher', 'student', 'guest'];
const ROLE_LABEL = { admin: '관리자', teacher: '교사', student: '학생', guest: '일반인' };
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const SIGNUP_DEFAULTS = { rosterAutoApprove: true, allowGuests: true };
const ETHICS_KEYS = { irb: 'boolean', studyTitle: 'string', approvalNo: 'string', piName: 'string', piContact: 'string', irbContact: 'string', studyEnd: 'string', retentionYears: 'number', deleteBy: 'string' };

const now = () => new Date().toISOString();
const norm = (s) => String(s ?? '').replace(/\s+/g, '').trim();
const adminEmails = () => String(process.env.ADMIN_EMAILS ?? '').split(/[,\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
const randomCode = (n) => Array.from({ length: n }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
const rosterId = (year, studentNo) => `${Number(year)}-${norm(studentNo)}`;

const users = () => db().collection('users');
const links = () => db().collection('links');

async function audit(action, detail, by) {
  await db().collection('audit').add({ at: now(), action, detail: String(detail ?? ''), by: by ?? '' });
}

async function signupRules() {
  const snap = await db().doc('settings/signup').get();
  return { ...SIGNUP_DEFAULTS, ...(snap.exists ? snap.data() : {}) };
}

/** 승인된 사용자만 클레임 { role }, 나머지는 클레임 없음. 바뀌었으면 true */
async function syncClaims(uid, user) {
  const want = user.status === 'approved' && ROLES.includes(user.role) ? { role: user.role } : {};
  const record = await adminAuth().getUser(uid);
  const have = record.customClaims ?? {};
  if ((have.role ?? null) === (want.role ?? null)) return false;
  await adminAuth().setCustomUserClaims(uid, want);
  return true;
}

/** 겹치지 않는 연구 번호를 잡는다 (예: R-7K3Q) */
async function claimResearchId(uid) {
  for (let i = 0; i < 20; i += 1) {
    const id = `R-${randomCode(4)}`;
    try {
      await db().doc(`researchIds/${id}`).create({ uid, at: now() });
      return id;
    } catch {
      // 이미 있음 → 다시
    }
  }
  throw new Error('연구 번호를 만들지 못했어요.');
}

function cleanProfile(p) {
  if (p?.kind === 'student') {
    const out = { kind: 'student', year: Number(p.year), studentNo: norm(p.studentNo), name: String(p.name ?? '').trim().slice(0, 40) };
    if (!out.name || !out.year || !/^\d{4,6}$/.test(out.studentNo)) return null;
    return out;
  }
  const out = { kind: 'guest', name: String(p?.name ?? '').trim().slice(0, 40), affiliation: String(p?.affiliation ?? '').trim().slice(0, 80), reason: String(p?.reason ?? '').trim().slice(0, 300) };
  if (!out.name || !out.affiliation || !out.reason) return null;
  return out;
}

async function rosterMatch(p) {
  if (p?.kind !== 'student') return false;
  const snap = await db().doc(`roster/${rosterId(p.year, p.studentNo)}`).get();
  return snap.exists && norm(snap.data().name) === norm(p.name);
}

async function getUser(uid) {
  const snap = await users().doc(uid).get();
  if (!snap.exists) throw new HttpError(404, '그런 사용자가 없어요.');
  return snap.data();
}

// ── 본인 ──

/** 로그인할 때마다: 사용자 문서가 없으면 만들고, ADMIN_EMAILS면 관리자로, 클레임을 맞춘다 */
async function bootstrap({ token }) {
  const { uid } = token;
  const email = String(token.email ?? '').toLowerCase();
  const ref = users().doc(uid);
  let user = (await ref.get()).data();
  if (!user) {
    user = { role: 'student', status: 'profile', kind: null, researchId: await claimResearchId(uid), sessionIds: [], createdAt: now(), submittedAt: null, approvedAt: null, approvedBy: null, autoApproved: false, unlinkedAt: null };
    await ref.set(user);
    await links().doc(uid).set({ email, profile: null, guardianConsent: null });
  }
  if (token.email_verified && adminEmails().includes(email) && (user.role !== 'admin' || user.status !== 'approved')) {
    user = { ...user, role: 'admin', status: 'approved', kind: user.kind ?? 'guest', approvedAt: now(), approvedBy: 'ADMIN_EMAILS' };
    await ref.set(user);
    const link = (await links().doc(uid).get()).data() ?? {};
    if (!link.profile) await links().doc(uid).set({ email, profile: { kind: 'guest', name: token.name || '관리자', affiliation: '', reason: '관리자(ADMIN_EMAILS)' }, guardianConsent: null }, { merge: true });
    await audit('관리자 지정', user.researchId, 'ADMIN_EMAILS');
  }
  const claimsChanged = await syncClaims(uid, user);
  return { ok: true, claimsChanged };
}

/** 처음 정보 입력(또는 승인 대기 중 고치기). 명단과 맞는 학생은 바로 승인 */
async function submitProfile({ token, body }) {
  const { uid } = token;
  const user = await getUser(uid);
  const p = cleanProfile(body.profile);
  if (!p) throw new HttpError(400, body.profile?.kind === 'student' ? '학년도, 학번(숫자 4~6자리), 이름을 모두 입력하세요.' : '입력하지 않은 칸이 있어요.');
  const rules = await signupRules();
  const staff = user.role === 'admin' || user.role === 'teacher';
  if (p.kind === 'guest' && !rules.allowGuests && !staff) throw new HttpError(400, '지금은 일반인 가입을 받지 않아요.');
  if (user.status === 'rejected') throw new HttpError(403, '가입이 승인되지 않았어요. 관리자에게 문의해 주세요.');
  const next = { ...user, kind: p.kind, submittedAt: now() };
  if (!staff) next.role = p.kind === 'student' ? 'student' : 'guest';
  if (next.status !== 'approved') {
    if (rules.rosterAutoApprove && await rosterMatch(p)) Object.assign(next, { status: 'approved', approvedAt: now(), approvedBy: 'roster', autoApproved: true });
    else next.status = 'pending';
  }
  await users().doc(uid).set(next);
  await links().doc(uid).set({ email: String(token.email ?? '').toLowerCase(), profile: p }, { merge: true });
  const claimsChanged = await syncClaims(uid, next);
  return { ok: true, status: next.status, claimsChanged };
}

/** 세션 참여 기록. TODO(4-2): 세션 문서가 서버로 옮겨지면 세션 코드를 여기서 확인한다 */
async function joinSession({ token, body }) {
  const id = String(body.sessionId ?? '');
  if (!/^[\w-]{1,64}$/.test(id)) throw new HttpError(400, '세션을 알 수 없어요.');
  const user = await getUser(token.uid);
  if (user.status !== 'approved') throw new HttpError(403, '승인된 뒤에 세션에 들어갈 수 있어요.');
  await users().doc(token.uid).update({ sessionIds: fieldValue().arrayUnion(id) });
  return { ok: true };
}

// ── 관리자 ──

async function requireAdmin(token) {
  if (token.role !== 'admin') throw new HttpError(403, '관리자만 할 수 있어요.');
  const me = await getUser(token.uid);
  if (me.role !== 'admin' || me.status !== 'approved') throw new HttpError(403, '관리자만 할 수 있어요.');
  return me;
}

async function approve(me, uids) {
  const done = [];
  for (const uid of uids.slice(0, 500)) {
    const snap = await users().doc(uid).get();
    if (!snap.exists) continue;
    const u = snap.data();
    if (!u.kind) continue; // 정보를 입력하지 않음
    const next = { ...u, status: 'approved', approvedAt: now(), approvedBy: me.researchId, autoApproved: false };
    await users().doc(uid).set(next);
    await syncClaims(uid, next);
    done.push(u.researchId);
  }
  if (done.length) await audit('가입 승인', done.join(', '), me.researchId);
  return done.length;
}

/** 명단 붙여넣기: 한 줄에 "학년도, 학번, 이름"(학년도를 빼면 defaultYear). 기다리던 학생 중 맞는 학생은 승인 */
async function addRoster(me, text, defaultYear) {
  let added = 0;
  let skipped = 0;
  const batch = db().batch();
  const seen = new Set();
  for (const line of String(text ?? '').split(/\r?\n/).slice(0, 2000)) {
    const cells = line.split(/[\t,\s]+/).map((c) => c.trim()).filter(Boolean);
    if (!cells.length) continue;
    let year = Number(defaultYear);
    if (/^\d{4}$/.test(cells[0]) && cells.length >= 3) year = Number(cells.shift());
    const [studentNo, ...nameParts] = cells;
    const name = nameParts.join('');
    const id = rosterId(year, studentNo);
    if (!/^\d{4,6}$/.test(studentNo ?? '') || !name || !year || seen.has(id) || (await db().doc(`roster/${id}`).get()).exists) {
      skipped += 1;
      continue;
    }
    seen.add(id);
    batch.set(db().doc(`roster/${id}`), { year, studentNo, name, addedAt: now() });
    added += 1;
  }
  if (added) {
    await batch.commit();
    await audit('학생 명단 더함', `${added}명`, me.researchId);
  }
  let approved = 0;
  if ((await signupRules()).rosterAutoApprove) {
    const pending = await users().where('status', '==', 'pending').get();
    for (const d of pending.docs) {
      const link = (await links().doc(d.id).get()).data();
      if (await rosterMatch(link?.profile)) {
        const next = { ...d.data(), status: 'approved', approvedAt: now(), approvedBy: 'roster', autoApproved: true };
        await users().doc(d.id).set(next);
        await syncClaims(d.id, next);
        approved += 1;
      }
    }
  }
  return { added, skipped, approved };
}

async function unlink(me, uid) {
  const u = await getUser(uid);
  const link = (await links().doc(uid).get()).data() ?? {};
  const p = link.profile;
  const blank = p ? { kind: p.kind, name: '', ...(p.kind === 'student' ? { year: p.year, studentNo: '' } : { affiliation: '', reason: '' }) } : null;
  await links().doc(uid).set({ email: '', profile: blank }, { merge: true });
  await users().doc(uid).update({ unlinkedAt: now() });
  return u.researchId;
}

async function adminAction(action, { token, body }) {
  const me = await requireAdmin(token);
  switch (action) {
    case 'approve':
      return { ok: true, approved: await approve(me, Array.isArray(body.uids) ? body.uids.map(String) : []) };
    case 'reject': {
      const uid = String(body.uid);
      const u = await getUser(uid);
      const next = { ...u, status: 'rejected' };
      await users().doc(uid).set(next);
      await syncClaims(uid, next);
      await audit('가입 거절', u.researchId, me.researchId);
      return { ok: true };
    }
    case 'setRole': {
      const uid = String(body.uid);
      const role = String(body.role);
      if (!ROLES.includes(role)) throw new HttpError(400, '그런 역할이 없어요.');
      const u = await getUser(uid);
      if (u.role === 'admin' && role !== 'admin') {
        const admins = await users().where('role', '==', 'admin').get();
        if (admins.size <= 1) throw new HttpError(400, '관리자는 한 명 이상 있어야 합니다.');
      }
      const next = { ...u, role };
      await users().doc(uid).set(next);
      await syncClaims(uid, next);
      await audit('역할 변경', `${u.researchId} ${ROLE_LABEL[u.role]} → ${ROLE_LABEL[role]}`, me.researchId);
      return { ok: true };
    }
    case 'addRoster':
      return { ok: true, ...(await addRoster(me, body.text, body.defaultYear)) };
    case 'removeRoster':
      await db().doc(`roster/${rosterId(body.year, body.studentNo)}`).delete();
      await audit('학생 명단 지움', `${Number(body.year)} ${norm(body.studentNo)}`, me.researchId);
      return { ok: true };
    case 'unlink': {
      const rid = await unlink(me, String(body.uid));
      await audit('연결 정보 지움', rid, me.researchId);
      return { ok: true };
    }
    case 'unlinkAll': {
      const all = await users().where('role', 'in', ['student', 'guest']).get();
      for (const d of all.docs) await unlink(me, d.id);
      await audit('연결 정보 모두 지움', `${all.size}명`, me.researchId);
      return { ok: true, count: all.size };
    }
    case 'guardianConsent': {
      const date = body.date ? String(body.date).slice(0, 10) : null;
      if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, '날짜 형식이 달라요.');
      await links().doc(String(body.uid)).set({ guardianConsent: date }, { merge: true });
      return { ok: true };
    }
    case 'saveEthics': {
      const patch = {};
      Object.entries(body.patch ?? {}).forEach(([k, v]) => {
        if (ETHICS_KEYS[k] === typeof v) patch[k] = typeof v === 'string' ? v.slice(0, 500) : v;
      });
      await db().doc('settings/ethics').set(patch, { merge: true });
      await audit('연구 윤리 설정', Object.keys(patch).join(', '), me.researchId);
      return { ok: true };
    }
    case 'saveSignup': {
      const patch = {};
      ['rosterAutoApprove', 'allowGuests'].forEach((k) => { if (typeof body.patch?.[k] === 'boolean') patch[k] = body.patch[k]; });
      await db().doc('settings/signup').set(patch, { merge: true });
      await audit('가입 규칙', Object.entries(patch).map(([k, v]) => `${k}=${v}`).join(', '), me.researchId);
      return { ok: true };
    }
    default:
      throw new HttpError(400, '알 수 없는 요청이에요.');
  }
}

export default handler(async ({ body, token }) => {
  const action = String(body.action ?? '');
  if (action === 'bootstrap') return bootstrap({ token });
  if (action === 'profile') return submitProfile({ token, body });
  if (action === 'joinSession') return joinSession({ token, body });
  return adminAction(action, { token, body });
});
