// 더미 AI 대화 (AI와 탐구하기 2단계 · 프로토타입 전용)
//
// 실제 AI를 호출하지 않고, 요청 입력(request.input)의 명제와 이 대화만 보고 미리 준비한 문장을 돌려준다.
// 학생의 1단계 증명은 입력에 존재하지 않는다(AGENTS.md 6절).
// 2단계는 "AI의 증명 얻기"이므로, 학생이 요청하면 증명 전체를 보여 준다.
// TODO: 서버 측 엔드포인트가 준비되면 fetch 호출로 교체한다. 함수 이름·인자·반환 형태({ text })는 유지한다.

import { getProblem } from '../data/problems/index.js';
import { fullProofText } from '../data/proofModel.js';
import { methodOptionLabel } from '../data/research.js';
import { normalizeMath } from './textMatch.js';

const RESPONSE_DELAY_MS = 700;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const includesAny = (text, words) => words.some((word) => text.includes(normalizeMath(word)));

const PROOF_WORDS = ['증명', '풀어', '알려', '보여', '해줘', '해 줘', '써줘', '써 줘'];
const WHY_WORDS = ['왜', '이유', '설명', '이해', '모르겠', '어떻게'];
const SHORT_WORDS = ['짧게', '간단히', '요약'];
const OFF_TOPIC_WORDS = ['게임', '노래', '아이돌', '연예인', '점심', '급식', '유튜브', '웹툰', '드라마'];
const METHOD_WORDS = {
  direct: ['직접', '연역'],
  contrapositive: ['대우'],
  contradiction: ['귀류'],
};

const METHOD_STARTS = {
  direct: '가정에서 출발해 정의와 이미 알려진 성질을 차례로 써서 결론에 이르면 됩니다.',
  contrapositive: '결론의 부정을 가정으로, 가정의 부정을 결론으로 하는 대우 명제를 세운 뒤 그 대우를 증명하면 됩니다.',
  contradiction: '결론을 부정한 것을 가정하고, 그 가정에서 이미 참인 사실과 맞지 않는 모순을 이끌어 내면 됩니다.',
};

/** 연구 모드 2단계 대화 응답 */
export async function requestResearchChat(request) {
  await delay(RESPONSE_DELAY_MS);
  const { propositionId, messages } = request.input;
  const problem = getProblem(propositionId);
  const studentTurns = messages.filter((m) => m.role === 'student');
  const last = normalizeMath(studentTurns.at(-1)?.text ?? '');
  const methodName = methodOptionLabel(problem.method) || '직접증명';

  if (includesAny(last, OFF_TOPIC_WORDS)) {
    return { text: `지금은 이 명제의 증명에 집중해 볼게요.\n\n명제: ${problem.statement}\n\n증명이 필요하면 "증명해 줘"라고 말해 주세요.` };
  }

  const askedMethod = Object.entries(METHOD_WORDS).find(([, words]) => includesAny(last, words))?.[0];
  if (askedMethod && askedMethod !== problem.method) {
    return {
      text: `${methodOptionLabel(askedMethod)}으로도 생각해 볼 수 있어요. ${METHOD_STARTS[askedMethod]}\n\n제가 정리해 둔 증명은 ${methodName}을 이용한 것이에요. 그 증명을 보고 싶으면 "증명해 줘"라고 말해 주세요.`,
    };
  }

  if (includesAny(last, SHORT_WORDS)) {
    const core = problem.steps.map((step) => step.text).filter((_, i, all) => i === 0 || i >= all.length - 2).join('\n');
    return { text: `핵심만 짧게 정리하면 다음과 같아요. 중간 과정이 생략되어 있으니 주의하세요.\n\n${core}` };
  }

  if (includesAny(last, WHY_WORDS) && studentTurns.length > 1) {
    const explain = problem.steps.map((step, i) => `${i + 1}. ${step.hint}`).join('\n');
    return { text: `증명의 각 단계에서 생각할 점을 정리해 볼게요.\n\n${explain}` };
  }

  if (includesAny(last, PROOF_WORDS) || studentTurns.length === 1) {
    return { text: `${methodName}을 이용해 증명해 볼게요.\n\n[증명]\n${fullProofText(problem)}\n\n궁금한 단계가 있으면 물어보세요.` };
  }

  return { text: `이 명제는 ${methodName}으로 증명할 수 있어요. 증명 전체를 보고 싶으면 "증명해 줘", 특정 단계가 궁금하면 "왜 그런지 설명해 줘"라고 말해 주세요.` };
}
