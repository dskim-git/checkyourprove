// 증명법 정의 (정적 데이터)

export const METHODS = [
  {
    id: 'direct',
    label: '직접증명법',
    shortLabel: '직접증명',
    course: '공통수학2',
    description: '가정에서 출발해 정의와 이미 알려진 성질을 근거로 결론을 이끌어 냅니다.',
    writingTip: '가정을 먼저 쓰고, 정의와 알려진 성질을 근거로 한 줄씩 결론까지 이어 가세요.',
  },
  {
    id: 'contrapositive',
    label: '대우를 이용한 증명',
    shortLabel: '대우 증명',
    course: '공통수학2',
    description: '"p이면 q이다" 대신 참·거짓이 같은 대우 "q가 아니면 p가 아니다"를 증명합니다.',
    writingTip: '먼저 대우 명제를 문장으로 쓰고, 그 대우를 증명한 뒤 원래 명제의 결론을 맺으세요.',
  },
  {
    id: 'contradiction',
    label: '귀류법',
    shortLabel: '귀류법',
    course: '공통수학2',
    description: '결론을 부정했다고 가정한 뒤 모순을 이끌어 내어 원래 명제가 참임을 보입니다.',
    writingTip: '"결론이 거짓이라고 가정하자"로 시작해, 무엇과 무엇이 모순인지 밝히세요.',
  },
  {
    id: 'induction',
    label: '수학적 귀납법',
    shortLabel: '수학적 귀납법',
    course: '대수',
    description: '시작값에서 성립함을 보이고, n = k일 때 성립하면 n = k + 1일 때도 성립함을 보입니다.',
    writingTip: '(i) 시작값에서 성립함, (ii) n = k에서 성립한다고 가정하면 n = k + 1에서도 성립함을 차례로 쓰세요.',
  },
];

export function getMethod(id) {
  return METHODS.find((method) => method.id === id) ?? null;
}
