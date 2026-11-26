// AI와 탐구하기(연구 모드) 정의: 단계, 증명법 선택지, 보완할 점 체크리스트
// 연구 설계는 AGENTS.md 5절 "AI와 탐구하기 (연구 모드): 연구 설계"를 따른다.

export const RESEARCH_STAGES = [
  {
    n: 1,
    title: '나의 증명 작성',
    short: '나의 증명',
    summary: '명제마다 증명법을 고르고 내 힘으로 증명합니다. 확신 정도와 어려웠던 점도 남깁니다.',
    usesAi: false,
  },
  {
    n: 2,
    title: 'AI의 증명 얻기',
    short: 'AI 증명',
    summary: 'AI와 자유롭게 대화해 증명을 얻고, AI의 증명을 고치거나 요약하지 말고 그대로 옮겨 적습니다.',
    usesAi: true,
  },
  {
    n: 3,
    title: '두 증명 비교 분석',
    short: '비교 분석',
    summary: '나의 증명과 AI의 증명을 나란히 놓고, 각각 보완할 점과 AI에서 도움이 된 점을 분석합니다.',
    usesAi: false,
  },
  {
    n: 4,
    title: '최종 증명 작성',
    short: '최종 증명',
    summary: '비교한 결과를 바탕으로 최종 증명을 쓰고, 나의 증명과 AI의 증명을 얼마나 반영했는지 표시합니다.',
    usesAi: false,
  },
];

export const getStage = (n) => RESEARCH_STAGES.find((stage) => stage.n === Number(n)) ?? null;

/** 학생이 자유롭게 고르는 증명법 */
export const PROOF_METHOD_OPTIONS = [
  { id: 'direct', label: '연역적 증명(직접증명)' },
  { id: 'contrapositive', label: '대우를 이용한 증명' },
  { id: 'contradiction', label: '귀류법' },
  { id: 'other', label: '기타' },
];

export const methodOptionLabel = (id) => PROOF_METHOD_OPTIONS.find((m) => m.id === id)?.label ?? '';

/** 3단계 보완할 점 체크리스트 (활동지 3차시와 같은 문항, 루브릭 기준과 짝을 이룸) */
export const REVISION_CHECKLIST = [
  { id: 'condition', label: '조건 누락', desc: '명제에서 주어진 조건이나 문자가 어떤 수인지 빠뜨렸다.' },
  { id: 'calculation', label: '계산 오류', desc: '식을 전개하거나 정리하는 과정에서 계산을 잘못했다.' },
  { id: 'reason', label: '근거 생략', desc: '한 단계에서 다음 단계로 넘어갈 때 왜 그렇게 되는지 설명하지 않았다.' },
  { id: 'cases', label: '일부 경우만 확인', desc: '일부 경우만 확인하고, 조건을 만족하는 모든 경우를 다루지 않았다.' },
  { id: 'conclusion', label: '결론 불명확', desc: '앞에서 알아낸 사실이 결론을 어떻게 뒷받침하는지 분명히 쓰지 않았다.' },
];
export const CHECKLIST_NONE = { id: 'none', label: '보완할 점을 찾지 못했다' };

export const CONFIDENCE_LABELS = ['전혀 확신하지 않음', '조금 확신함', '보통', '꽤 확신함', '매우 확신함'];
