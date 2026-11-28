// 학급·세션 서버 함수 (로드맵 4-2, 2026-11-28 사용자 결정: 학급은 담당 교사만 보고 관리자는 모두, 진행 중 세션은 사람마다)
// POST /api/session  { action, ...값 }  (Authorization: Bearer <Firebase ID 토큰>)
//
// 학급·세션의 "구조"(만들기·지우기·이름·담당 교사·학급별 연습 설정·세션 코드·참여)는 이 함수만 쓴다.
// 세션의 진행 설정(연구 열기·단계·명제·동의·설문·원리 활동·코드 열기)은 담당 교사가 Firestore에 바로 쓴다(보안 규칙이 키를 제한).
//
// Firestore 구조
//   classes/{classId}             { name, kind('homeroom' 반 | 'other' 기타), year, grade, classNo, classKey, currentSessionId, teacherUids, practice, createdAt, createdBy }
//                                   반(homeroom)은 학년도·학년·반으로 만들고, 학번이 맞는 학생이 자동으로 배정된다(api/_lib/classes.js).
//                                   currentSessionId: 반의 진행 회차(교사가 "진행 중으로"). 세션의 isCurrent로 학생에게도 보인다.
//   sessions/{sessionId}          { classId, className, classPractice, teacherUids, round, open, propositionIds, stagesOpen,
//                                   consentRequired, surveyId, surveyPreOpen, surveyPostOpen, principleOpen, code, codeOpen, createdAt }
//                                   (학급 이름·연습 설정·담당 교사는 학생이 학급 문서를 읽지 않아도 되게 세션에도 복사한다)
//   sessions/{id}/members/{uid}    { researchId, role, joinedAt }  ← 세션 코드로 들어온 사람(서버만 씀)
//   sessions/{id}/records/{uid}    학생 연구 기록(본인 씀, 담당 교사 읽음), 필기는 records/{uid}/ink/{단계~명제~칸}
//   sessionCodes/{코드}            { sessionId }  ← 코드가 겹치지 않게, 코드로 세션 찾기(서버만)

import { db, deleteRecordingFiles, fieldValue, handler, HttpError } from './_lib/server.js';
import { addClassStudentsToSession, assignWaitingStudents } from './_lib/classes.js';
import { homeroomKey, homeroomName } from '../src/data/studentNo.js';

const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const DEFAULT_PROPOSITIONS = ['research-cube-remainder', 'research-square-odd', 'research-coprime-odd']; // data/classroom.js와 같게
const SESSION_DEFAULTS = { consentRequired: true, surveyId: 'survey-default', surveyPreOpen: true, surveyPostOpen: true, principleOpen: true };
const PRACTICE_KEYS = { requiredClears: 'number', revealAfterTries: 'number', soloPassScore: 'number', practiceAi: 'boolean', unlockAll: 'boolean' };

