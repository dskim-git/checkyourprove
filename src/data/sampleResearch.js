// 교사 채점·분석 화면 확인용 예시 연구 기록 (가상의 학생 6명, 실제 학생 정보가 아님)
// 구조는 state/researchStore.js의 기록과 같다. 증명의 질을 학생마다 다르게 해 채점·비교를 시험할 수 있게 했다.
// 일부 학생은 증명을 펜으로 썼다(data/sampleHandwriting.js로 만든 손글씨). 그 필기에는 미리 만든 "AI가 읽은 글"(inkReading)을 붙였다.
//   실제 AI 글자 변환은 아직 없다(AGENTS.md 5절 TODO). 일부러 한 곳을 잘못 읽은 예시도 있다(교사가 원본 필기와 비교해야 함을 보이려고).
// TODO: 서버 연결 뒤에는 실제 학급 학생의 기록으로 바뀌고, 이 예시는 교사 화면의 "예시 학생 포함"을 끄면 빠진다.

import { fullProofText } from './proofModel.js';
import { handwritingInk } from './sampleHandwriting.js';
import { DEFAULT_SURVEY, DEFAULT_SURVEY_ID } from './surveyDefaults.js';
import { PRINCIPLE_ITEMS, PRINCIPLE_VERSION } from './principleActivity.js';

/** 예시 원리 활동: 학생마다 틀리는 문항을 다르게(오류 찾기 e1, 질문 바꾸기 p1을 자주 틀리게) */
const PRINCIPLE_WRONG = [['n2', 'e1', 'e2', 'v1'], ['e1'], ['n2', 'e1'], ['n1', 'n2', 'v1', 'e1', 'p1'], ['p2'], ['e1', 'p1', 'e3']];
const PRINCIPLE_REFLECT = ['계산이 맞는지 직접 해 본다', '근거가 있는지 확인한다', 'AI 답을 내 증명과 비교한다', '그대로 믿지 않는다', '문자의 범위를 밝혔는지 본다', '이해 안 되는 줄을 다시 물어본다'];
function samplePrinciple(index, day) {
  const wrong = PRINCIPLE_WRONG[index];
  const answers = Object.fromEntries(PRINCIPLE_ITEMS.map((it, i) => {
    const bad = wrong.includes(it.id);
    const choice = bad ? (it.answer + 1) % it.options.length : it.answer;
    return [it.id, { choice, correct: !bad, at: at(day, 8, 20 + i), ms: 15000 + ((i * 7 + index * 3) % 30) * 1000 }];
  }));
  return { version: PRINCIPLE_VERSION, startedAt: at(day, 8, 15), finishedAt: at(day, 8, 31), activeMs: (13 + (index % 4)) * 60000, answers, reflection: PRINCIPLE_REFLECT[index] };
}

/**
 * 예시 사전·사후 설문 응답: 학생마다 출발점(level)을 두고, 사후에는 영역마다 조금씩 바뀌게 한다.
 * 증명 개념·AI 리터러시는 대체로 오르고, 수학 능력은 학생에 따라 다르다. 역문항(q6)은 반대로 움직인다.
 */
