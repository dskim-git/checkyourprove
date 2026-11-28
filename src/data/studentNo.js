// 학번 해석 (2026-11-28 사용자 결정): 다섯 자리 = 학년 1자리 + 반 2자리 + 번호 2자리. 예: 10203 → 1학년 2반 3번
// 학년도와 함께 "반 열쇠"(학년도-학년-반)를 만들어, 교사가 만든 같은 반에 학생을 자동으로 배정한다(api/_lib/classes.js).
// 화면(가입·명단)과 서버 함수가 함께 쓴다. 브라우저 전용 기능을 쓰지 않는다.

export const STUDENT_NO_HELP = '학번은 다섯 자리예요(학년 1자리, 반 2자리, 번호 2자리). 예: 1학년 2반 3번 → 10203.';

/** '10203' → { grade: 1, classNo: 2, number: 3 }. 다섯 자리가 아니거나 학년 1~3, 반·번호 01 이상이 아니면 null */
export function parseStudentNo(value) {
  const s = String(value ?? '').replace(/\s+/g, '');
  if (!/^\d{5}$/.test(s)) return null;
  const grade = Number(s[0]);
  const classNo = Number(s.slice(1, 3));
  const number = Number(s.slice(3));
  if (grade < 1 || grade > 3 || classNo < 1 || number < 1) return null;
  return { grade, classNo, number };
}

/** '10203' → '1학년 2반 3번' (해석할 수 없으면 '') */
export function studentNoLabel(value) {
  const p = parseStudentNo(value);
  return p ? `${p.grade}학년 ${p.classNo}반 ${p.number}번` : '';
}

/** 반 열쇠 '2026-1-2' (학년도-학년-반). 해석할 수 없으면 null */
export function classKeyOf(year, studentNo) {
  const p = parseStudentNo(studentNo);
  const y = Number(year);
  return p && Number.isInteger(y) && y > 2000 ? `${y}-${p.grade}-${p.classNo}` : null;
}

/** 반 학급의 열쇠와 이름 */
export const homeroomKey = (year, grade, classNo) => `${Number(year)}-${Number(grade)}-${Number(classNo)}`;
export const homeroomName = (grade, classNo) => `${Number(grade)}학년 ${Number(classNo)}반`;
