// 연구 모드 증명 채점 루브릭 (2026-11-26 확정, 10점 만점) — AGENTS.md 5절 "교사 화면: 채점(루브릭)"
// 1단계 나의 증명, 2단계 AI 증명(학생이 옮겨 적은 것), 4단계 최종 증명을 같은 루브릭으로 채점해 비교한다.
// 교사는 기준 이름과 점수 설명을 고칠 수 있다(점수 범위와 합계 10점은 고정). 고친 내용은 state/gradingStore.js에 저장한다.
// pair: 짝이 되는 3단계 보완할 점 체크리스트 id (학생의 자기 진단과 교사 채점을 비교할 때 쓴다)

export const DEFAULT_RUBRIC = [
  {
    id: 'logic',
    title: '논리적 타당성',
    desc: '각 단계가 앞 단계에서 논리적으로 이어지는가 (증명의 각 줄을 살펴 전체를 한 점수로 매긴다)',
    max: 3,
    pair: 'reason',
    levels: {
      3: '비약이나 오류 없음',
      2: '사소한 비약 1곳, 전체 논리는 맞음',
      1: '핵심 단계에 오류나 큰 비약',
      0: '논리 불성립 또는 시도 없음',
    },
  },
  {
    id: 'generality',
    title: '일반성',
    desc: '특정 수 대입이 아니라 모든 경우를 다루었는가',
    max: 2,
    pair: 'cases',
    levels: {
      2: '모든 경우를 일반적으로 다룸',
      1: '경우를 나눴으나 일부 빠뜨림',
      0: '몇 개의 수 대입 확인에 그침',
    },
  },
  {
    id: 'method',
    title: '증명법 일치',
    desc: '선택한 증명법대로 증명했는가 (실제로 쓴 증명법은 따로 기록한다)',
    max: 1,
    pair: null,
    levels: {
      1: '선택한 방법의 구조를 따름',
      0: '다른 방법 또는 구조 불일치',
    },
  },
  {
    id: 'formal',
    title: '형식적 표현',
    desc: '문자의 범위(자연수, 정수 등)와 가정을 밝혔는가',
    max: 1,
    pair: 'condition',
    levels: {
      1: '필요한 범위와 가정을 모두 밝힘',
      0: '하나라도 빠짐',
    },
  },
  {
    id: 'calculation',
    title: '계산 과정',
    desc: '계산을 지나치게 생략하지 않고 정확한가',
    max: 1,
    pair: 'calculation',
    levels: {
      1: '필요한 계산이 드러나고 정확함',
      0: '핵심 계산이 빠졌거나 틀림',
    },
  },
  {
    id: 'concise',
    title: '간결성',
    desc: '불필요한 단계나 조건이 없는가',
    max: 1,
    pair: null,
    levels: {
      1: '불필요한 내용이 없거나 흐름을 해치지 않음',
      0: '불필요한 단계·조건이 흐름을 가림',
    },
  },
  {
    id: 'conclusion',
    title: '결론',
    desc: '명제의 결론을 분명히 맺었는가',
    max: 1,
    pair: 'conclusion',
    levels: {
      1: '앞의 결과가 결론을 뒷받침함을 밝혀 결론을 맺음',
      0: '결론이 없거나 불분명함',
    },
  },
];

export const RUBRIC_TOTAL = DEFAULT_RUBRIC.reduce((sum, c) => sum + c.max, 0);

/** 완성도: 점수에 넣지 않고 면담 후보 판별에 쓴다 */
export const COMPLETENESS_OPTIONS = [
  { id: 'complete', label: '완성' },
  { id: 'partial', label: '일부(중간에 멈춤)' },
  { id: 'none', label: '시도 없음' },
];

/** 채점자가 기록하는 "실제로 쓴 증명법" */
export const ACTUAL_METHOD_OPTIONS = [
  { id: 'direct', label: '직접증명' },
  { id: 'contrapositive', label: '대우' },
  { id: 'contradiction', label: '귀류법' },
  { id: 'cases', label: '수 대입·경우 확인' },
  { id: 'other', label: '기타' },
  { id: 'unclear', label: '판단 어려움' },
];

/** 2단계 AI 증명: 옮겨 적기 확인 */
export const TRANSCRIPT_OPTIONS = [
  { id: 'ok', label: '대화의 AI 답과 같음' },
  { id: 'error', label: '옮겨 적기 오류 있음' },
];

/** 4단계: 3단계에서 체크한 보완할 점이 최종 증명에서 보완되었는가 */
export const REVISION_OPTIONS = [
  { id: 'fixed', label: '보완됨' },
  { id: 'not', label: '보완 안 됨' },
];

/** 4단계: 1단계의 막힌 점을 극복했는가 */
export const STUCK_OVERCOME_OPTIONS = [
  { id: 'yes', label: '극복함' },
  { id: 'partly', label: '일부 극복' },
  { id: 'no', label: '극복 못 함' },
  { id: 'none', label: '막힌 점 없음' },
];

/** 채점하는 단계와 그 단계의 증명 칸 */
export const GRADED_STAGES = [
  { n: 1, field: 'proof', methodField: 'method', otherField: 'methodOther', label: '1단계 나의 증명' },
  { n: 2, field: 'aiProof', methodField: 'aiMethod', otherField: 'aiMethodOther', label: '2단계 AI 증명' },
  { n: 4, field: 'proof', methodField: 'method', otherField: 'methodOther', label: '4단계 최종 증명' },
];
