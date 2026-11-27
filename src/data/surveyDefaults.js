// 연구 설문과 연구 동의 기본값 (구현 4) — AGENTS.md 5절 "설문"
// 문항은 아직 확정 전이다(구현 7에서 확정). 아래는 화면을 시험하기 위한 예시 문항이며 교사가 고치거나 지울 수 있다.

export const SURVEY_DOMAINS = [
  { id: 'concept', label: '증명 개념 이해' },
  { id: 'ability', label: '수학 능력' },
  { id: 'ai', label: 'AI 리터러시' },
];

export const QUESTION_TYPES = [
  { id: 'scale', label: '5점 척도' },
  { id: 'choice', label: '객관식' },
  { id: 'short', label: '단답' },
  { id: 'long', label: '서술형' },
];

/** 5점 척도 선택지 (1~5) */
export const SCALE_LABELS = ['전혀 그렇지 않다', '그렇지 않다', '보통이다', '그렇다', '매우 그렇다'];

export const DEFAULT_SURVEY_ID = 'survey-default';

export const DEFAULT_SURVEY = {
  id: DEFAULT_SURVEY_ID,
  title: '증명과 AI에 대한 생각 (예시 문항)',
  intro: '정답이 있는 시험이 아닙니다. 지금 내 생각과 가장 가까운 것을 고르세요. 응답은 연구에만 쓰이고 성적과 관계없습니다.',
  example: true,
  questions: [
    { id: 'q1', domain: 'concept', type: 'scale', text: '증명이 무엇인지 다른 사람에게 설명할 수 있다.' },
    { id: 'q2', domain: 'concept', type: 'scale', text: '몇 개의 수를 넣어 확인하는 것만으로는 증명이 되지 않는 이유를 안다.' },
    { id: 'q3', domain: 'concept', type: 'choice', text: '명제가 참임을 보이는 가장 알맞은 방법은 무엇인가요?', options: ['여러 수를 넣어 확인한다', '문자를 써서 모든 경우를 보인다', '선생님이나 책에 나온 답을 따른다', '잘 모르겠다'] },
    { id: 'q4', domain: 'ability', type: 'scale', text: '처음 보는 명제도 스스로 증명을 시작할 수 있다.' },
    { id: 'q5', domain: 'ability', type: 'scale', text: '대우나 귀류법 같은 증명법 중 알맞은 것을 고를 수 있다.' },
    { id: 'q6', domain: 'ability', type: 'scale', text: '증명을 쓰는 것이 어렵게 느껴진다.', reverse: true },
    { id: 'q7', domain: 'ai', type: 'scale', text: 'AI가 쓴 증명에도 오류가 있을 수 있다고 생각한다.' },
    { id: 'q8', domain: 'ai', type: 'scale', text: 'AI의 답을 그대로 믿기 전에 근거를 확인한다.' },
    { id: 'q9', domain: 'ai', type: 'scale', text: 'AI에게 질문을 잘 나누어 물으면 더 도움이 되는 답을 얻을 수 있다.' },
    { id: 'q10', domain: 'ai', type: 'long', text: '수학 공부에 AI를 쓰는 것에 대한 내 생각을 자유롭게 쓰세요. 없으면 "없음"이라고 쓰세요.' },
  ],
};

export const DEFAULT_CONSENT = {
  version: 'consent-proto-1',
  title: '연구 참여 동의',
  body: [
    '이 활동은 "AI와 함께 증명하기" 수업 연구의 일부입니다.',
    '활동에서 쓴 증명, AI와 나눈 대화, 설문 응답, 활동 시간 같은 기록을 연구에 사용합니다.',
    '연구 자료는 이름 대신 가명 번호로 다루고, 연구가 끝나면 정해진 기간 뒤에 지웁니다.',
    '참여하지 않아도 수업 활동은 똑같이 할 수 있고, 성적이나 평가에 불이익이 없습니다. 참여하지 않으면 내 기록은 연구에서 빠지고, 연구용 설문은 하지 않습니다.',
    '동의한 뒤에도 언제든지 이 화면에서 참여를 그만둘 수 있습니다.',
  ].join('\n'),
};
