// 수식이 섞인 문장을 읽기 좋게 줄바꿈하는 도구
//
// 문장을 "덩어리"로 나눠 덩어리 안에서는 줄을 바꾸지 않는다(white-space: nowrap).
// - 식은 한 덩어리로 둔다. 길면 관계 기호(=, ≤, ≥, <, >, ≠) 앞에서만 나누고, 그래도 길면 + / − 앞에서 나눈다.
// - 빈칸은 앞의 식(예: "a =")과 바로 뒤에 붙은 문장 부호(예: ",")와 함께 둔다.
// - 짧은 괄호 묶음(예: "(m, n은 정수)로")은 한 덩어리로 둔다.
// - 식에 바로 붙은 조사(예: "2k + 1이다")는 그 식과 함께 둔다.
// 한글 낱말 사이는 body의 word-break: keep-all로 낱말 단위로 줄이 바뀐다.

import { escapeHtml } from './dom.js';

const HANGUL = /[가-힣]/;
const RELATION = /^(=|≤|≥|<|>|≠|⇔|⇒|→|≡)$/;
const ADDITIVE = /^(\+|−|-|±)$/;
const PAREN_MAX = 18; // 이보다 긴 괄호 묶음은 낱말 단위로 줄바꿈을 허용한다
const CHUNK_MAX = 22; // 식 덩어리(관계 기호부터 다음 관계 기호까지)가 이보다 길면 + / − 앞에서 나눈다
const SHORT_SIDE = 4; // 이보다 짧은 좌변(a, ab, n² 등)은 관계 기호와 붙여 둔다

/** segments: [{ type: 'text', value } | { type: 'blank', ... }] → 낱말 목록 */
function toWords(segments) {
  const words = [];
  let pendingSpace = true;
  const push = (atom, spaceBefore) => {
    const last = words.at(-1);
    if (!spaceBefore && last) last.atoms.push(atom);
    else words.push({ atoms: [atom] });
  };
  segments.forEach((segment) => {
    if (segment.type !== 'text') {
      push({ blank: segment }, pendingSpace);
      pendingSpace = false;
      return;
    }
    const parts = segment.value.split(/(\s+)/);
    let space = pendingSpace;
    parts.forEach((part) => {
      if (!part) return;
      if (/^\s+$/.test(part)) {
        space = true;
        return;
      }
      push({ text: part }, space);
      space = false;
    });
    pendingSpace = space;
  });
  return words;
}

// 빈칸은 정답 길이만큼 자리를 차지한다고 보고 길이를 잰다
const textOf = (word) => word.atoms.map((atom) => atom.text ?? '□'.repeat(Math.max(4, atom.blank.answers?.[0]?.length ?? 4))).join('');
const hasHangul = (word) => word.atoms.some((atom) => atom.text && HANGUL.test(atom.text));
const hasBlank = (word) => word.atoms.some((atom) => atom.blank);

/** 짧은 괄호 묶음을 낱말 하나로 합친다. */
function mergeParens(words) {
  const out = [];
  for (let i = 0; i < words.length; i += 1) {
    const start = textOf(words[i]);
    if (start.startsWith('(') && !start.includes(')')) {
      let j = i;
      let length = start.length;
      while (j + 1 < words.length && !textOf(words[j]).includes(')')) {
        j += 1;
        length += textOf(words[j]).length + 1;
      }
      const inside = words.slice(i, j + 1).map(textOf).join(' ').split(')')[0];
      if (textOf(words[j]).includes(')') && length <= PAREN_MAX && HANGUL.test(inside)) {
        const merged = { atoms: [], joined: [] };
        for (let k = i; k <= j; k += 1) {
          merged.joined.push(words[k]);
        }
        merged.atoms = merged.joined.flatMap((w) => w.atoms);
        out.push(merged);
        i = j;
        continue;
      }
    }
    out.push(words[i]);
  }
  return out;
}

