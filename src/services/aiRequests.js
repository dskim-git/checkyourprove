// AI 요청 입력 구성
//
// 실제 서비스에서는 이 구성을 서버 측 엔드포인트(예: Vercel Functions)에서 수행한다.
// 예시 증명·채점 기준은 요청에 담지 않고 서버가 명제 식별자(propositionId)로 찾아 쓴다.
// 프로토타입에서는 같은 형태의 입력을 브라우저에서 만들어 기록과 화면에서 확인할 수 있게 한다.

export const PROMPT_VERSIONS = {
  stepCheck: 'step-check-proto-0',
  coach: 'coach-proto-0',
  grade: 'grade-proto-0',
  research: 'research-proto-1',
  gradeAssist: 'grade-assist-proto-0',
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
    // 서버는 이 버전의 가드레일(질문 분류, 교육과정 범위, 시스템 지침)을 적용한다(services/researchGuardrails.js).
    guardrail: 'research-guard-1',
    input: { ...propositionOf(problem), messages: toTranscript(messages) },
  };
}

// ── 교사 화면: AI 채점 도우미 ───────────────────────

/**
 * 교사가 채점할 때 참고하는 AI 채점 요청. 학생 화면의 AI(연구 모드 2단계)와는 별개이며 교사만 부른다.
 * 입력: 명제, 채점할 증명 글(필기는 AI가 읽은 글), 학생이 고른 증명법, 지금 루브릭(기준 이름·점수 설명).
 * 학생 이름·단계는 넣지 않는다(블라인드 채점과 같은 조건). 예시 증명은 서버가 명제 식별자로 찾아 쓴다.
 * TODO(서버 연결 시): 교사 권한을 확인한 뒤에만 받는다.
 */
export function buildGradeAssistRequest({ problem, proofText, chosenMethod, rubric, source }) {
  return {
    ...baseRequest('gas', 'grade-assist', PROMPT_VERSIONS.gradeAssist),
    mode: 'teacher',
    input: {
      propositionId: problem.id,
      statement: problem.statement,
      proofText,
      proofSource: source,
      chosenMethod,
      rubric: rubric.map((c) => ({ id: c.id, title: c.title, desc: c.desc, max: c.max, levels: c.levels })),
    },
  };
}

/** 실제 AI용 시스템 지침 (서버에서 조립한다. 지금은 더미 규칙이 대신 판단한다) */
export function gradeAssistSystemPrompt(rubric) {
  const lines = rubric.map((c) => `- ${c.id} "${c.title}" (0~${c.max}점): ${c.desc}\n${Object.entries(c.levels).sort((a, b) => b[0] - a[0]).map(([n, t]) => `    ${n}점: ${t}`).join('\n')}`);
  return [
    '너는 고등학교 수학 증명을 채점하는 교사를 돕는 보조 채점자다. 점수는 참고용이며 최종 판단은 교사가 한다.',
    '학생의 증명을 아래 루브릭의 기준마다 따로 판단해 가장 알맞은 점수 하나와 근거를 쓴다.',
    '근거는 학생 글의 어느 부분 때문에 그 점수인지 짧게 인용해 1~2문장으로 쓴다. 학생 글에 없는 내용을 지어내지 않는다.',
    '문자 이름이나 표현이 예시와 달라도 논리가 맞으면 인정한다. 필기를 AI가 읽은 글이면 읽기 오류가 있을 수 있음을 고려한다.',
    '루브릭:',
    ...lines,
    '출력은 JSON 하나: {"criteria": {"<기준 id>": {"score": 정수, "reason": "근거"}}, "completeness": "complete|partial|none", "actualMethod": "direct|contrapositive|contradiction|cases|other|unclear", "summary": "한 문장"}',
  ].join('\n');
}
