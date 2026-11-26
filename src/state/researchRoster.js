// 교사 화면용 연구 기록 모음: 이 브라우저 학생의 기록 + (켜면) 예시 학생 기록
// 채점 대상 = 학생 × 명제 × 채점하는 단계(1 나의 증명, 2 AI 증명, 4 최종 증명). 제출한 단계만 채점한다.
// TODO: 서버 연결 뒤에는 학급 학생들의 기록을 서버에서 불러온다(교사 권한 확인 후).

import { GRADED_STAGES } from '../data/rubric.js';
import { sampleResearchStudents } from '../data/sampleResearch.js';
import { getProblem } from '../data/problems/index.js';
import { hasInk } from './inkModel.js';
import { getResearch } from './researchStore.js';

export const LOCAL_STUDENT_ID = 'local';

export function researchStudents({ includeSamples = true } = {}) {
  const local = { id: LOCAL_STUDENT_ID, pseudonym: '이 브라우저 학생', sample: false, record: getResearch() };
  return includeSamples ? [local, ...sampleResearchStudents()] : [local];
}

export const targetKey = (studentId, stage, problemId) => `${studentId}~${stage}~${problemId}`;

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
          reading: item.inkReading?.[def.field] ?? null,
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
