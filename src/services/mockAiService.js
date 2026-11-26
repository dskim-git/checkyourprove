// 더미 AI 대화 (AI와 탐구하기 · 프로토타입 전용)
//
// 실제 AI를 호출하지 않고, 요청 입력(request.input)의 명제와 대화만 보고 미리 준비한 문장을 돌려준다.
// 학생 초안은 입력에 존재하지 않는다.
// TODO: 서버 측 엔드포인트가 준비되면 fetch 호출로 교체한다. 함수 이름·인자·반환 형태({ text })는 유지한다.

import { getProblem } from '../data/problems/index.js';
import { fullProofText } from '../data/proofModel.js';
import { normalizeMath } from './textMatch.js';

const RESPONSE_DELAY_MS = 600;

const RESEARCH_OPENERS = {
  direct: '먼저 이 명제의 가정과 결론은 각각 무엇인가요? 가정에 쓰인 용어의 정의부터 함께 적어 볼까요?',
  contrapositive: '이 명제의 대우를 한 문장으로 쓰면 어떻게 될까요? "또는"과 "그리고", "모두"와 "적어도 하나"의 부정에 주의해 보세요.',
  contradiction: '귀류법은 결론을 부정하는 데서 시작합니다. 이 명제의 결론을 부정하면 어떤 가정이 되나요?',
  induction: '수학적 귀납법의 두 단계는 무엇인가요? 이 명제의 시작값이 무엇인지 먼저 확인해 볼까요?',
};

const OFF_TOPIC_WORDS = ['게임', '노래', '아이돌', '연예인', '점심', '급식', '유튜브', '웹툰', '드라마'];
const ANSWER_REQUEST_WORDS = ['정답', '답알려', '답좀', '증명해줘', '증명해주', '써줘', '써주', '대신', '풀어줘', '풀어주'];

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const includesAny = (text, words) => words.some((word) => text.includes(normalizeMath(word)));
const countStudentTurns = (messages) => messages.filter((message) => message.role === 'student').length;

/** 연구 모드 대화 응답 */
export async function requestResearchReply(request) {
  await delay(RESPONSE_DELAY_MS);
  const { propositionId, messages } = request.input;
  const problem = getProblem(propositionId);
  const turn = countStudentTurns(messages);

  if (turn === 0) {
    return {
      text: `이 명제를 함께 탐구해 볼게요. 저는 앞에서 쓴 초안을 볼 수 없고, 명제와 이 대화 내용만 알고 있어요.\n\n명제: ${problem.statement}\n\n${RESEARCH_OPENERS[problem.method]}`,
    };
  }

  const last = normalizeMath(messages.at(-1).text);
  const hints = problem.steps.map((step) => step.hint);
  const hint = hints[(turn - 1) % hints.length];

  if (includesAny(last, OFF_TOPIC_WORDS)) {
    return { text: `지금은 이 명제에 대한 탐구로 돌아가 볼게요.\n\n${hint}` };
  }
  if (includesAny(last, ANSWER_REQUEST_WORDS)) {
    return {
      text: `증명 전체는 화면 아래의 "AI에게 증명 요청하기" 버튼으로 받아 볼 수 있어요. 그 전에 한 가지를 더 생각해 볼까요?\n\n${hint}`,
    };
  }
  return { text: hint };
}

/** 연구 모드 AI 증명 */
export async function requestResearchProof(request) {
  await delay(RESPONSE_DELAY_MS);
  return { text: fullProofText(getProblem(request.input.propositionId)) };
}
