// 연구 모드 면담 (구현 6): 면담 후보 유형, 기준 기본값, 면담 상태, 면담 동의 항목
// AGENTS.md 5절 "교사 화면: 면담"을 따른다. 기준값은 교사가 화면에서 바꾸고(state/interviewStore.js), 판정은 services/interviewCandidates.js.
// 판정 단위는 학생 × 명제이고(사용자 결정 2026-11-27), 목록은 학생별로 묶는다.

/** 면담 후보 유형 6개 (번호는 설계 문서의 번호와 같다) */
export const INTERVIEW_TYPES = [
  { id: 't1', n: 1, label: '처음엔 못 했지만 최종 증명 완성', short: '혼자 못 함 → 최종 완성', desc: '자신의 증명(1단계)은 거의 완성하지 못했으나 최종 증명(4단계)을 잘 쓴 학생' },
  { id: 't2', n: 2, label: '거의 정확했지만 AI를 많이 반영', short: '정확 + AI 반영 높음', desc: '자신의 증명이 거의 정확했으나 최종 증명에 AI 반영 비율이 높은 학생' },
  { id: 't3', n: 3, label: '거의 정확했지만 증명법을 바꾸거나 나빠짐', short: '정확 → 바꿈·나빠짐', desc: '자신의 증명이 거의 정확했으나 최종 증명에서 증명법을 바꾸었거나 최종 증명이 오히려 부정확해진 학생' },
  { id: 't4', n: 4, label: 'AI 대화를 쓰는 방식', short: 'AI 대화 방식', desc: 'AI에게 단계를 나눠 질문한 학생(잘 쓴 예), 짧게 해 달라고 하거나 목적과 다르게 쓴 학생(못 쓴 예). 대화 태그 기준' },
  { id: 't5', n: 5, label: 'AI와 다른 자기 증명법을 고수', short: '자기 증명법 고수', desc: 'AI가 다른 증명법을 제시했지만 자기 증명법을 끝까지 유지한 학생(자기 증명이 부정확했는데도 고수한 경우 포함)' },
  { id: 't6', n: 6, label: '기타 (교사가 직접 지정)', short: '기타', desc: '수업에 대해 자기 의견이 있는 학생 등. 사후 설문 서술형 답을 참고해 교사가 직접 지정' },
];

export const interviewType = (id) => INTERVIEW_TYPES.find((t) => t.id === id) ?? null;

/**
 * 기준 기본값 (10점 만점, "보통 기준", 사용자 결정 2026-11-27)
 * lowMax: "거의 완성하지 못함"의 1단계 최고 점수, highMin: "거의 정확함·완벽함"의 최저 점수,
 * aiShareMin: "AI 반영 비율 높음"(%), dropMin: "부정확해짐"으로 볼 점수 하락, stickWeakMax: 유형 5에서 "부정확한데도 고수"로 볼 1단계 최고 점수
 */
export const DEFAULT_INTERVIEW_THRESHOLDS = { lowMax: 4, highMin: 8, aiShareMin: 70, dropMin: 2, stickWeakMax: 6 };

/** 기준값 입력 칸 (교사 화면) */
export const THRESHOLD_FIELDS = [
  { id: 'lowMax', label: '"거의 완성하지 못함": 1단계 점수', unit: '점 이하', min: 0, max: 10, step: 0.5, types: ['t1'] },
  { id: 'highMin', label: '"거의 정확함", "완벽함": 점수', unit: '점 이상', min: 0, max: 10, step: 0.5, types: ['t1', 't2', 't3'] },
  { id: 'aiShareMin', label: '"AI 반영 비율 높음": 4단계 AI 반영', unit: '% 이상', min: 0, max: 100, step: 10, types: ['t2'] },
  { id: 'dropMin', label: '"최종 증명이 부정확해짐": 점수 하락', unit: '점 이상', min: 0.5, max: 10, step: 0.5, types: ['t3'] },
  { id: 'stickWeakMax', label: '"부정확한데도 고수": 1단계 점수', unit: '점 이하', min: 0, max: 10, step: 0.5, types: ['t5'] },
];

/** 유형 4의 대화 태그 (data/chatTags.js의 기본 태그 id) */
export const GOOD_CHAT_TAGS = ['step-question'];
export const BAD_CHAT_TAGS = ['shorten', 'off-purpose'];

export const INTERVIEW_STATUS = [
  { id: 'planned', label: '예정' },
  { id: 'done', label: '완료' },
  { id: 'cancelled', label: '취소' },
];

/** 면담 동의 (서면 동의서는 종이로 받고 교사가 받은 날짜를 표시, 사용자 결정 2026-11-27). required: 면담 "완료"에 필요 */
export const INTERVIEW_CONSENTS = [
  { id: 'student', label: '학생 면담 동의', required: true },
  { id: 'guardian', label: '보호자 동의', required: true },
  { id: 'recording', label: '녹음 동의', required: false, help: '녹음은 서버 연결 뒤에 합니다. 동의를 받았다면 미리 표시해 둘 수 있습니다.' },
];
