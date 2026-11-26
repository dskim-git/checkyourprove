// 교사 화면 미리보기용 예시 기록
// 모두 가상의 데이터이며 실제 학생 정보가 아니다. 학생은 가명 식별자로만 표시한다.

export const SAMPLE_ACTIVITY = [
  { pseudonym: '학생 01', certified: { direct: 4, contrapositive: 2, contradiction: 1, induction: 0 }, recent: { method: 'contradiction', levelId: 'order-steps', problemId: 'contradiction-sqrt2', result: '통과' }, lastActiveAt: '2026-11-20T09:18:00+09:00' },
  { pseudonym: '학생 02', certified: { direct: 2, contrapositive: 1, contradiction: 0, induction: 0 }, recent: { method: 'contrapositive', levelId: 'order-steps', problemId: 'contra-square-even', result: '진행 중' }, lastActiveAt: '2026-11-20T09:21:00+09:00' },
  { pseudonym: '학생 03', certified: { direct: 6, contrapositive: 3, contradiction: 2, induction: 1 }, recent: { method: 'direct', levelId: 'solo', problemId: 'direct-am-gm', result: '미통과 · 65점' }, lastActiveAt: '2026-11-20T09:24:00+09:00' },
  { pseudonym: '학생 04', certified: { direct: 1, contrapositive: 0, contradiction: 0, induction: 1 }, recent: { method: 'induction', levelId: 'fill-steps', problemId: 'induction-sum', result: '통과' }, lastActiveAt: '2026-11-20T10:05:00+09:00' },
  { pseudonym: '학생 05', certified: { direct: 0, contrapositive: 0, contradiction: 0, induction: 0 }, recent: { method: 'direct', levelId: 'fill-blanks', problemId: 'direct-odd-sum', result: '진행 중' }, lastActiveAt: '2026-11-20T10:02:00+09:00' },
];
