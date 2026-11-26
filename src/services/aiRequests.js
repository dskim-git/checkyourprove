// AI 요청 입력 구성
//
// 실제 서비스에서는 이 구성을 서버 측 엔드포인트(예: Vercel Functions)에서 수행한다.
// 예시 증명·채점 기준은 요청에 담지 않고 서버가 명제 식별자(propositionId)로 찾아 쓴다.
// 프로토타입에서는 같은 형태의 입력을 브라우저에서 만들어 기록과 화면에서 확인할 수 있게 한다.

export const PROMPT_VERSIONS = {
  stepCheck: 'step-check-proto-0',
  coach: 'coach-proto-0',
  grade: 'grade-proto-0',
  research: 'research-proto-0',
};

// TODO: 사용할 모델이 정해지면 서버에서 실제 모델 식별자를 기록한다.
export const MODEL_PLACEHOLDER = 'mock (프로토타입 더미 응답)';

let sequence = 0;
const requestId = (prefix) => `${prefix}-${Date.now().toString(36)}-${(sequence++).toString(36)}`;

function baseRequest(prefix, kind, promptVersion) {
  return {
    requestId: requestId(prefix),
    kind,
    sentAt: new Date().toISOString(),
    model: MODEL_PLACEHOLDER,
    promptVersion,
  };
}

const propositionOf = (problem) => ({ propositionId: problem.id, statement: problem.statement, method: problem.method });

// ── 증명 연습 ─────────────────────────────────

/** 빠진 단계 채우기·한 단계씩 증명하기: 학생이 쓴 한 단계를 점검한다. */
export function buildStepCheckRequest({ problem, levelId, stepIndex, studentStep, previousSteps, tries = 0 }) {
  return {
    ...baseRequest('scq', 'step-check', PROMPT_VERSIONS.stepCheck),
    levelId,
    input: { ...propositionOf(problem), stepIndex, studentStep, previousSteps, tries },
  };
}

/** AI 코치: 학생이 완성한 증명 전체를 검토한다. */
export function buildCoachRequest({ problem, round, studentProof }) {
  return {
    ...baseRequest('cch', 'coach-review', PROMPT_VERSIONS.coach),
    levelId: 'ai-coach',
    input: { ...propositionOf(problem), round, studentProof },
  };
}

/** 나 혼자 증명하기: 학생 증명을 채점한다. */
export function buildGradeRequest({ problem, studentProof }) {
  return {
    ...baseRequest('grd', 'grade', PROMPT_VERSIONS.grade),
    levelId: 'solo',
    input: { ...propositionOf(problem), studentProof },
  };
}

// ── AI와 탐구하기(연구 모드) ───────────────────────

const toTranscript = (messages) => messages.map(({ role, text }) => ({ role, text }));

/**
 * 연구 모드 2단계 대화 요청: 학생의 1단계 증명을 인자로 받지 않으며 입력에도 넣지 않는다.
 * 입력은 명제와 이 대화의 메시지로만 구성한다(화이트리스트).
 * TODO: 서버는 이 학생에게 2단계가 열려 있고 아직 제출하지 않았을 때만 요청을 받는다.
 */
export function buildResearchRequest({ problem, messages }) {
  return {
    ...baseRequest('rrq', 'research', PROMPT_VERSIONS.research),
    mode: 'research',
    stage: 2,
    input: { ...propositionOf(problem), messages: toTranscript(messages) },
  };
}
