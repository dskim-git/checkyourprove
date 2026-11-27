// 연구 설문과 연구 동의 기본값 (구현 4, 구현 7에서 추천 초안과 평가도구 기능)
// 기본 설문은 연구 질문 2·3(증명 능력, AI 리터러시)에 맞춘 "추천 초안"이다(2026-11-27, 사용자 요청: 나중에 선행 논문의
// 평가도구로 바꿀 수 있게). 교사는 설문마다 평가도구 정보, 하위 요인(영역), 척도 점수(4~7점)와 끝말을 정하고,
// 문항을 한꺼번에 붙여넣어 만들 수 있다(views/teacher/surveyEditView.js).

/** 기본 하위 요인 (설문에 domains가 없으면 이것을 쓴다) */
export const SURVEY_DOMAINS = [
  { id: 'concept', label: '증명 개념 이해' },
  { id: 'ability', label: '수학 능력' },
  { id: 'ai', label: 'AI 리터러시' },
];

export const QUESTION_TYPES = [
  { id: 'scale', label: '척도' },
  { id: 'choice', label: '객관식' },
  { id: 'short', label: '단답' },
  { id: 'long', label: '서술형' },
];

/** 척도 점수별 기본 선택지 글 (교사가 설문마다 고칠 수 있다) */
export const SCALE_PRESETS = {
  4: ['전혀 그렇지 않다', '그렇지 않다', '그렇다', '매우 그렇다'],
  5: ['전혀 그렇지 않다', '그렇지 않다', '보통이다', '그렇다', '매우 그렇다'],
  6: ['전혀 그렇지 않다', '그렇지 않다', '약간 그렇지 않다', '약간 그렇다', '그렇다', '매우 그렇다'],
  7: ['전혀 그렇지 않다', '그렇지 않다', '약간 그렇지 않다', '보통이다', '약간 그렇다', '그렇다', '매우 그렇다'],
};
export const SCALE_POINTS = [4, 5, 6, 7];

/** 5점 척도 선택지 (1~5). 설문마다 다를 수 있으니 화면에서는 surveyScale(survey).labels를 쓴다. */
export const SCALE_LABELS = SCALE_PRESETS[5];

/** 설문의 하위 요인 목록 */
export const surveyDomains = (survey) => (Array.isArray(survey?.domains) && survey.domains.length ? survey.domains : SURVEY_DOMAINS);

/** 설문의 척도 { points, labels } (labels 길이 = points) */
export function surveyScale(survey) {
  const points = SCALE_POINTS.includes(Number(survey?.scale?.points)) ? Number(survey.scale.points) : 5;
  const given = Array.isArray(survey?.scale?.labels) ? survey.scale.labels : [];
  const labels = SCALE_PRESETS[points].map((d, i) => String(given[i] ?? '').trim() || d);
  return { points, labels };
}

/** 역문항 점수 바꾸기: (척도 점수 + 1) − 응답 */
export const reverseScore = (survey, v) => surveyScale(survey).points + 1 - Number(v);

/** 평가도구 정보 입력 칸 */
export const INSTRUMENT_FIELDS = [
  { id: 'name', label: '평가도구 이름', placeholder: '예: 증명 이해 검사지, AI 리터러시 척도' },
  { id: 'citation', label: '출처 (저자, 연도, 논문·학술지)', placeholder: '예: 홍길동(2024). ○○ 척도 개발. 수학교육학연구, 34(2), 1-20.', long: true },
  { id: 'reliability', label: '신뢰도·타당도', placeholder: '예: 전체 Cronbach α = .89, 하위 요인 .78~.86' },
  { id: 'adaptation', label: '고친 내용', placeholder: '예: 고등학생에 맞게 표현을 바꿈, 7점 척도를 5점으로 바꿈', long: true },
  { id: 'permission', label: '사용 허락', placeholder: '예: 2026-12-01 저자에게 전자우편으로 사용 허락 받음' },
];

export const DEFAULT_SURVEY_ID = 'survey-default';
/** 기본 설문 판 (문항을 바꾸면 올린다. 저장된 기본 설문이 손대지 않은 옛 판이면 새 판으로 바꾼다) */
export const DEFAULT_SURVEY_VERSION = 'draft-2';

const sc = (id, domain, text, reverse = false) => ({ id, domain, type: 'scale', text, ...(reverse ? { reverse: true } : {}) });

