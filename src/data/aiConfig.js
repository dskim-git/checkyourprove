// AI 연결 설정의 공용 값 (로드맵 5단계, 2026-11-29 사용자 결정). 화면과 서버 함수(api/ai.js)가 함께 쓴다. 브라우저 전용 기능을 쓰지 않는다.
// - 모델은 코드에 고정하지 않고 관리자 설정 > AI에서 용도별로 고른다(OpenRouter 모델 식별자). 아래는 처음 값일 뿐이다.
// - 연구용 모델은 회차를 만들 때 회차에 고정한다(장애 때만 대체 모델).
// - 요청 한도는 관리자가 정하고, 교사는 학급마다 관리자가 정한 최대치 안에서 바꾼다.

export const AI_USES = [
  { id: 'research', label: '연구용', desc: 'AI와 탐구하기 2단계 대화. 회차를 만들 때의 모델이 그 회차에 고정됩니다.' },
  { id: 'practice', label: '증명 연습용', desc: '빠진 단계 점검, AI 코치, 혼자 증명하기 채점(5-3에서 연결).' },
  { id: 'teacher', label: '교사 보조', desc: '채점 제안, 대화 태그 제안(5-4에서 연결).' },
  { id: 'flawed', label: '틀린 증명 만들기', desc: '연구용 고급 설정: 일부러 오류가 있는 AI 증명(아직 쓰지 않음).' },
  { id: 'advisor', label: '모델 상담 챗봇', desc: '관리자가 모델을 고를 때 상담하는 챗봇(5-2에서 연결).' },
];

export const AI_MODEL_DEFAULTS = {
  research: { model: 'anthropic/claude-sonnet-5.5', fallback: 'openai/gpt-6.2-sol' },
  practice: { model: 'anthropic/claude-haiku-5.5', fallback: 'openai/gpt-6-luna' },
  teacher: { model: 'anthropic/claude-haiku-5.5', fallback: 'openai/gpt-6-luna' },
  flawed: { model: 'anthropic/claude-sonnet-5.5', fallback: 'openai/gpt-6.2-sol' },
  advisor: { model: 'anthropic/claude-sonnet-5.5', fallback: 'openai/gpt-6.2-sol' },
};

export const AI_LIMIT_DEFAULTS = {
  researchPerDay: 60, // 학생 1명이 하루에 보낼 수 있는 연구 모드 메시지
  practicePerDay: 100, // 학생 1명이 하루에 부를 수 있는 연습 모드 AI(점검·코치·채점)
  teacherPerDay: 300, // 교사 1명이 하루에 부를 수 있는 교사 보조
  maxChars: 2000, // 학생 메시지 한 번의 최대 글자 수
  maxOutputTokens: 1500, // AI 답 한 번의 최대 토큰
  dailyBudgetUsd: 10, // 앱 전체 하루 비용 상한(달러). 넘으면 그날은 AI를 멈추고 안내
  classMaxMultiplier: 3, // 교사가 학급별로 올릴 수 있는 최대치 = 기본값 × 이 배수
};

export const AI_LIMIT_FIELDS = [
  { id: 'researchPerDay', label: '연구 모드 학생 하루 메시지', unit: '회', min: 1, max: 1000 },
  { id: 'practicePerDay', label: '증명 연습 학생 하루 AI 요청', unit: '회', min: 1, max: 2000 },
  { id: 'teacherPerDay', label: '교사 보조 교사 하루 요청', unit: '회', min: 1, max: 5000 },
  { id: 'maxChars', label: '학생 메시지 최대 길이', unit: '자', min: 100, max: 10000 },
  { id: 'maxOutputTokens', label: 'AI 답 최대 길이', unit: '토큰', min: 200, max: 8000 },
  { id: 'dailyBudgetUsd', label: '앱 전체 하루 비용 상한', unit: '달러', min: 0.5, max: 1000, step: 0.5 },
  { id: 'classMaxMultiplier', label: '교사가 학급별로 올릴 수 있는 배수', unit: '배', min: 1, max: 10 },
];
/** 교사가 학급마다 바꿀 수 있는 한도 */
export const CLASS_LIMIT_KEYS = ['researchPerDay', 'practicePerDay'];

export const aiModels = (saved) => Object.fromEntries(AI_USES.map(({ id }) => [id, { ...AI_MODEL_DEFAULTS[id], ...(saved?.[id] ?? {}) }]));
export const aiLimits = (saved) => ({ ...AI_LIMIT_DEFAULTS, ...(saved ?? {}) });

/** 학급의 하루 한도: 학급 값이 있으면 그것(관리자 최대치 = 기본값 × 배수로 자름), 없으면 기본값 */
export function classDailyLimit(key, limits, classLimits) {
  const base = limits[key];
  const want = Number(classLimits?.[key]);
  if (!Number.isFinite(want) || want < 1) return base;
  return Math.min(Math.round(want), Math.round(base * limits.classMaxMultiplier));
}

/** OpenRouter 모델 식별자 모양(제공자/이름, 뒤에 :변형) */
export const isModelId = (id) => /^[a-z0-9][\w.-]*\/[\w.:-]+$/i.test(String(id ?? '')) && String(id).length <= 120;

/** 한국 날짜(하루 한도를 세는 기준) 'YYYY-MM-DD' */
export const kstDate = (d = new Date()) => new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