const SURVEY_TEXT = {
  pre: ['AI는 답을 빨리 알려 줘서 편하다', '잘 모르겠다', 'AI가 틀릴 수도 있을 것 같다', '숙제할 때 쓰면 좋을 것 같다', '없음', 'AI가 쓴 답은 다 맞는 줄 알았다'],
  post: ['AI가 쓴 증명도 근거를 확인해야 한다', '질문을 나누어 물으면 더 도움이 된다', 'AI가 틀릴 수 있어서 내가 비교해 보는 것이 중요하다', '처음 시작할 때 도움이 되지만 내가 먼저 생각해야 한다', 'AI 답을 그대로 쓰지 않고 내 말로 고쳐 쓴다', '편하지만 그대로 믿으면 안 된다'],
};
const clamp = (v) => Math.max(1, Math.min(5, Math.round(v)));
function sampleSurveys(index, day) {
  const level = [2, 4, 3, 1, 4, 3][index];
  const gain = { concept: [2, 0, 1, 1, 0, 1][index], ability: [1, 0, 1, 0, -1, 0][index], ai: [1, 1, 2, 1, 1, 0][index] };
  const answers = (kind) => Object.fromEntries(DEFAULT_SURVEY.questions.map((q, i) => {
    if (q.type === 'scale') {
      const base = level + ((i + index) % 3) - 1;
      const g = kind === 'post' ? gain[q.domain] : 0;
      return [q.id, clamp(q.reverse ? 6 - base - g : base + g)];
    }
    if (q.type === 'choice') {
      const pick = kind === 'pre' ? (level <= 2 ? 0 : 1) : (level <= 1 ? 0 : 1);
      return [q.id, q.options[pick]];
    }
    return [q.id, SURVEY_TEXT[kind][index]];
  }));
  const response = (kind, d, h) => ({
    surveyId: DEFAULT_SURVEY_ID, startedAt: at(d, h, 0), submittedAt: at(d, h, 6 + (index % 3)), activeMs: (5 + (index % 3)) * 60000 + 20000,
    answers: answers(kind), answeredAt: {}, changes: index % 2,
  });
  return { pre: response('pre', day, 8), post: response('post', day + 2, 10) };
}
import { RESEARCH_PROPOSITIONS } from './researchPropositions.js';

const P = Object.fromEntries(RESEARCH_PROPOSITIONS.map((p) => [p.id, p]));
const IDS = RESEARCH_PROPOSITIONS.map((p) => p.id);

/** 명제별 증명 유형: full 완전, partial 중간에 멈춤, numeric 수 대입만, flawed 오류·누락, alt 다른 방법 또는 조건 누락 */
const VARIANTS = {
  'research-cube-remainder': {
    full: { method: 'direct', text: fullProofText(P['research-cube-remainder']) },
    partial: { method: 'direct', text: 'n = 3k + 1이라 하면\nn³ = (3k + 1)³ = 27k³ + 27k² + 9k + 1' },
    numeric: { method: 'direct', text: 'n = 1이면 1³ = 1이고 3으로 나눈 나머지는 1\nn = 4이면 4³ = 64 = 3 × 21 + 1\nn = 7이면 7³ = 343 = 3 × 114 + 1\n따라서 나머지는 1이다.' },
    flawed: { method: 'direct', text: 'n = 3k + 1 (k는 0 이상의 정수)이라 하면\nn³ = 27k³ + 9k² + 9k + 1 = 3(9k³ + 3k² + 3k) + 1\n따라서 n³을 3으로 나눈 나머지는 1이다.' },
    alt: { method: 'direct', text: 'n = 3k + 1이라 하면 n³ = 3(9k³ + 9k² + 3k) + 1이므로 나머지는 1이다.' },
  },
  'research-square-odd': {
    full: { method: 'contrapositive', text: fullProofText(P['research-square-odd']) },
    partial: { method: 'contrapositive', text: '대우: n이 짝수이면 n² + 2n + 2는 짝수이다.\nn = 2k라 하면' },
    numeric: { method: 'direct', text: 'n = 1이면 1 + 2 + 2 = 5로 홀수\nn = 3이면 9 + 6 + 2 = 17로 홀수\n따라서 n은 홀수이다.' },
    flawed: { method: 'contrapositive', text: '대우: n이 짝수이면 n² + 2n + 2는 짝수이다.\nn = 2k (k는 정수)라 하면\nn² + 2n + 2 = 4k² + 2k + 2 = 2(2k² + k + 1)\n짝수이므로 대우가 참이고, 따라서 명제도 참이다.' },
    alt: { method: 'direct', text: 'n² + 2n + 2 = (n + 1)² + 1이 홀수이면 (n + 1)²은 짝수이다.\n따라서 n + 1은 짝수이고 n은 홀수이다.' },
  },
  'research-coprime-odd': {
    full: { method: 'contradiction', text: fullProofText(P['research-coprime-odd']) },
    partial: { method: 'contradiction', text: 'a, b가 모두 짝수라고 가정하자.\na = 2m, b = 2n' },
    numeric: { method: 'direct', text: 'a = 3, b = 4이면 서로소이고 3이 홀수이다.\na = 5, b = 2이면 서로소이고 5가 홀수이다.\n따라서 a 또는 b가 홀수이다.' },
    flawed: { method: 'contradiction', text: 'a, b가 모두 짝수라고 가정하면 a = 2m, b = 2n (m, n은 자연수)\n2는 a, b의 공약수이므로 서로소라는 가정에 모순이다.' },
    alt: { method: 'contrapositive', text: '대우: a, b가 모두 짝수이면 a, b는 서로소가 아니다.\na = 2m, b = 2n이면 2가 공약수이므로 서로소가 아니다.\n대우가 참이므로 명제도 참이다.' },
  },
};

