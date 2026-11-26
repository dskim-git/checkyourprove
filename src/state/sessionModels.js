// AI와 탐구하기(연구 모드) 세션 데이터 구조
// 증명 연습 활동 기록은 attemptStore.js에서 따로 관리한다.
// TODO: Firestore 컬렉션 구조를 설계할 때 이 필드 구성을 출발점으로 삼는다.

const now = () => new Date().toISOString();

/** 연구 모드: AI는 학생 초안과 독립적으로 명제만 가지고 대화한다. */
export function createResearchSession(problemId) {
  const createdAt = now();
  return {
    mode: 'research',
    problemId,
    step: 0,
    createdAt,
    updatedAt: createdAt,
    completedAt: null,
    // 학생 초안. 확정 후 수정할 수 없으며, AI 요청에는 어떤 형태로도 포함하지 않는다.
    draft: { text: '', confirmedAt: null },
    // AI 대화. 요청 입력은 명제 + 이 대화의 메시지만으로 구성된다(src/services/aiRequests.js).
    aiDialogue: { messages: [], requestLog: [] },
    // AI가 제시한 증명과, 그 증명을 만든 요청의 식별자
    aiProof: { text: '', generatedAt: null, requestId: null },
    // 두 증명에 대한 학생의 평가
    comparison: {
      ownStrengths: '',
      ownWeaknesses: '',
      aiStrengths: '',
      aiWeaknesses: '',
      aiRegrets: '',
    },
    finalProof: { text: '', savedAt: null },
    // 최종 증명에 각 증명을 반영한 정도(1~5)와 설명
    reflection: { ownReflectedLevel: null, aiReflectedLevel: null, explanation: '', submittedAt: null },
  };
}
