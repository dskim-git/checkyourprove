// 교사 채점·분석 화면 확인용 예시 연구 기록 (가상의 학생 6명, 실제 학생 정보가 아님)
// 구조는 state/researchStore.js의 기록과 같다. 증명의 질을 학생마다 다르게 해 채점·비교를 시험할 수 있게 했다.
// TODO: 서버 연결 뒤에는 실제 학급 학생의 기록으로 바뀌고, 이 예시는 교사 화면의 "예시 학생 포함"을 끄면 빠진다.

import { fullProofText } from './proofModel.js';
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

/** 학생별 1단계 → 4단계 증명 유형, 반영 비율(나의 답변 칸 수), 2단계 옮겨 적기 */
const PROFILES = [
  { s1: 'numeric', s4: 'full', ratio: 2, transcript: 'full', confidence: [2, 5, 4] },
  { s1: 'full', s4: 'full', ratio: 3, transcript: 'full', confidence: [4, 4, 5] },
  { s1: 'flawed', s4: 'full', ratio: 5, transcript: 'full', confidence: [3, 4, 4] },
  { s1: 'partial', s4: 'partial', ratio: 6, transcript: 'partial', confidence: [1, 3, 2] },
  { s1: 'full', s4: 'alt', ratio: 8, transcript: 'full', confidence: [5, 3, 4] },
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

function aiReply(problem) {
  const name = { direct: '연역적 증명(직접증명)', contrapositive: '대우를 이용한 증명', contradiction: '귀류법' }[problem.intendedMethod];
  return `${name}을 이용해 증명해 볼게요.\n\n[증명]\n${fullProofText(problem)}\n\n궁금한 단계가 있으면 물어보세요.`;
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
    const reply = aiReply(problem);
    stage2[id] = {
      aiMethod: problem.intendedMethod,
      aiMethodOther: '',
      aiProof: profile.transcript === 'partial' ? aiLines.slice(0, Math.ceil(aiLines.length / 2)).join('\n') : aiFull,
      confidence: profile.confidence[1],
      notable: index % 2 ? '계산 과정을 자세히 보여 준다' : '없음',
      pasteAttempts: index === 3 ? 1 : 0,
      tabSwitches: 3,
      chat: {
        messages: [
          { role: 'student', text: '이 명제를 증명해 줘', at: at(day + 1, 10, 2), topic: 'proof' },
          { role: 'ai', text: reply, at: at(day + 1, 10, 3), coverage: 1, guard: null, guardVersion: 'research-guard-1', curriculumFlags: [] },
        ],
        requestLog: [],
      },
      proofHelpAt: at(day + 1, 10, 3),
      transcriptMatch: 1,
      transcriptCheck: 'text',
      ink: {},
      inputMode: {},
      track: track(5),
    };
    stage3[id] = {
      compareNote: v1 === 'full' ? '둘 다 같은 흐름이다' : 'AI는 문자를 써서 모든 경우를 다루었다',
      myAdvantage: v1 === 'full' ? '설명이 짧고 분명하다' : '없음',
      moreAccurate: v1 === 'full' ? 'both' : 'ai',
      myChecklist: CHECKLIST_FOR[v1],
      stuckResolved: v1 === 'full' ? 'none' : 'resolved',
      aiChecklist: ['none'],
      aiIssues: '찾지 못함',
      aiHelpful: '식을 세우는 방법',
      plan: 'AI의 식 세우기를 가져온다',
      aiOpinion: '설명이 자세하지만 그대로 믿으면 안 될 것 같다',
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
  });
  return {
    propositionIds: [...IDS],
    stages: {
      1: stage(day, 9, 20, stage1),
      2: stage(day + 1, 10, 25, stage2),
      3: stage(day + 2, 9, 22, stage3),
      4: stage(day + 2, 9, 45, stage4),
    },
    updatedAt: at(day + 2, 9, 45),
  };
}

export const SAMPLE_RESEARCH_STUDENTS = PROFILES.map((profile, i) => ({
  id: `sample-${String(i + 1).padStart(2, '0')}`,
  pseudonym: `예시 학생 ${String(i + 1).padStart(2, '0')}`,
  sample: true,
  record: buildRecord(profile, i),
}));
