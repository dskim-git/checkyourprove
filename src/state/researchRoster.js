// 교사 화면용 연구 기록 모음: 세션마다 이 브라우저 학생의 기록 + (켜면) 예시 학생 기록
// sessionIds를 주면 그 세션들의 학생만 모은다(연구 분석·채점·태그 화면의 "포함할 세션"). 학생마다 session을 붙인다.
// 채점 대상 = 학생 × 명제 × 채점하는 단계(1 나의 증명, 2 AI 증명, 4 최종 증명). 제출한 단계만 채점한다.
// TODO: 서버 연결 뒤에는 학급 학생들의 기록을 서버에서 불러온다(교사 권한 확인 후).

import { GRADED_STAGES } from '../data/rubric.js';
import { sampleResearchStudents } from '../data/sampleResearch.js';
import { getProblem } from '../data/problems/index.js';
import { hasInk } from './inkModel.js';
import { readingEditOf } from './gradingStore.js';
import { findUser, sessionMembers } from './accountStore.js';
import { getResearch, sessionRecords } from './researchStore.js';
import { isFirebase } from './appMode.js';
import { findSession, getSessions, localStudentId, sessionLabel } from './sessionStore.js';

export const LOCAL_STUDENT_ID = 'local';

/** 예시 학생 01~03은 "예시 1반 1회차", 04~06은 "예시 2반 1회차" */
const sampleSessionOf = (index) => findSession(index < 3 ? 'sample-s1' : 'sample-s2');

export function researchStudents({ includeSamples = true, sessionIds = null } = {}) {
  const inScope = (session) => !sessionIds || sessionIds.includes(session.id);
  if (isFirebase) return [...serverStudents(inScope), ...samplesIn(includeSamples, inScope)];
  // 세션 코드로 들어온 계정이 있으면 이름 대신 연구 번호로 보인다(로드맵 3단계). 일반인(guest)은 연구 분석에서 기본으로 뺀다.
  const locals = getSessions().sessions.filter(inScope).map((session) => {
    const member = sessionMembers(session.id).find((u) => u.role === 'student' || u.role === 'guest');
    return {
      id: localStudentId(session),
      pseudonym: member ? `${member.researchId} (${sessionLabel(session)})` : `이 브라우저 학생 (${sessionLabel(session)})`,
      researchId: member?.researchId ?? null,
      guest: member?.role === 'guest',
      sample: false,
      session,
      record: getResearch(session.id),
    };
  });
  return [...locals, ...samplesIn(includeSamples, inScope)];
}

const samplesIn = (includeSamples, inScope) => (includeSamples
  ? sampleResearchStudents().map((s, i) => ({ ...s, session: sampleSessionOf(i) })).filter((s) => inScope(s.session))
  : []);

/** 서버 모드(4-2): 담당 세션마다 학생 기록(학생 id = uid, 이름 대신 연구 번호). 교사·관리자의 미리보기 기록은 뺀다. */
function serverStudents(inScope) {
  return getSessions().sessions.filter(inScope).flatMap((session) => [...sessionRecords(session.id)]
    .map(([uid, record]) => ({ uid, record, user: findUser(uid) }))
    .filter(({ user }) => !user || user.role === 'student' || user.role === 'guest')
    .map(({ uid, record, user }) => ({
      id: uid,
      pseudonym: `${user?.researchId ?? '연구 번호 확인 중'} (${sessionLabel(session)})`,
      researchId: user?.researchId ?? null,
      guest: user?.role === 'guest',
      sample: false,
      session,
      record,
    })));
}

export const targetKey = (studentId, stage, problemId) => `${studentId}~${stage}~${problemId}`;

/** 채점·분석에 쓸 "AI가 읽은 글": 교사가 고친 글이 있으면 그것(edited에 고친 기록), 없으면 AI가 읽은 글 */
export function readingFor(studentId, stage, problemId, item, field) {
  const orig = item?.inkReading?.[field] ?? null;
  const edit = readingEditOf(targetKey(studentId, stage, problemId));
  if (!edit) return orig;
  return { ...(orig ?? {}), text: edit.text, edited: edit };
}

export function parseTargetKey(key) {
  const [studentId, stage, problemId] = String(key).split('~');
  return { studentId, stage: Number(stage), problemId };
}

/** 채점 대상 목록 (학생 순, 명제 순, 단계 순) */
export function gradingTargets(students) {
  const targets = [];
  students.forEach((student) => {
    const ids = student.record.propositionIds ?? [];
    GRADED_STAGES.forEach((def) => {
      const stage = student.record.stages?.[String(def.n)];
      if (!stage?.submittedAt) return;
      ids.forEach((problemId, propIndex) => {
        const item = stage.items?.[problemId];
        if (!item) return;
        targets.push({
          key: targetKey(student.id, def.n, problemId),
          student,
          stage: def.n,
          stageDef: def,
          problemId,
          problem: getProblem(problemId),
          propIndex,
          item,
          text: item[def.field] ?? '',
          ink: item.ink?.[def.field] ?? null,
          reading: readingFor(student.id, def.n, problemId, item, def.field),
        });
      });
    });
  });
  return targets;
}

export function findTarget(students, key) {
  return gradingTargets(students).find((t) => t.key === key) ?? null;
}

/** 대상이 쓴 증명이 있는가(글 또는 필기) */
export const targetWritten = (t) => String(t.text).trim().length > 0 || hasInk(t.ink);

/** 대화 key = '학생 id~명제 id' */
export const conversationKey = (studentId, problemId) => `${studentId}~${problemId}`;

/** 2단계 AI 대화 목록 (메시지가 있는 것만, 제출 전 대화도 포함) */
export function conversations(students) {
  const list = [];
  students.forEach((student) => {
    const stage = student.record.stages?.['2'];
    (student.record.propositionIds ?? []).forEach((problemId, propIndex) => {
      const item = stage?.items?.[problemId];
      const messages = item?.chat?.messages ?? [];
      if (!messages.length) return;
      list.push({ key: conversationKey(student.id, problemId), student, problemId, problem: getProblem(problemId), propIndex, item, messages, submitted: Boolean(stage.submittedAt) });
    });
  });
  return list;
}

/** 같은 학생·명제의 다른 단계 기록 */
export const itemAt = (student, stage, problemId) => student.record.stages?.[String(stage)]?.items?.[problemId] ?? null;