const CHECKLIST_FOR = { full: ['none'], partial: ['conclusion', 'reason'], numeric: ['cases'], flawed: ['calculation'], alt: ['condition'] };
const STUCK_FOR = {
  full: '없음',
  partial: '식을 세운 다음에 무엇을 해야 할지 몰랐다',
  numeric: '문자로 나타내는 방법을 몰라서 수를 넣어 보았다',
  flawed: '전개가 헷갈렸다',
  alt: '어떤 증명법을 써야 할지 고민했다',
};

/** 학생별 1단계 → 4단계 증명 유형, 반영 비율(나의 답변 칸 수), 2단계 옮겨 적기, 펜으로 쓴 단계 */
const PROFILES = [
  { s1: 'numeric', s4: 'full', ratio: 2, transcript: 'full', confidence: [2, 5, 4] },
  { s1: 'full', s4: 'full', ratio: 3, transcript: 'full', confidence: [4, 4, 5], pen: [1, 4] },
  { s1: 'flawed', s4: 'full', ratio: 5, transcript: 'full', confidence: [3, 4, 4], pen: [2] },
  { s1: 'partial', s4: 'partial', ratio: 6, transcript: 'partial', confidence: [1, 3, 2] },
  { s1: 'full', s4: 'alt', ratio: 8, transcript: 'full', confidence: [5, 3, 4], pen: [1] },
  { s1: 'alt', s4: 'flawed', ratio: 7, transcript: 'full', confidence: [3, 3, 3] },
];
// 명제마다 유형을 조금씩 돌려 학생 안에서도 차이가 나게 한다
const ROTATE = ['full', 'partial', 'numeric', 'flawed', 'alt'];
const shift = (variant, i) => (i === 0 ? variant : ROTATE[(ROTATE.indexOf(variant) + (i === 2 ? 1 : 0)) % ROTATE.length]);

const at = (day, hour, minute) => `2026-11-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+09:00`;
const track = (minutes) => ({ activeMs: minutes * 60000, firstInputAt: null, inputCount: 40 + minutes * 6, deleteCount: 5 + minutes, snapshots: [], methodChanges: [], modeChanges: [], penOnText: 0 });
const stage = (day, startHour, minutes, items) => ({
  startedAt: at(day, startHour, 0),
  submittedAt: at(day, startHour, minutes),
  activeMs: minutes * 60000 - 90000,
  leaves: 1,
  items,
});

/**
 * 학생별 2단계 대화 대본 (AI 대화 태그를 시험할 수 있게 쓰는 방식을 다르게 했다)
 * 항목: ['s', 학생 메시지, 가드레일 분류] | ['proof'] AI 증명 | ['why', 단계 번호] 단계 설명 | ['short'] 짧은 증명 | ['guard', 안내] | ['ok', 답]
 */
