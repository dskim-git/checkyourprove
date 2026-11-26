// 교사용 AI 대화 태그 제안 (더미): 2단계 대화의 메시지마다, 그리고 대화 전체에 알맞은 태그와 근거를 제안한다.
// 실제 AI 연결 전 임시 규칙이다. 기본 태그(data/chatTags.js)만 판단하고, 교사가 추가한 태그는 제안하지 않는다.
// 제안은 참고용이며 태그는 교사가 직접 붙인다.
// TODO(로드맵 5단계): 서버가 buildChatTagAssistRequest의 입력과 chatTagAssistSystemPrompt로 실제 AI를 부른다.

const STUDENT_RULES = [
  {
    tag: 'off-purpose',
    test: (m) => ['offtopic', 'other-problem', 'injection', 'profanity'].includes(m.topic),
    reason: (m) => `증명과 관계없는 요청으로 분류된 질문입니다(${m.topic === 'other-problem' ? '다른 문제' : m.topic === 'injection' ? '규칙 바꾸기' : '증명과 무관'}).`,
  },
  {
    tag: 'shorten',
    test: (m) => /짧게|간단히|간단하게|요약|줄여/.test(m.text),
    reason: () => '답을 짧게 하거나 요약해 달라고 했습니다.',
  },
  {
    tag: 'point-error',
    test: (m) => /틀린|틀렸|틀리지|오류|잘못|이상한데|이상해|맞아\?|맞나요|맞는 거|아닌 것 같|아니야\?/.test(m.text),
    reason: () => 'AI 답이 맞는지 따지거나 틀린 곳을 짚었습니다.',
  },
  {
    tag: 'step-question',
    test: (m) => /(\d+|첫|두|세|네|다섯|마지막)\s*(번째|째)?\s*(줄|단계|문장)|왜\s|왜\?|이유|어떻게\s.*(되|나와|나오|묶)|이 부분|그 부분|어디서/.test(m.text),
    reason: () => '증명의 특정 부분이나 그 이유를 나누어 물었습니다.',
  },
  {
    tag: 'full-proof',
    test: (m) => /증명\s*(을|해|좀)?\s*(해|써|보여|알려|풀어)\s*(줘|주세요|줄래)|전체\s*증명|증명\s*전체|답\s*(알려|줘)/.test(m.text),
    reason: () => '증명 전체를 한 번에 써 달라고 했습니다.',
  },
];

/**
 * @param {{ messages: { role, text, topic?, curriculumFlags? }[] }} input
 * @returns {{ messages: Record<number, {tag, reason}[]>, conversation: {tag, reason}[], summary: string }}
 */
export function suggestChatTags({ messages }) {
  const out = {};
  messages.forEach((m, i) => {
    const picks = [];
    if (m.role === 'student') {
      STUDENT_RULES.forEach((rule) => {
        if (rule.test(m)) picks.push({ tag: rule.tag, reason: rule.reason(m) });
      });
      // 증명과 무관한 질문이면 다른 태그는 붙이지 않는다
      if (picks.some((p) => p.tag === 'off-purpose')) picks.splice(0, picks.length, picks.find((p) => p.tag === 'off-purpose'));
    } else if ((m.curriculumFlags ?? []).length) {
      picks.push({ tag: 'ai-error', reason: `교육과정 밖 표현이 들어 있습니다: ${m.curriculumFlags.join(', ')}.` });
    }
    if (picks.length) out[i] = picks;
  });
  const studentTags = Object.entries(out).filter(([i]) => messages[i].role === 'student').flatMap(([, p]) => p.map((x) => x.tag));
  const conversation = [];
  const asked = studentTags.some((t) => t === 'step-question' || t === 'point-error');
  if (studentTags.includes('full-proof') && !asked) {
    conversation.push({ tag: 'led-by-ai', reason: '증명을 요구하기만 하고 AI 답의 근거를 묻거나 따지는 질문이 없습니다. 실제로 AI 주장을 그대로 받아들였는지는 옮겨 적은 증명과 3단계 기록을 함께 보고 판단해 주세요.' });
  }
  const count = Object.keys(out).length;
  return {
    messages: out,
    conversation,
    summary: `${messages.filter((m) => m.role === 'student').length}개 질문 중 ${Object.keys(out).filter((i) => messages[i].role === 'student').length}개에 태그를 제안했습니다.${count ? '' : ' 알맞은 기본 태그를 찾지 못했습니다.'}`,
  };
}

export async function requestChatTagAssist(request, { delay = 500 } = {}) {
  await new Promise((resolve) => { setTimeout(resolve, delay); });
  return suggestChatTags(request.input);
}
