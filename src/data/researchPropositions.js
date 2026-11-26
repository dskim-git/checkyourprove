// AI와 탐구하기(연구 모드) 명제 — 수업 활동지(1~3차시)와 같은 명제
// intendedMethod: 교사가 의도한 증명법(분석용). 학생은 증명법을 자유롭게 고른다.
// steps: 2단계 더미 AI가 증명과 설명을 만들 때 쓰는 예시 증명. 학생 화면에는 보이지 않는다.
// TODO: 실제 서비스에서는 교사가 명제를 등록하고, 예시 증명은 서버에만 둔다.

export const RESEARCH_PROPOSITIONS = [
  {
    id: 'research-cube-remainder',
    research: true,
    method: 'direct',
    intendedMethod: 'direct',
    difficulty: '표준',
    title: '나머지가 1인 수의 세제곱',
    statement: '3으로 나누었을 때의 나머지가 1인 자연수를 세제곱한 수를 3으로 나누었을 때의 나머지는 1이다.',
    steps: [
      { text: '3으로 나누었을 때의 나머지가 1인 자연수를 n이라 하면 n = 3k + 1 (k는 0 이상의 정수)로 나타낼 수 있다.', hint: '"3으로 나눈 나머지가 1"인 수를 문자를 써서 식으로 나타내 보세요.' },
      { text: 'n³ = (3k + 1)³ = 27k³ + 27k² + 9k + 1 = 3(9k³ + 9k² + 3k) + 1', hint: '(3k + 1)³을 전개한 뒤 3으로 묶을 수 있는 부분을 찾아보세요.' },
      { text: '9k³ + 9k² + 3k는 0 이상의 정수이므로 n³을 3으로 나누었을 때의 나머지는 1이다.', hint: '괄호 안의 식이 정수라는 근거를 밝히고, 나머지의 뜻에 맞게 결론을 쓰세요.' },
    ],
  },
  {
    id: 'research-square-odd',
    research: true,
    method: 'contrapositive',
    intendedMethod: 'contrapositive',
    difficulty: '표준',
    title: 'n² + 2n + 2가 홀수이면',
    statement: '정수 n에 대하여 n² + 2n + 2가 홀수이면 n은 홀수이다.',
    steps: [
      { text: '주어진 명제의 대우는 "정수 n이 짝수이면 n² + 2n + 2는 짝수이다"이다.', hint: '가정과 결론을 각각 부정하고 자리를 바꾸어 대우를 써 보세요.' },
      { text: 'n이 짝수이면 n = 2k (k는 정수)로 나타낼 수 있다.', hint: '짝수의 정의를 이용해 n을 식으로 나타내 보세요.' },
      { text: 'n² + 2n + 2 = 4k² + 4k + 2 = 2(2k² + 2k + 1)', hint: 'n = 2k를 대입해 정리한 뒤 2로 묶어 보세요.' },
      { text: '2k² + 2k + 1은 정수이므로 n² + 2n + 2는 짝수이다.', hint: '2로 묶은 괄호 안이 정수임을 밝혀 짝수임을 보이세요.' },
      { text: '대우가 참이므로 주어진 명제도 참이다.', hint: '명제와 대우의 참·거짓이 같다는 사실로 마무리하세요.' },
    ],
  },
  {
    id: 'research-coprime-odd',
    research: true,
    method: 'contradiction',
    intendedMethod: 'contradiction',
    difficulty: '표준',
    title: '서로소인 두 자연수',
    statement: '두 자연수 a, b에 대하여 a, b가 서로소이면 a 또는 b가 홀수이다.',
    steps: [
      { text: 'a, b가 서로소이면서 a와 b가 모두 짝수라고 가정하자.', hint: '"a 또는 b가 홀수이다"의 부정은 무엇인지 생각해 보세요.' },
      { text: '그러면 a = 2m, b = 2n (m, n은 자연수)로 나타낼 수 있다.', hint: '짝수의 정의를 이용해 a, b를 식으로 나타내 보세요.' },
      { text: 'a, b는 모두 2를 약수로 가지므로 2는 a, b의 공약수이다. 이는 a, b가 서로소라는 가정에 모순이다.', hint: '서로소의 뜻(최대공약수가 1)과 비교해 보세요.' },
      { text: '따라서 a 또는 b는 홀수이다.', hint: '가정이 모순이므로 무엇이 참인지 결론을 쓰세요.' },
    ],
  },
];
