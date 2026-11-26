// 연구 모드 2단계 AI 대화 태그 (교사가 붙임) — AGENTS.md 5절 "교사 화면: 채점(루브릭)"의 대화 태그
// scope: 'student'(학생 메시지에 붙임) | 'ai'(AI 답에 붙임) | 'conversation'(대화 전체에 붙임)
// 교사는 태그 이름·설명을 고치고 추가·삭제할 수 있다(state/gradingStore.js의 chatTags). 기본 태그의 id는 바꾸지 않는다.
// 면담 후보 유형 4(단계를 나눠 질문한 학생 / 짧게 해 달라고 하거나 목적과 다르게 쓴 학생)의 근거가 된다.

export const DEFAULT_CHAT_TAGS = [
  { id: 'step-question', scope: 'student', label: '단계를 나눈 질문', desc: '증명의 특정 줄이나 단계, 그 이유를 나누어 물었다.' },
  { id: 'full-proof', scope: 'student', label: '전체 증명 요구', desc: '증명 전체를 한 번에 써 달라고 했다.' },
  { id: 'shorten', scope: 'student', label: '짧게 해 달라는 요청', desc: '답이나 증명을 짧게, 간단히, 요약해 달라고 했다.' },
  { id: 'off-purpose', scope: 'student', label: '목적과 무관한 사용', desc: '증명과 관계없는 이야기, 다른 문제, 규칙 바꾸기 등을 요청했다.' },
  { id: 'point-error', scope: 'student', label: 'AI 오류 지적', desc: 'AI 답의 오류나 이상한 점을 짚거나 맞는지 따져 물었다.' },
  { id: 'ai-error', scope: 'ai', label: 'AI 답에 오류', desc: 'AI 답에 수학적 오류, 비약, 교육과정 밖 표현이 있다.' },
  { id: 'led-by-ai', scope: 'conversation', label: 'AI 주장에 끌려감', desc: 'AI의 답을 따져 보지 않고 그대로 받아들이거나, AI 말에 따라 생각을 바꾸었다.' },
];

export const TAG_SCOPES = [
  { id: 'student', label: '학생 질문' },
  { id: 'ai', label: 'AI 답' },
  { id: 'conversation', label: '대화 전체' },
];