export const DEFAULT_SURVEY = {
  id: DEFAULT_SURVEY_ID,
  title: '증명과 AI에 대한 생각 (추천 초안)',
  intro: '정답이 있는 시험이 아닙니다. 지금 내 생각과 가장 가까운 것을 고르세요. 응답은 연구에만 쓰이고 성적과 관계없습니다.',
  example: true,
  defaultVersion: DEFAULT_SURVEY_VERSION,
  instrument: {
    name: '연구자 제작 추천 초안 (검증 전)',
    citation: '',
    reliability: '',
    adaptation: '선행 논문의 평가도구를 찾으면 이 설문을 복사하거나 새 설문을 만들어 바꿉니다.',
    permission: '',
  },
  domains: SURVEY_DOMAINS.map((d) => ({ ...d })),
  scale: { points: 5, labels: [...SCALE_PRESETS[5]] },
  questions: [
    sc('c1', 'concept', '증명은 명제가 모든 경우에 참임을 논리적으로 보이는 과정이다.'),
    sc('c2', 'concept', '몇 개의 수를 넣어서 성립하면 그 명제는 증명된 것이다.', true),
    sc('c3', 'concept', '증명의 각 줄에는 가정이나 앞의 줄에서 나온 근거가 있어야 한다.'),
    sc('c4', 'concept', '명제와 그 대우의 참과 거짓이 항상 같은 이유를 설명할 수 있다.'),
    sc('c5', 'concept', '귀류법에서 결론을 부정하는 가정으로 시작하는 이유를 설명할 수 있다.'),
    sc('c6', 'concept', '증명에서 문자의 범위(자연수, 정수 등)를 밝혀야 하는 이유를 안다.'),
    { id: 'c7', domain: 'concept', type: 'choice', text: '명제가 참임을 보이는 가장 알맞은 방법은 무엇인가요?', options: ['여러 수를 넣어 확인한다', '문자를 써서 모든 경우를 보인다', '선생님이나 책에 나온 답을 따른다', '잘 모르겠다'] },
    sc('a1', 'ability', '처음 보는 명제도 스스로 증명을 시작할 수 있다.'),
    sc('a2', 'ability', '명제에 알맞은 증명법(직접증명, 대우, 귀류법)을 고를 수 있다.'),
    sc('a3', 'ability', '증명에 필요한 식을 문자로 세우고 정리할 수 있다.'),
    sc('a4', 'ability', '내가 쓴 증명에서 빠진 근거나 잘못된 곳을 찾을 수 있다.'),
    sc('a5', 'ability', '다른 사람(또는 AI)이 쓴 증명이 맞는지 판단할 수 있다.'),
    sc('a6', 'ability', '증명을 쓰는 것이 어렵고 부담스럽다.', true),
    sc('i1', 'ai', 'AI가 쓴 수학 풀이나 증명에도 오류가 있을 수 있다.'),
    sc('i2', 'ai', 'AI의 답을 받아들이기 전에 근거와 계산을 직접 확인한다.'),
    sc('i3', 'ai', 'AI는 앞의 말에 이어질 그럴듯한 낱말을 확률에 따라 골라 답을 만든다는 것을 안다.'),
    sc('i4', 'ai', '같은 질문에도 AI의 답이 달라질 수 있는 이유를 설명할 수 있다.'),
    sc('i5', 'ai', '질문을 나누어 구체적으로 물으면 AI에게서 더 도움이 되는 답을 얻을 수 있다.'),
    sc('i6', 'ai', 'AI가 자신 있게 말하면 그 답은 대체로 맞다.', true),
    sc('i7', 'ai', 'AI의 답을 내 생각과 비교해 필요한 부분만 골라 쓸 수 있다.'),
    sc('i8', 'ai', '수학 과제에 AI를 쓸 때 지켜야 할 약속(내가 먼저 생각하기, AI에게서 가져온 부분 밝히기 등)을 안다.'),
    { id: 'i9', domain: 'ai', type: 'long', text: '수학 공부에 AI를 쓰는 것에 대한 내 생각을 자유롭게 쓰세요. 없으면 "없음"이라고 쓰세요.' },
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
    '동의한 뒤에도 언제든지 이 화면에서 참여를 그만둘 수 있습니다. 그만두면 그 뒤의 기록은 연구에 쓰지 않고, 그전에 모은 자료는 연구에 사용합니다.',
  ].join('\n'),
};
