// 채점자 간 일치도: 기준별 정확 일치율과 가중 카파(이차 가중), 합계 점수 차이
// 두 채점자가 모두 채점한 증명만 쓴다.

/**
 * 이차 가중 카파. pairs = [[a, b], ...] (0..max 정수 점수)
 * 모든 점수가 한 값으로 같아 기대 불일치가 0이면 null을 돌려준다(카파를 정할 수 없음).
 */
export function weightedKappa(pairs, max) {
  const n = pairs.length;
  if (!n) return null;
  const k = max + 1;
  const observed = Array.from({ length: k }, () => Array(k).fill(0));
  const rowSum = Array(k).fill(0);
  const colSum = Array(k).fill(0);
  pairs.forEach(([a, b]) => {
    observed[a][b] += 1;
    rowSum[a] += 1;
    colSum[b] += 1;
  });
  let obs = 0;
  let exp = 0;
  const denom = max === 0 ? 1 : max * max;
  for (let i = 0; i < k; i += 1) {
    for (let j = 0; j < k; j += 1) {
      const w = ((i - j) * (i - j)) / denom;
      obs += (w * observed[i][j]) / n;
      exp += (w * rowSum[i] * colSum[j]) / (n * n);
    }
  }
  return exp === 0 ? null : 1 - obs / exp;
}

/**
 * 두 채점자의 점수로 일치도를 계산한다.
 * @param rubric 기준 목록 [{ id, title, max }]
 * @param scoresA, scoresB { [대상 key]: score }
 */
export function raterAgreement(rubric, scoresA = {}, scoresB = {}) {
  const keys = Object.keys(scoresA).filter((key) => scoresB[key]);
  const criteria = rubric.map((c) => {
    const pairs = keys
      .map((key) => [scoresA[key].criteria?.[c.id], scoresB[key].criteria?.[c.id]])
      .filter(([a, b]) => a != null && b != null)
      .map(([a, b]) => [Number(a), Number(b)]);
    const exact = pairs.length ? pairs.filter(([a, b]) => a === b).length / pairs.length : null;
    return { id: c.id, title: c.title, n: pairs.length, exact, kappa: weightedKappa(pairs, c.max) };
  });
  const totals = keys.map((key) => [sum(scoresA[key]), sum(scoresB[key])]);
  const meanDiff = totals.length ? totals.reduce((s, [a, b]) => s + Math.abs(a - b), 0) / totals.length : null;
  const exactTotal = totals.length ? totals.filter(([a, b]) => a === b).length / totals.length : null;
  return { n: keys.length, criteria, meanDiff, exactTotal };
}

const sum = (score) => Object.values(score.criteria ?? {}).reduce((s, v) => s + Number(v), 0);

/**
 * 대화 태그 일치도: 두 채점자가 모두 태그를 붙인 대화에서, 태그마다 붙일 수 있는 자리(학생 메시지·AI 메시지·대화 전체)를
 * 붙임/안 붙임으로 비교해 정확 일치율과 카파(두 범주, 가중 카파와 같음)를 계산한다.
 * @param tags 태그 목록 [{ id, scope, label }]
 * @param convs 대화 목록 [{ key, messages }]
 * @param recordsA, recordsB { [대화 key]: { messages: { [번호]: [태그 id] }, conversation: [태그 id] } }
 */
export function tagAgreement(tags, convs, recordsA = {}, recordsB = {}) {
  const shared = convs.filter((c) => recordsA[c.key]?.doneAt && recordsB[c.key]?.doneAt);
  const rows = tags.map((tag) => {
    const pairs = [];
    shared.forEach((c) => {
      const a = recordsA[c.key];
      const b = recordsB[c.key];
      if (tag.scope === 'conversation') {
        pairs.push([Number(a.conversation.includes(tag.id)), Number(b.conversation.includes(tag.id))]);
        return;
      }
      c.messages.forEach((m, i) => {
        if (m.role !== tag.scope) return;
        pairs.push([Number((a.messages[i] ?? []).includes(tag.id)), Number((b.messages[i] ?? []).includes(tag.id))]);
      });
    });
    const exact = pairs.length ? pairs.filter(([x, y]) => x === y).length / pairs.length : null;
    return { id: tag.id, label: tag.label, n: pairs.length, countA: pairs.filter(([x]) => x).length, countB: pairs.filter(([, y]) => y).length, exact, kappa: weightedKappa(pairs, 1) };
  });
  return { conversations: shared.length, rows };
}
