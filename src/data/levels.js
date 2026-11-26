// 증명 연습 활동 단계 (쉬운 단계부터)
// 이전 단계를 인증해야 다음 단계가 열린다. 인증 기준(통과해야 하는 명제 수)은 수업 설정에서 정한다.

// 테스트 버전: true이면 인증과 관계없이 모든 활동 단계를 자유롭게 오갈 수 있다(인증 기록은 그대로 쌓인다).
// TODO: 학생에게 실제로 배포하기 전에 false로 바꾸고, 잠금 판단은 서버에서도 확인한다.
export const TEST_FREE_NAVIGATION = true;

export const SOLO_PASS_SCORE = 80;
export const REVEAL_AFTER_TRIES = 3;

export const LEVELS = [
  {
    id: 'choose-blanks',
    title: '빈칸 고르기 (객관식)',
    short: '고르기',
    summary: '거의 완성된 증명의 빈칸에 들어갈 식이나 말을 보기에서 고릅니다.',
    passRule: '정답 보기를 쓰지 않고 모든 빈칸을 맞히면 통과',
    usesAi: false,
  },
  {
    id: 'fill-blanks',
    title: '빈칸 채우기',
    short: '채우기',
    summary: '거의 완성된 증명의 빈칸에 들어갈 식이나 말을 직접 써 넣습니다.',
    passRule: '정답 보기를 쓰지 않고 모든 빈칸을 맞히면 통과',
    usesAi: false,
  },
  {
    id: 'order-steps',
    title: '증명 순서 맞추기',
    short: '순서',
    summary: '뒤섞여 있는 증명의 단계를 올바른 순서로 배열합니다.',
    passRule: '정답 보기를 쓰지 않고 순서를 모두 맞히면 통과',
    usesAi: false,
  },
  {
    id: 'fill-steps',
    title: '빠진 단계 채우기',
    short: '빠진 단계',
    summary: '증명 중간에 비어 있는 두 단계를 앞뒤 흐름을 보고 직접 씁니다.',
    passRule: '예시 보기를 쓰지 않고 AI 점검에서 두 단계 모두 통과하면 통과(핵심이 드러나면 표현이 달라도 인정)',
    usesAi: true,
  },
  {
    id: 'step-by-step',
    title: 'AI와 한 단계씩 증명하기',
    short: '한 단계씩',
    summary: '증명을 한 단계씩 쓰고 AI와 점검합니다. 맞으면 쌓이고, 틀리면 고칠 방향을 안내받습니다.',
    passRule: '예시 보기를 쓰지 않고 모든 단계를 완성하면 통과',
    usesAi: true,
  },
  {
    id: 'ai-coach',
    title: 'AI 코치',
    short: 'AI 코치',
    summary: '내 증명을 먼저 완성하고, AI 코치의 피드백을 받아 고치기를 반복해 증명을 완성합니다.',
    passRule: 'AI 코치가 보완할 점이 없다고 확인하면 통과',
    usesAi: true,
  },
  {
    id: 'solo',
    title: '나 혼자 증명하기',
    short: '혼자',
    summary: '도움 없이 증명을 완성해 제출하면 AI가 채점해 점수로 알려 줍니다. 스스로 보는 시험입니다.',
    passRule: `${SOLO_PASS_SCORE}점 이상이면 통과`,
    usesAi: true,
  },
];

export function getLevel(id) {
  return LEVELS.find((level) => level.id === id) ?? null;
}

export function levelIndex(id) {
  return LEVELS.findIndex((level) => level.id === id);
}
