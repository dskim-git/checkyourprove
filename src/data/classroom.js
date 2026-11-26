// 예시 수업 설정 (기본값)
// TODO: Firebase 연동 후에는 교사가 저장한 수업 문서에서 읽어 오고, 변경은 교사 권한을 서버에서 확인한 뒤에만 허용한다.

export const DEFAULT_CLASSROOM = {
  id: 'demo-class',
  name: '2학년 3반 수학 (예시 수업)',
  studentName: '예시 학생',
  // 증명 연습: 한 활동 단계를 인증하려면 통과해야 하는 명제 수
  requiredClears: 2,
  // 시연용: 모든 활동 단계를 잠금 없이 연다
  unlockAll: false,
  // AI와 탐구하기(연구 모드)
  researchOpen: true,
  researchProblemId: 'contradiction-sqrt2',
  // 오류가 포함된 AI 증명 제공은 기본값으로 꺼져 있으며, 아직 구현하지 않았다.
  flawedAiProofEnabled: false,
};