const CHAT_SCRIPTS = [
  // 01: 시작 방법과 단계마다 이유를 나누어 물은 뒤 전체 증명을 확인 (잘 쓴 예)
  [['s', '이 명제는 어떻게 시작해야 해?', 'proof'], ['why', 0], ['s', '2번째 줄에서 왜 그렇게 묶는 거야?', 'proof'], ['why', 1], ['s', '이제 전체 증명을 보여 줘', 'proof'], ['proof']],
  // 02: 증명을 받고 짧게 해 달라고 함
  [['s', '이 명제를 증명해 줘', 'proof'], ['proof'], ['s', '너무 길어. 더 짧게 써 줘', 'proof'], ['short']],
  // 03: 증명을 받은 뒤 계산이 맞는지 따져 물음 (AI 오류 지적)
  [['s', '증명 좀 써 줘', 'proof'], ['proof'], ['s', '둘째 줄 계산 틀린 거 아니야?', 'proof'], ['ok', '다시 확인해 보았어요. 전개한 식을 3으로 묶으면 그대로 맞아요. 어느 부분이 이상해 보였는지 알려 주면 그 단계만 다시 설명할게요.']],
  // 04: 증명과 무관한 질문을 하다가 증명을 요구함 (목적과 다르게 씀)
  [['s', '오늘 급식 뭐야?', 'offtopic'], ['guard', '그 질문은 이 명제의 증명과 관련이 없어서 답할 수 없어요. 예를 들어 "이 명제는 어떻게 시작해야 해?"처럼 물어보세요.'], ['s', '그냥 증명해 줘', 'proof'], ['proof']],
  // 05: 증명을 받은 뒤 증명법을 고른 이유를 물음
  [['s', '증명해 줘', 'proof'], ['proof'], ['s', '이 증명법을 쓰는 이유가 뭐야?', 'proof'], ['why', 0]],
  // 06: 증명을 받고 고맙다고 끝냄 (따져 보지 않음)
  [['s', '이 명제 증명 알려 줘', 'proof'], ['proof'], ['s', '응 고마워', 'greeting'], ['ok', '도움이 되었다니 다행이에요. 궁금한 단계가 있으면 언제든 물어보세요.']],
];

/** 학생별 개방형 답 (명제마다 조금씩 돌려 쓴다) — 워드클라우드·답 모아 보기를 시험할 수 있게 다양하게 썼다 */
const OPEN = {
  notable: ['없음', '계산 과정을 자세히 보여 준다', '문자의 범위를 꼭 밝힌다', '설명이 길고 친절하다', '증명 끝에 결론을 분명히 쓴다', '처음에 대우를 먼저 써 준다'],
  compareNote: ['AI는 문자를 써서 모든 경우를 다루었고 나는 수를 넣어 확인했다', '둘 다 같은 흐름이지만 AI가 근거를 더 자세히 썼다', '나는 전개에서 계산을 틀렸고 AI는 정확했다', '나는 중간에 멈췄고 AI는 결론까지 썼다', '증명법은 같지만 AI는 문자의 범위를 밝혔다', '나는 다른 증명법을 썼고 AI는 대우를 이용했다'],
  myAdvantage: ['없음', '설명이 짧고 분명하다', '없음', '없음', '내 증명이 더 간결하다', '식을 더 간단하게 정리했다'],
  aiIssues: ['찾지 못함', '찾지 못함', '근거 설명이 조금 길다', '찾지 못함', '정수라는 조건을 한 번 더 써 주면 좋겠다', '결론 문장이 반복된다'],
  aiHelpful: ['문자로 식을 세우는 방법', '증명을 끝까지 정리하는 방법', '전개한 식을 3으로 묶는 계산', '어디서부터 시작해야 하는지 알려 준 점', '대우를 쓰는 이유 설명', '결론을 쓰는 방법'],
  plan: ['AI처럼 문자로 식을 세운다', '내 흐름을 살리고 AI의 결론 문장을 가져온다', '계산을 다시 확인해서 고친다', 'AI의 증명을 참고해서 끝까지 쓴다', '내 증명법을 그대로 쓰고 조건만 보충한다', 'AI의 증명법으로 바꾸어 쓴다'],
  aiOpinion: ['처음 시작을 알려 주어 도움이 되었지만 그대로 믿으면 안 될 것 같다', '빠르고 정확하지만 내가 생각할 기회가 줄어든다', '계산을 맞게 해 주어 믿을 만했다', '설명이 어려워서 다 이해하지 못했다', '내 증명과 비교할 수 있어서 좋았다', '증명을 너무 쉽게 써 줘서 그대로 따라 쓰게 된다'],
};
const open = (field, index, i) => OPEN[field][(index + i) % OPEN[field].length];

