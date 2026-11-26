// 교사 화면 미리보기용 예시 기록
// 모두 가상의 데이터이며 실제 학생 정보가 아니다. 학생은 가명 식별자로만 표시한다.

export const SAMPLE_ACTIVITY = [
  { pseudonym: '학생 01', certified: { direct: 4, contrapositive: 2, contradiction: 1, induction: 0 }, recent: { method: 'contradiction', levelId: 'order-steps', problemId: 'contradiction-sqrt2', result: '통과' }, lastActiveAt: '2026-11-20T09:18:00+09:00' },
  { pseudonym: '학생 02', certified: { direct: 2, contrapositive: 1, contradiction: 0, induction: 0 }, recent: { method: 'contrapositive', levelId: 'order-steps', problemId: 'contra-square-even', result: '진행 중' }, lastActiveAt: '2026-11-20T09:21:00+09:00' },
  { pseudonym: '학생 03', certified: { direct: 6, contrapositive: 3, contradiction: 2, induction: 1 }, recent: { method: 'direct', levelId: 'solo', problemId: 'direct-am-gm', result: '미통과 · 65점' }, lastActiveAt: '2026-11-20T09:24:00+09:00' },
  { pseudonym: '학생 04', certified: { direct: 1, contrapositive: 0, contradiction: 0, induction: 1 }, recent: { method: 'induction', levelId: 'fill-steps', problemId: 'induction-sum', result: '통과' }, lastActiveAt: '2026-11-20T10:05:00+09:00' },
  { pseudonym: '학생 05', certified: { direct: 0, contrapositive: 0, contradiction: 0, induction: 0 }, recent: { method: 'direct', levelId: 'fill-blanks', problemId: 'direct-odd-sum', result: '진행 중' }, lastActiveAt: '2026-11-20T10:02:00+09:00' },
];

