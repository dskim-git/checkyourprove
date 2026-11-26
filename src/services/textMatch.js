// 수식이 섞인 답을 비교하기 위한 정규화와 느슨한 비교 도구
// 공백을 없애고, 같은 뜻의 기호 표기를 하나로 맞춘다.
// 예: "(a − b)²" 와 "(a-b)^2", "x <= 1" 과 "x≤1", "2ᵏ⁺¹" 과 "2^(k+1)"

const SUPERSCRIPTS = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
  '⁺': '+', '⁻': '-', 'ᵏ': 'k', 'ⁿ': 'n', 'ᵐ': 'm',
};
const SUPERSCRIPT_RUN = new RegExp(`[${Object.keys(SUPERSCRIPTS).join('')}]+`, 'g');

export function normalizeMath(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(SUPERSCRIPT_RUN, (run) => {
      const plain = [...run].map((char) => SUPERSCRIPTS[char]).join('');
      return plain.length > 1 ? `^(${plain})` : `^${plain}`;
    })
    .replace(/\s+/g, '')
    .replace(/[−–—]/g, '-')
    .replace(/<=/g, '≤')
    .replace(/>=/g, '≥')
    .replace(/!=/g, '≠')
    .replace(/[×·⋅]/g, '*')
    .replace(/sqrt/g, '√')
    .replace(/[.。]$/, '');
}

/** 곱셈 기호를 생략하고, 괄호 밖의 덧셈 항 순서를 무시한 비교용 형태 */
function canonicalAnswer(text) {
  const value = normalizeMath(text).replace(/\*/g, '');
  if (/[=<>≤≥≠]/.test(value) || value.includes('-')) return value;
  const terms = [];
  let depth = 0;
  let current = '';
  for (const char of value) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === '+' && depth === 0) {
      terms.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  terms.push(current);
  return terms.sort().join('+');
}

/** 문자(변수) 이름을 무시한 식의 모양. 예: "2m+1"과 "2t+1"은 모양이 같다. */
export function shapeOf(text) {
  return normalizeMath(text).replace(/\*/g, '').replace(/[a-z]/g, 'x');
}

export function isSameAnswer(input, answers) {
  const value = canonicalAnswer(input);
  return value.length > 0 && answers.some((answer) => canonicalAnswer(answer) === value);
}

/** 문자만 다르고 모양은 같은 답인지 (빈칸 채우기에서 "문자를 확인하세요" 안내용) */
export function isSameShape(input, answers) {
  const value = shapeOf(input);
  return /[a-z]/.test(normalizeMath(input)) && answers.some((answer) => shapeOf(answer) === value);
}

// 같은 뜻으로 인정할 말 (공백을 뺀 형태)
const SYNONYMS = [
  ['모순', '불가능', '성립하지않', '맞지않', '어긋', '있을수없'],
  ['가정', '라하자', '라고하자', '라두자', '라고두자', '이라하면', '라하면', '라고하면', '라놓'],
  ['짝수', '2의배수'],
  ['정수', '자연수'],
  ['참', '성립', '증명되', '옳'],
  ['무리수이다', '무리수다', '무리수임', '유리수가아니'],
  ['서로소', '기약분수', '공약수가1', '공약수는1', '최대공약수가1'],
  ['존재하지않', '없다', '없음'],
  ['무수히', '무한히', '무한'],
  ['또는', '이거나', '적어도하나'],
  ['이고', '그리고', '이며', '모두'],
];

function expandPattern(pattern) {
  const base = normalizeMath(pattern);
  const variants = new Set([base]);
  for (const set of SYNONYMS) {
    const key = set.find((word) => base.includes(word));
    if (key) set.forEach((word) => variants.add(base.replace(key, word)));
  }
  return [...variants];
}

/** 패턴 하나가 글에 들어 있는지 (문자 이름이 달라도 식의 모양이 같으면 인정) */
export function containsPattern(text, pattern) {
  const value = normalizeMath(text).replace(/\*/g, '');
  const shape = shapeOf(text);
  return expandPattern(pattern).some((variant) => {
    const plain = variant.replace(/\*/g, '');
    if (value.includes(plain)) return true;
    return /[a-z]/.test(plain) && shape.includes(plain.replace(/[a-z]/g, 'x'));
  });
}

/** 핵심 표현 묶음별 충족 여부 */
export function matchGroups(text, groups) {
  return groups.map((group) => group.some((pattern) => containsPattern(text, pattern)));
}

/** 텍스트가 핵심 표현 묶음을 얼마나 충족하는지 0~1로 돌려준다. */
export function matchRatio(text, groups) {
  if (!groups.length) return normalizeMath(text).length >= 8 ? 1 : 0;
  const matched = matchGroups(text, groups).filter(Boolean);
  return matched.length / groups.length;
}

function bigrams(text) {
  const value = shapeOf(text);
  const set = new Map();
  for (let i = 0; i < value.length - 1; i += 1) {
    const gram = value.slice(i, i + 2);
    set.set(gram, (set.get(gram) ?? 0) + 1);
  }
  return set;
}

/** 두 문장이 얼마나 비슷한지 0~1 (글자 두 개 묶음의 겹침, 문자 이름은 무시) */
export function similarity(a, b) {
  const x = bigrams(a);
  const y = bigrams(b);
  const total = [...x.values()].reduce((s, n) => s + n, 0) + [...y.values()].reduce((s, n) => s + n, 0);
  if (!total) return 0;
  let common = 0;
  x.forEach((count, gram) => {
    common += Math.min(count, y.get(gram) ?? 0);
  });
  return (2 * common) / total;
}

/** a의 글자 두 개 묶음 중 b에도 있는 비율 0~1 (a가 b에서 온 내용인지 볼 때 쓴다. 문자 이름은 무시) */
export function containment(a, b) {
  const x = bigrams(a);
  const y = bigrams(b);
  const total = [...x.values()].reduce((s, n) => s + n, 0);
  if (!total) return 0;
  let common = 0;
  x.forEach((count, gram) => {
    common += Math.min(count, y.get(gram) ?? 0);
  });
  return common / total;
}

/** 증명 글을 문장 단위로 나눈다 (줄바꿈, 마침표, 쉼표 뒤 "따라서/그러므로" 등) */
export function splitSentences(text) {
  return String(text ?? '')
    .split(/\n+|(?<=[.。])\s+|(?<=다)\.?\s+(?=[가-힣])/)
    .map((s) => s.trim())
    .filter((s) => normalizeMath(s).length >= 2);
}
