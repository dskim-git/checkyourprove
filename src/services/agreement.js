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