// 연구 모드 기록 예시: 실제 저장 구조(src/state/sessionModels.js)와 같은 필드 구성을 따른다.
export const SAMPLE_RESEARCH_RECORDS = [
  {
    pseudonym: '학생 04',
    problemId: 'contradiction-sqrt2',
    draft: {
      text: `√2가 유리수라고 가정하면 √2 = a/b로 쓸 수 있다.
양변을 제곱하면 2 = a²/b² 이므로 a² = 2b²
a²이 짝수이므로 a도 짝수이다.
그런데 여기서 어떻게 모순이 나오는지 잘 모르겠다.`,
      confirmedAt: '2026-11-20T09:41:00+09:00',
    },
    aiDialogue: {
      messages: [
        { role: 'ai', text: '이 명제를 함께 탐구해 볼게요. 저는 앞에서 쓴 초안을 볼 수 없고, 명제와 이 대화 내용만 알고 있어요. 귀류법은 결론을 부정하는 데서 시작합니다. 이 명제의 결론을 부정하면 어떤 가정이 되나요?', at: '2026-11-20T09:42:00+09:00' },
        { role: 'student', text: '√2가 유리수라고 가정하는 거요. 그런데 분수로 쓰고 나서 모순을 어떻게 찾나요?', at: '2026-11-20T09:44:00+09:00' },
        { role: 'ai', text: '√2를 분수로 나타낼 때 p, q에 어떤 조건을 붙여야 나중에 모순을 찾을 수 있을까요?', at: '2026-11-20T09:44:00+09:00' },
        { role: 'student', text: '기약분수로 쓰면 되나요?', at: '2026-11-20T09:46:00+09:00' },
      ],
      requestLog: [
        { requestId: 'rrq-sample-1', sentAt: '2026-11-20T09:42:00+09:00', purpose: 'dialogue', model: 'mock (프로토타입 더미 응답)', promptVersion: 'research-proto-0', inputKeys: ['propositionId', 'statement', 'method', 'messages'], messageCount: 0 },
        { requestId: 'rrq-sample-2', sentAt: '2026-11-20T09:44:00+09:00', purpose: 'dialogue', model: 'mock (프로토타입 더미 응답)', promptVersion: 'research-proto-0', inputKeys: ['propositionId', 'statement', 'method', 'messages'], messageCount: 2 },
        { requestId: 'rrq-sample-3', sentAt: '2026-11-20T09:47:00+09:00', purpose: 'proof', model: 'mock (프로토타입 더미 응답)', promptVersion: 'research-proto-0', inputKeys: ['propositionId', 'statement', 'method', 'messages'], messageCount: 4 },
      ],
    },
    aiProof: { generatedAt: '2026-11-20T09:47:00+09:00', requestId: 'rrq-sample-3' },
    comparison: {
      ownStrengths: '결론을 부정해서 유리수라고 가정한 출발은 맞았다.',
      ownWeaknesses: 'a, b가 서로소라는 조건을 쓰지 않아서 모순을 만들 수 없었다.',
      aiStrengths: '서로소 조건을 처음부터 넣어서 마지막에 모순이 분명하게 드러난다.',
      aiWeaknesses: '"p²이 짝수이므로 p도 짝수이다"의 근거가 설명되어 있지 않다.',
      aiRegrets: '왜 서로소로 놓아야 하는지 이유를 말해 주지 않아서 처음 보는 사람은 이해하기 어려울 것 같다.',
    },
    finalProof: {
      text: `√2가 유리수라고 가정하자. 그러면 서로소인 자연수 p, q에 대해 √2 = p/q이다.
제곱하면 p² = 2q²이므로 p²은 짝수이다. 대우 증명에서 보인 것처럼 n²이 짝수이면 n도 짝수이므로 p는 짝수이다.
p = 2k라 하면 4k² = 2q², q² = 2k²이므로 q도 짝수이다.
p, q가 모두 2로 나누어떨어지므로 서로소라는 가정에 모순이다. 따라서 √2는 무리수이다.`,
      savedAt: '2026-11-20T10:01:00+09:00',
    },
    reflection: {
      ownReflectedLevel: 3,
      aiReflectedLevel: 4,
      explanation: '처음 가정과 제곱하는 부분은 내 초안을 썼고, 서로소 조건과 q도 짝수임을 보이는 부분은 AI 증명을 참고했다. AI가 설명하지 않은 p가 짝수인 이유는 앞에서 배운 대우 명제로 직접 채웠다.',
      submittedAt: '2026-11-20T10:05:00+09:00',
    },
  },
  {
    pseudonym: '학생 05',
    problemId: 'contradiction-sqrt2',
    draft: {
      text: `√2 = 1.414… 로 소수점 아래가 끝나지 않고 반복되지도 않으므로 무리수이다.`,
      confirmedAt: '2026-11-20T09:52:00+09:00',
    },
    aiDialogue: {
      messages: [
        { role: 'ai', text: '이 명제를 함께 탐구해 볼게요. 저는 앞에서 쓴 초안을 볼 수 없고, 명제와 이 대화 내용만 알고 있어요. 귀류법은 결론을 부정하는 데서 시작합니다. 이 명제의 결론을 부정하면 어떤 가정이 되나요?', at: '2026-11-20T09:53:00+09:00' },
        { role: 'student', text: '√2가 유리수라는 거요?', at: '2026-11-20T09:58:00+09:00' },
        { role: 'ai', text: '맞아요, 그 가정에서 출발합니다. 유리수의 정의를 이용하면 √2를 어떤 꼴로 나타낼 수 있을까요?', at: '2026-11-20T09:58:00+09:00' },
      ],
      requestLog: [
        { requestId: 'rrq-sample-4', sentAt: '2026-11-20T09:53:00+09:00', purpose: 'dialogue', model: 'mock (프로토타입 더미 응답)', promptVersion: 'research-proto-0', inputKeys: ['propositionId', 'statement', 'method', 'messages'], messageCount: 0 },
        { requestId: 'rrq-sample-5', sentAt: '2026-11-20T09:58:00+09:00', purpose: 'dialogue', model: 'mock (프로토타입 더미 응답)', promptVersion: 'research-proto-0', inputKeys: ['propositionId', 'statement', 'method', 'messages'], messageCount: 2 },
      ],
    },
    aiProof: { generatedAt: null, requestId: null },
    comparison: null,
    finalProof: null,
    reflection: null,
  },
];
