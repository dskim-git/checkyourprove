// 연구 모드(AI와 탐구하기) 정의
// 증명 연습의 활동 단계는 levels.js에 따로 정의한다.
// TODO: 연구 모드의 화면 흐름은 다음 논의에서 다시 설계한다.

export const MODES = {
  research: {
    id: 'research',
    label: 'AI와 탐구하기',
    steps: ['초안 확정', 'AI 탐구', 'AI 증명', '비교·평가', '최종 증명', '반영 성찰'],
  },
};