/** 낱말들을 줄바꿈하지 않을 덩어리로 묶는다. */
function toChunks(words) {
  const chunks = [];
  let current = null; // { words: [], math: boolean, length }
  const open = (word, math) => {
    current = { words: [word], math, length: textOf(word).length };
    chunks.push(current);
  };
  // i번째 낱말부터 다음 관계 기호(또는 식이 끝나는 곳)까지의 글자 수
  const restLength = (i) => {
    let length = 0;
    for (let k = i; k < words.length; k += 1) {
      const t = textOf(words[k]);
      if (k > i && RELATION.test(t)) break;
      length += t.length + 1;
      if (hasHangul(words[k])) break;
    }
    return length;
  };
  // 괄호 깊이: 괄호 안에서는 식을 나누지 않는다
  let depth = 0;
  const depthChange = (t) => (t.match(/[({[]/g)?.length ?? 0) - (t.match(/[)}\]]/g)?.length ?? 0);
  words.forEach((word, index) => {
    const text = textOf(word);
    const depthBefore = depth;
    depth = Math.max(0, depth + depthChange(text));
    // 앞 낱말이 쉼표·세미콜론으로 끝났으면 새 덩어리를 시작한다 (예: "a = [빈칸], | b = [빈칸]")
    if (current?.closed) current = null;
    const math = !hasHangul(word);
    if (math) {
      const relation = RELATION.test(text) && depthBefore === 0;
      const additive = ADDITIVE.test(text);
      const punctuation = /^[,.;:)\]]+$/.test(text);
      const keepShortSide = relation && current?.math && current.length <= SHORT_SIDE && current.words.length === 1;
      // 괄호 밖의 + / − 앞에서 나눈다. 아주 긴 식(30자 초과)만 한 겹 괄호 안에서도 나눈다.
      const splitHere = additive && current?.math && (
        (depthBefore === 0 && current.length >= 6 && current.length + restLength(index) > CHUNK_MAX)
        || (depthBefore === 1 && current.length >= 14 && current.length + restLength(index) > 30));
      if (current?.math && (!relation || keepShortSide) && !splitHere) {
        current.words.push(word);
        current.length += text.length + 1;
      } else if (current && punctuation) {
        current.words.push(word);
      } else {
        open(word, true);
      }
      // 쉼표에서 덩어리를 끊되, 짧은 문자 목록(예: "p, q, r, s는")은 이어 둔다
      if (/[,;]$/.test(text) && (hasBlank(word) || text.length > 3)) current.closed = true;
      return;
    }
    // 한글이 든 낱말: 식 바로 뒤에서 빈칸이나 식 문자로 시작하면(예: "1이다", "2k)로", "[빈칸]이") 그 식에 붙인다.
    const leadsWithMath = word.atoms[0].blank || (/^[\w)√²³ᵏ⁺¹ⁿ]/.test(text) && !HANGUL.test(text[0]));
    if (current?.math && !word.joined && leadsWithMath) {
      current.words.push(word);
      current.math = false;
      return;
    }
    open(word, false);
    if (/[,;]$/.test(text)) current.closed = true;
  });
  return chunks;
}

/**
 * 문장 조각을 줄바꿈 덩어리 HTML로 만든다.
 * @param {Array} segments parseStep 결과 또는 [{ type: 'text', value }]
 * @param {(blank: object) => string} renderBlank 빈칸 조각을 HTML로 바꾸는 함수
 */
export function phraseHtml(segments, renderBlank = () => '') {
  const words = mergeParens(toWords(segments));
  const renderWord = (word) => (word.joined ?? [word])
    .map((w) => w.atoms.map((atom) => (atom.blank ? renderBlank(atom.blank) : escapeHtml(atom.text))).join(''))
    .join(' ');
  return toChunks(words)
    .map((chunk) => {
      const html = chunk.words.map(renderWord).join(' ');
      const nowrap = chunk.words.length > 1 || chunk.words.some(hasBlank) || chunk.words.some((w) => w.joined);
      return nowrap ? `<span class="ph">${html}</span>` : html;
    })
    .join(' ');
}

/** 일반 문장(빈칸 없음)을 줄바꿈 덩어리 HTML로 */
export function mathText(text) {
  return phraseHtml([{ type: 'text', value: String(text ?? '') }]);
}

/** 명제 문장: 본문과 "(단, …)" 조건을 나눠 조건은 아랫줄에 작게 보여 준다. */
export function statementHtml(statement) {
  const [main, condition] = String(statement ?? '').split(/\s+(?=\(단,)/);
  return condition
    ? `${mathText(main)}<span class="statement-cond">${mathText(condition)}</span>`
    : mathText(main);
}