const now = () => new Date().toISOString();
const cleanCode = (t) => String(t ?? '').toUpperCase().replace(/[\s-]/g, '');
const makeCode = () => Array.from({ length: 6 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
const classes = () => db().collection('classes');
const sessions = () => db().collection('sessions');

async function audit(action, detail, by) {
  await db().collection('audit').add({ at: now(), action, detail: String(detail ?? ''), by: by ?? '' });
}

async function me(token) {
  const snap = await db().doc(`users/${token.uid}`).get();
  if (!snap.exists) throw new HttpError(403, '계정 정보가 없어요. 다시 로그인해 주세요.');
  return snap.data();
}
const isStaff = (token) => token.role === 'admin' || token.role === 'teacher';

async function classFor(token, classId) {
  const snap = await classes().doc(String(classId)).get();
  if (!snap.exists) throw new HttpError(404, '그런 학급이 없어요.');
  const c = snap.data();
  if (token.role !== 'admin' && !(token.role === 'teacher' && c.teacherUids?.includes(token.uid))) throw new HttpError(403, '이 학급의 담당 교사만 할 수 있어요.');
  return { ref: snap.ref, data: c };
}

async function sessionFor(token, sessionId) {
  const snap = await sessions().doc(String(sessionId)).get();
  if (!snap.exists) throw new HttpError(404, '그런 세션이 없어요.');
  const s = snap.data();
  if (token.role !== 'admin' && !(token.role === 'teacher' && s.teacherUids?.includes(token.uid))) throw new HttpError(403, '이 세션의 담당 교사만 할 수 있어요.');
  return { ref: snap.ref, data: s };
}

/** 겹치지 않는 세션 코드를 잡는다 */
async function claimCode(sessionId) {
  for (let i = 0; i < 20; i += 1) {
    const code = makeCode();
    try {
      await db().doc(`sessionCodes/${code}`).create({ sessionId, at: now() });
      return code;
    } catch {
      // 이미 있음
    }
  }
  throw new Error('세션 코드를 만들지 못했어요.');
}

/** 학급의 세션들에 학급 값(이름·연습 설정·담당 교사)을 복사한다 */
async function copyToSessions(classId, patch) {
  const list = await sessions().where('classId', '==', classId).get();
  const batch = db().batch();
  list.docs.forEach((d) => batch.update(d.ref, patch));
  if (list.size) await batch.commit();
}

const cleanName = (name) => {
  const n = String(name ?? '').trim().slice(0, 40);
  if (!n) throw new HttpError(400, '학급 이름을 입력하세요.');
  return n;
};

/** 회차 하나를 학생 기록까지 지운다(교사 removeSession과 관리자 학급 지우기가 함께 씀) */
async function removeSessionDeep(ref, data) {
  const members = await ref.collection('members').get();
  for (const m of members.docs) {
    await db().doc(`users/${m.id}`).update({ sessionIds: fieldValue().arrayRemove(ref.id) }).catch(() => {});
  }
  const active = await db().collection('users').where('activeSessionId', '==', ref.id).get();
  for (const u of active.docs) await u.ref.update({ activeSessionId: null });
  if (data.code) await db().doc(`sessionCodes/${data.code}`).delete();
  const cdoc = await classes().doc(data.classId).get();
  if (cdoc.exists && cdoc.data().currentSessionId === ref.id) await cdoc.ref.update({ currentSessionId: null });
  await db().recursiveDelete(ref); // 녹음 정보(recordings)도 함께
  await deleteRecordingFiles(`recordings/${ref.id}/`); // 4-4: 녹음 파일
  return members.size;
}

/** 관리자 데이터 관리(2026-11-28 사용자 요청): 학급 고치기·지우기, 회차에서 학생 빼기, 학생 탐구 기록 지우기 */
async function adminAction(action, { token, body }) {
  if (token.role !== 'admin') throw new HttpError(403, '관리자만 할 수 있어요.');
  const who = (await me(token)).researchId;
  switch (action) {
    case 'adminEditClass': {
      const { ref, data: c } = await classFor(token, body.classId);
      if (c.kind === 'homeroom') {
        const year = Number(body.year);
        const grade = Number(body.grade);
        const classNo = Number(body.classNo);
        if (!(year > 2000 && year < 2100) || ![1, 2, 3].includes(grade) || !(Number.isInteger(classNo) && classNo >= 1 && classNo <= 99)) throw new HttpError(400, '학년도, 학년(1~3), 반을 바르게 고르세요.');
        const classKey = homeroomKey(year, grade, classNo);
        if (classKey !== c.classKey) {
          try {
            await db().doc(`classKeys/${classKey}`).create({ classId: ref.id, at: now() });
          } catch {
            throw new HttpError(400, `${year}학년도 ${homeroomName(grade, classNo)}은 이미 있어요.`);
          }
          if (c.classKey) await db().doc(`classKeys/${c.classKey}`).delete();
          // 예전 반 열쇠로 배정된 학생은 풀고, 새 반 열쇠의 학생을 배정한다(이미 들어간 회차와 기록은 그대로)
          const old = await db().collection('users').where('classId', '==', ref.id).get();
          for (const u of old.docs) await u.ref.update({ classId: null });
        }
        const name = homeroomName(grade, classNo);
        await ref.update({ year, grade, classNo, classKey, name });
        await copyToSessions(ref.id, { className: name });
        const assigned = classKey !== c.classKey ? await assignWaitingStudents(classKey) : 0;
        await audit('학급 고침', `${c.name} → ${year}학년도 ${name}`, who);
        return { ok: true, assigned };
      }
      const name = cleanName(body.name);
      await ref.update({ name });
      await copyToSessions(ref.id, { className: name });
      await audit('학급 고침', `${c.name} → ${name}`, who);
      return { ok: true };
    }
    case 'adminRemoveClass': {
      const { ref, data: c } = await classFor(token, body.classId);
      if (String(body.confirmName ?? '').trim() !== c.name) throw new HttpError(400, `확인을 위해 학급 이름 "${c.name}"을 그대로 입력하세요.`);
      const list = await sessions().where('classId', '==', ref.id).get();
      let students = 0;
      for (const s of list.docs) students += await removeSessionDeep(s.ref, s.data());
      if (c.classKey) await db().doc(`classKeys/${c.classKey}`).delete();
      const assigned = await db().collection('users').where('classId', '==', ref.id).get();
      for (const u of assigned.docs) await u.ref.update({ classId: null });
      await ref.delete();
      await audit('학급 지움', `${c.year ? `${c.year}학년도 ` : ''}${c.name} (회차 ${list.size}개, 참여 ${students}명의 기록 포함)`, who);
      return { ok: true };
    }
    case 'removeMember': {
      const { ref, data } = await sessionFor(token, body.sessionId);
      const uid = String(body.uid);
      const u = (await db().doc(`users/${uid}`).get()).data();
      await ref.collection('members').doc(uid).delete();
      if (u) await db().doc(`users/${uid}`).update({ sessionIds: fieldValue().arrayRemove(ref.id), ...(u.activeSessionId === ref.id ? { activeSessionId: null } : {}) });
      if (body.withRecord) await db().recursiveDelete(ref.collection('records').doc(uid));
      await audit('회차에서 학생 뺌', `${data.className} ${data.round}회차: ${u?.researchId ?? uid}${body.withRecord ? ' (기록 포함)' : ''}`, who);
      return { ok: true };
    }
    case 'deleteRecord': {
      const { ref, data } = await sessionFor(token, body.sessionId);
      const uid = String(body.uid);
      const u = (await db().doc(`users/${uid}`).get()).data();
      await db().recursiveDelete(ref.collection('records').doc(uid));
      await audit('학생 탐구 기록 지움', `${data.className} ${data.round}회차: ${u?.researchId ?? uid}`, who);
      return { ok: true };
    }
    default:
      return null;
  }
}

async function staffAction(action, { token, body }) {
  if (!isStaff(token)) throw new HttpError(403, '교사만 할 수 있어요.');
  const who = (await me(token)).researchId;
  switch (action) {
    case 'createClass': {
      const ref = classes().doc();
      const base = { teacherUids: [token.uid], practice: {}, currentSessionId: null, createdAt: now(), createdBy: token.uid };
      if (body.kind === 'homeroom') {
        const year = Number(body.year);
        const grade = Number(body.grade);
        const classNo = Number(body.classNo);
        if (!(year > 2000 && year < 2100) || ![1, 2, 3].includes(grade) || !(Number.isInteger(classNo) && classNo >= 1 && classNo <= 99)) throw new HttpError(400, '학년도, 학년(1~3), 반을 바르게 고르세요.');
        const classKey = homeroomKey(year, grade, classNo);
        try {
          await db().doc(`classKeys/${classKey}`).create({ classId: ref.id, at: now() });
        } catch {
          throw new HttpError(400, `${year}학년도 ${homeroomName(grade, classNo)}은 이미 있어요. 담당 교사에게 "담당 교사 바꾸기"로 넣어 달라고 하세요.`);
        }
        await ref.set({ ...base, kind: 'homeroom', year, grade, classNo, classKey, name: homeroomName(grade, classNo) });
        const assigned = await assignWaitingStudents(classKey);
        return { ok: true, classId: ref.id, assigned };
      }
      await ref.set({ ...base, kind: 'other', name: cleanName(body.name) });
      return { ok: true, classId: ref.id };
    }
    case 'renameClass': {
      const { ref, data: c0 } = await classFor(token, body.classId);
      if (c0.kind === 'homeroom') throw new HttpError(400, '반의 이름은 학년·반으로 정해져요.');
      const name = cleanName(body.name);
      await ref.update({ name });
      await copyToSessions(ref.id, { className: name });
      return { ok: true };
    }
    case 'removeClass': {
      const { ref, data: c0 } = await classFor(token, body.classId);
      const has = await sessions().where('classId', '==', ref.id).limit(1).get();
      if (!has.empty) throw new HttpError(400, '회차가 있는 학급은 지울 수 없어요. 회차를 먼저 지우세요.');
      if (c0.classKey) await db().doc(`classKeys/${c0.classKey}`).delete();
      const students = await db().collection('users').where('classId', '==', ref.id).get();
      for (const u of students.docs) await u.ref.update({ classId: null });
      await ref.delete();
      return { ok: true };
    }
    case 'setClassPractice': {
      const { ref, data } = await classFor(token, body.classId);
      const practice = { ...(data.practice ?? {}) };
      Object.entries(body.patch ?? {}).forEach(([k, v]) => {
        if (!(k in PRACTICE_KEYS)) return;
        if (v == null) delete practice[k];
        else if (typeof v === PRACTICE_KEYS[k]) practice[k] = v;
      });
      await ref.update({ practice });
      await copyToSessions(ref.id, { classPractice: practice });
      return { ok: true };
    }
    case 'setClassTeachers': {
      const { ref } = await classFor(token, body.classId);
      const uids = [...new Set((Array.isArray(body.uids) ? body.uids : []).map(String))].slice(0, 20);
      if (!uids.length) throw new HttpError(400, '담당 교사가 한 명 이상 있어야 해요.');
      const staff = await Promise.all(uids.map((u) => db().doc(`staff/${u}`).get()));
      if (staff.some((s) => !s.exists)) throw new HttpError(400, '교사·관리자만 담당 교사가 될 수 있어요.');
      await ref.update({ teacherUids: uids });
      await copyToSessions(ref.id, { teacherUids: uids });
      await audit('담당 교사 변경', `${ref.id}: ${uids.length}명`, who);
      return { ok: true };
    }
    case 'createSession': {
      const { ref: cref, data: c } = await classFor(token, body.classId);
      const same = await sessions().where('classId', '==', cref.id).get();
      const last = same.docs.map((d) => d.data()).sort((a, b) => a.round - b.round).at(-1);
      const sref = sessions().doc();
      const config = Object.fromEntries(Object.keys(SESSION_DEFAULTS).map((k) => [k, last?.[k] ?? SESSION_DEFAULTS[k]]));
      const data = {
        classId: cref.id, className: c.name, classPractice: c.practice ?? {}, teacherUids: c.teacherUids,
        round: same.docs.reduce((m, d) => Math.max(m, d.data().round ?? 0), 0) + 1,
        open: true, propositionIds: last?.propositionIds ?? DEFAULT_PROPOSITIONS, stagesOpen: [1], ...config,
        code: await claimCode(sref.id), codeOpen: true, createdAt: now(),
      };
      // 반의 첫 회차는 바로 진행 회차가 된다
      const first = !c.currentSessionId;
      await sref.set({ ...data, isCurrent: first });
      if (first) await cref.update({ currentSessionId: sref.id });
      await addClassStudentsToSession(cref.id, sref.id);
      return { ok: true, sessionId: sref.id };
    }
    case 'setCurrentSession': {
      // 반의 진행 회차: 반 학생들이 이 회차로 탐구한다
      const { ref, data } = await sessionFor(token, body.sessionId);
      const list = await sessions().where('classId', '==', data.classId).get();
      const batch = db().batch();
      list.docs.forEach((d) => batch.update(d.ref, { isCurrent: d.id === ref.id }));
      batch.update(classes().doc(data.classId), { currentSessionId: ref.id });
      await batch.commit();
      return { ok: true };
    }
    case 'regenerateCode': {
      const { ref, data } = await sessionFor(token, body.sessionId);
      const code = await claimCode(ref.id);
      await ref.update({ code });
      if (data.code) await db().doc(`sessionCodes/${data.code}`).delete();
      return { ok: true, code };
    }
    case 'removeSession': {
      const { ref, data } = await sessionFor(token, body.sessionId);
      const n = await removeSessionDeep(ref, data);
      await audit('세션 지움', `${data.className} ${data.round}회차 (학생 ${n}명의 기록 포함)`, who);
      return { ok: true };
    }
    case 'classPractice':
      return classPracticeBoard(token, body.classId);
    default:
      throw new HttpError(400, '알 수 없는 요청이에요.');
  }
}

// 교사 업무판의 증명 연습 현황(로드맵 6단계 메모, 2026-11-28 사용자 결정): 담당 학급 학생의 학번·이름과 연습 기록 요약.
// 이름·학번은 관리자만 읽는 links에 있어 서버가 담당 교사에게만 골라 준다. 연구 번호(연결표)는 관리자에게만 준다.
// 반은 배정된 학생(users.classId), 기타 학급은 회차에 들어온 학생·일반인. 연습 기록은 인증 계산에 필요한 칸만(답 내용 data는 빼고).
const ATTEMPT_FIELDS = ['levelId', 'problemId', 'method', 'status', 'score', 'passedAt', 'updatedAt'];
const BOARD_LIMIT = 300;

async function classPracticeBoard(token, classId) {
  const { ref, data: c } = await classFor(token, classId);
  let userDocs;
  if (c.kind === 'homeroom') {
    userDocs = (await db().collection('users').where('classId', '==', ref.id).get()).docs;
  } else {
    const list = await sessions().where('classId', '==', ref.id).get();
    const uids = new Set();
    for (const s of list.docs) (await s.ref.collection('members').get()).docs.forEach((m) => uids.add(m.id));
    const refs = [...uids].slice(0, BOARD_LIMIT).map((u) => db().doc(`users/${u}`));
    userDocs = refs.length ? (await db().getAll(...refs)).filter((d) => d.exists) : [];
  }
  const learners = userDocs
    .filter((d) => d.data().status === 'approved' && (d.data().role === 'student' || (c.kind !== 'homeroom' && d.data().role === 'guest')))
    .slice(0, BOARD_LIMIT);
  const linkDocs = learners.length ? await db().getAll(...learners.map((d) => db().doc(`links/${d.id}`))) : [];
  const admin = token.role === 'admin';
  const students = await Promise.all(learners.map(async (d, i) => {
    const u = d.data();
    const p = linkDocs[i]?.data()?.profile ?? null;
    const attempts = (await db().collection(`practice/${d.id}/attempts`).select(...ATTEMPT_FIELDS).get()).docs
      .map((a) => Object.fromEntries(ATTEMPT_FIELDS.map((k) => [k, a.get(k) ?? null])));
    return {
      kind: u.kind ?? (u.role === 'guest' ? 'guest' : 'student'),
      studentNo: p?.kind === 'student' ? String(p.studentNo ?? '') : '',
      name: String(p?.name ?? ''),
      unlinked: Boolean(u.unlinkedAt) || !p?.name,
      ...(admin ? { researchId: u.researchId ?? '' } : {}),
      attempts,
    };
  }));
  students.sort((a, b) => (a.studentNo || '99999').localeCompare(b.studentNo || '99999') || a.name.localeCompare(b.name, 'ko'));
  return { ok: true, classId: ref.id, students, at: now() };
}

/** 세션 코드로 들어가기: 승인된 사용자, 코드가 열려 있을 때 */
async function joinByCode({ token, body }) {
  const user = await me(token);
  if (user.status !== 'approved') throw new HttpError(403, '가입이 승인된 뒤에 들어올 수 있어요.');
  const code = cleanCode(body.code);
  const codeSnap = /^[A-Z2-9]{6}$/.test(code) ? await db().doc(`sessionCodes/${code}`).get() : null;
  if (!codeSnap?.exists) throw new HttpError(404, '그런 세션 코드가 없어요. 선생님이 알려 준 코드를 다시 확인해 주세요.');
  const sessionId = codeSnap.data().sessionId;
  const s = await sessions().doc(sessionId).get();
  if (!s.exists) throw new HttpError(404, '그런 세션 코드가 없어요. 선생님이 알려 준 코드를 다시 확인해 주세요.');
  if (s.data().codeOpen === false) throw new HttpError(403, '이 세션 코드는 지금 닫혀 있어요. 선생님께 여쭤보세요.');
  const mref = s.ref.collection('members').doc(token.uid);
  if (!(await mref.get()).exists) await mref.set({ researchId: user.researchId, role: user.role, joinedAt: now() });
  await db().doc(`users/${token.uid}`).update({ sessionIds: fieldValue().arrayUnion(sessionId), activeSessionId: sessionId });
  return { ok: true, sessionId };
}

export default handler(async ({ body, token }) => {
  const action = String(body.action ?? '');
  if (action === 'join') return joinByCode({ token, body });
  if (['adminEditClass', 'adminRemoveClass', 'removeMember', 'deleteRecord'].includes(action)) return adminAction(action, { token, body });
  return staffAction(action, { token, body });
});