/** 대본으로 대화 메시지를 만든다 */
function buildChat(script, problem, day) {
  const strip = (t) => t.replace(/\{\{([^|}]+)[^}]*\}\}/g, '$1');
  const steps = problem.steps ?? [];
  let minute = 1;
  return script.map(([kind, a, b]) => {
    minute += 2;
    const atTime = at(day + 1, 10, minute);
    if (kind === 's') return { role: 'student', text: a, at: atTime, topic: b };
    const ai = (text, coverage, guard = null) => ({ role: 'ai', text, at: atTime, coverage, guard, guardVersion: 'research-guard-1', curriculumFlags: [] });
    if (kind === 'proof') return ai(aiReply(problem), 1);
    if (kind === 'short') return ai(`짧게 쓰면 이렇게 돼요.\n\n[증명]\n${steps.map((s) => strip(s.text)).join(' ')}\n\n짧게 쓰면 근거가 빠지기 쉬우니 각 줄이 왜 성립하는지 확인해 보세요.`, 1);
    if (kind === 'why') {
      const step = steps[Math.min(a, steps.length - 1)];
      return ai(`좋은 질문이에요. ${step.hint} 이 단계는 "${strip(step.text)}"로 나타낼 수 있어요. 다음 단계도 스스로 이어서 생각해 보세요.`, 0);
    }
    if (kind === 'guard') return ai(a, 0, 'offtopic');
    return ai(a, 0);
  });
}

function aiReply(problem) {
  const name = { direct: '연역적 증명(직접증명)', contrapositive: '대우를 이용한 증명', contradiction: '귀류법' }[problem.intendedMethod];
  return `${name}을 이용해 증명해 볼게요.\n\n[증명]\n${fullProofText(problem)}\n\n궁금한 단계가 있으면 물어보세요.`;
}

/** 예시 "AI가 읽은 글": 원래 글을 그대로 읽되, 일부 예시는 위첨자 하나를 잘못 읽는다(² → 2) */
function reading(text, misread, at) {
  const read = misread && text.includes('²') ? text.replace('²', '2') : misread && text.includes('³') ? text.replace('³', '3') : text;
  return { text: read, source: 'sample', model: null, at };
}

/** 증명 칸을 펜으로 쓴 것으로 바꾼다: 글은 비우고 손글씨 필기와 AI가 읽은 글을 넣는다 */
function asHandwriting(item, field, text, seed, at, misread) {
  item[field] = '';
  item.ink = { [field]: handwritingInk(text, { seed, startedAt: at }) };
  item.inputMode = { [field]: 'pen' };
  item.inkReading = { [field]: reading(text, misread, at) };
}

