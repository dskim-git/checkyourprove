// 반 자동 배정 (2026-11-28 사용자 결정): 학생의 학년도·학번(학년·반)이 교사가 만든 반과 같으면 그 반에 넣고,
// 반의 모든 회차에 세션 코드 없이 들어가게 한다(members, users.sessionIds). 반의 진행 회차는 세션의 isCurrent로 학생이 안다.
//   users/{uid}.classKey  '학년도-학년-반' (서버가 가입 정보에서 만듦), users/{uid}.classId  배정된 반
//   classKeys/{학년도-학년-반} = { classId }  (같은 반은 하나, 서버만)

import { db, fieldValue } from './server.js';
import { classKeyOf } from '../../src/data/studentNo.js';

const now = () => new Date().toISOString();

/** 가입 정보(links)에서 반 열쇠 */
export function classKeyFromProfile(profile) {
  return profile?.kind === 'student' ? classKeyOf(profile.year, profile.studentNo) : null;
}

/** 한 학생을 반에 넣는다(이미 들어가 있어도 됨). 승인된 학생이고 같은 반이 있을 때만. 넣었으면 반 id */
export async function assignToClass(uid) {
  const uref = db().doc(`users/${uid}`);
  const user = (await uref.get()).data();
  if (!user || user.status !== 'approved' || user.role !== 'student' || !user.classKey) return null;
  const key = (await db().doc(`classKeys/${user.classKey}`).get()).data();
  if (!key?.classId) return null;
  const sessions = await db().collection('sessions').where('classId', '==', key.classId).get();
  const batch = db().batch();
  sessions.docs.forEach((s) => batch.set(s.ref.collection('members').doc(uid), { researchId: user.researchId, role: user.role, joinedAt: now(), byClass: true }, { merge: true }));
  batch.update(uref, { classId: key.classId, ...(sessions.size ? { sessionIds: fieldValue().arrayUnion(...sessions.docs.map((s) => s.id)) } : {}) });
  await batch.commit();
  return key.classId;
}

/** 반의 학생 모두를 한 회차에 넣는다(새 회차를 만들 때) */
export async function addClassStudentsToSession(classId, sessionId) {
  const students = await db().collection('users').where('classId', '==', classId).get();
  const sref = db().doc(`sessions/${sessionId}`);
  const batch = db().batch();
  students.docs.filter((d) => d.data().status === 'approved' && d.data().role === 'student').forEach((d) => {
    batch.set(sref.collection('members').doc(d.id), { researchId: d.data().researchId, role: d.data().role, joinedAt: now(), byClass: true }, { merge: true });
    batch.update(d.ref, { sessionIds: fieldValue().arrayUnion(sessionId) });
  });
  await batch.commit();
  return students.size;
}

/** 반을 새로 만들었을 때: 같은 반 열쇠의 학생들을 모두 넣는다 */
export async function assignWaitingStudents(classKey) {
  const users = await db().collection('users').where('classKey', '==', classKey).get();
  let n = 0;
  for (const d of users.docs) if (await assignToClass(d.id)) n += 1;
  return n;
}