function buildRecord(profile, index) {
  const day = 18 + (index % 3);
  const stage1 = {};
  const stage2 = {};
  const stage3 = {};
  const stage4 = {};
  IDS.forEach((id, i) => {
    const problem = P[id];
    const v1 = shift(profile.s1, i);
    const v4 = shift(profile.s4, i);
    const mine = VARIANTS[id][v1];
    const final = VARIANTS[id][v4];
    const aiFull = fullProofText(problem);
    const aiLines = aiFull.split('\n');
    stage1[id] = { method: mine.method, methodOther: '', proof: mine.text, confidence: profile.confidence[0], stuck: STUCK_FOR[v1], ink: {}, inputMode: {}, track: track(6) };
    const pen = profile.pen ?? [];
    if (pen.includes(1)) asHandwriting(stage1[id], 'proof', mine.text, index * 100 + i + 1, at(day, 9, 2), i === 0);
    stage2[id] = {
      aiMethod: problem.intendedMethod,
      aiMethodOther: '',
      aiProof: profile.transcript === 'partial' ? aiLines.slice(0, Math.ceil(aiLines.length / 2)).join('\n') : aiFull,
      confidence: profile.confidence[1],
      notable: open('notable', index, i),
      pasteAttempts: index === 3 ? 1 : 0,
      tabSwitches: 3,
      chat: { messages: buildChat(CHAT_SCRIPTS[index], problem, day), requestLog: [] },
      proofHelpAt: at(day + 1, 10, 3),
      transcriptMatch: 1,
      transcriptCheck: 'text',
      ink: {},
      inputMode: {},
      track: track(5),
    };
    if (pen.includes(2)) {
      asHandwriting(stage2[id], 'aiProof', stage2[id].aiProof, index * 100 + i + 11, at(day + 1, 10, 6), i === 1);
      stage2[id].transcriptMatch = null;
      stage2[id].transcriptCheck = 'teacher';
    }
    stage3[id] = {
      compareNote: open('compareNote', index, i),
      myAdvantage: v1 === 'full' ? open('myAdvantage', index, i) : '없음',
      moreAccurate: v1 === 'full' ? 'both' : 'ai',
      myChecklist: CHECKLIST_FOR[v1],
      stuckResolved: v1 === 'full' ? 'none' : 'resolved',
      aiChecklist: ['none'],
      aiIssues: open('aiIssues', index, i),
      aiHelpful: open('aiHelpful', index, i),
      plan: open('plan', index, i),
      aiOpinion: open('aiOpinion', index, i),
      track: track(7),
    };
    stage4[id] = {
      method: final.method,
      methodOther: '',
      proof: final.text,
      usedFromMine: v1 === 'full' ? '전체 흐름' : '없음',
      usedFromAi: v4 === 'full' ? '식 세우기와 결론' : '없음',
      ratioMine: profile.ratio,
      confidence: profile.confidence[2],
      ink: {},
      inputMode: {},
      track: track(8),
    };
    if (pen.includes(4)) asHandwriting(stage4[id], 'proof', final.text, index * 100 + i + 21, at(day + 2, 9, 25), false);
  });
  return {
    propositionIds: [...IDS],
    stages: {
      1: stage(day, 9, 20, stage1),
      2: stage(day + 1, 10, 25, stage2),
      3: stage(day + 2, 9, 22, stage3),
      4: stage(day + 2, 9, 45, stage4),
    },
    consent: { agreed: true, at: at(day, 7, 55), version: 'consent-proto-1', history: [{ at: at(day, 7, 55), agreed: true, version: 'consent-proto-1' }] },
    surveys: sampleSurveys(index, day),
    principle: samplePrinciple(index, day),
    updatedAt: at(day + 2, 10, 10),
  };
}

let cache = null;

/** 예시 학생 기록 (처음 부를 때 한 번 만든다: 손글씨 필기 생성이 들어 있어 학생 화면을 불러올 때는 만들지 않는다) */
export function sampleResearchStudents() {
  cache ??= PROFILES.map((profile, i) => ({
    id: `sample-${String(i + 1).padStart(2, '0')}`,
    pseudonym: `예시 학생 ${String(i + 1).padStart(2, '0')}`,
    sample: true,
    record: buildRecord(profile, i),
  }));
  return cache;
}
