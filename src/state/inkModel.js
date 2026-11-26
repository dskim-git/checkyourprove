// 펜 필기 기록 (획 데이터). 화면 그리기는 ui/inkCanvas.js, 입력은 ui/inkPad.js가 맡는다.
//
// 필기 하나 = { v, w, h, startedAt, strokes, ops }
//   w, h       논리 좌표계의 폭(항상 INK_WIDTH)과 현재 높이. 화면 폭이 달라도 같은 좌표로 저장한다.
//   startedAt  필기를 처음 만든 시각(ISO). 획과 동작의 시각 t는 여기서부터 흐른 밀리초다.
//   strokes    그린 획 전부(지운 획도 남긴다). { id, t, p, lw, d }
//              p 입력 도구('pen' | 'touch' | 'mouse'), lw 선 굵기(논리 단위), c 1이면 기기가 획을 끊음(pointercancel),
//              d 점 목록 [x0, y0, 0, dx, dy, dt, ...] (첫 점은 절댓값, 다음 점은 앞 점과의 차이, 정수)
//   ops        그리기 외의 동작을 일어난 순서대로 { t, k, op, ... } (k: 그 동작 때까지 그린 획 수 = 획과 동작의 순서)
//              erase(지우개로 지운 획 ids), undo(되돌리기로 없앤 획 ids), restore(되돌리기로 살린 획 ids),
//              grow(칸 늘리기, 새 높이 h), finger(손가락으로 쓰기 켜고 끔, on)
// 이미지는 저장하지 않고 필요할 때 획 데이터로 만든다(브라우저 저장 용량 절약).

export const INK_WIDTH = 1000;
export const INK_START_HEIGHT = 700;
export const INK_GROW = 400;
export const INK_MAX_HEIGHT = 6000;

/** 2단계 옮겨 적기를 필기로 했을 때 "충분히 썼다"고 보는 최소 양 (보이는 획 수, 획 길이 합) */
export const INK_MIN_STROKES = 30;
export const INK_MIN_LENGTH = 3000;

export function createInk() {
  return { v: 1, w: INK_WIDTH, h: INK_START_HEIGHT, startedAt: new Date().toISOString(), strokes: [], ops: [] };
}

/** 필기를 시작한 뒤 흐른 시간(ms) */
export const inkClock = (ink) => Math.max(0, Date.now() - Date.parse(ink.startedAt));

/** 점 [{x, y, t}] (t는 획 시작부터 ms) → 정수 차이 목록 */
export function encodePoints(points) {
  const out = [];
  let px = 0;
  let py = 0;
  let pt = 0;
  points.forEach((point, i) => {
    const x = Math.round(point.x);
    const y = Math.round(point.y);
    const t = Math.round(point.t);
    if (i === 0) out.push(x, y, 0);
    else out.push(x - px, y - py, t - pt);
    px = x;
    py = y;
    pt = i === 0 ? 0 : t;
  });
  return out;
}

export function decodePoints(d = []) {
  const points = [];
  let x = 0;
  let y = 0;
  let t = 0;
  for (let i = 0; i + 2 < d.length; i += 3) {
    if (i === 0) {
      x = d[0];
      y = d[1];
      t = 0;
    } else {
      x += d[i];
      y += d[i + 1];
      t += d[i + 2];
    }
    points.push({ x, y, t });
  }
  return points;
}

/** 시각 until(ms)까지의 동작을 반영했을 때 지워진 획 id 모음 */
export function removedIds(ink, until = Infinity) {
  const removed = new Set();
  (ink?.ops ?? []).forEach((op) => {
    if (op.t > until) return;
    if (op.op === 'erase' || op.op === 'undo') op.ids.forEach((id) => removed.add(id));
    if (op.op === 'restore') op.ids.forEach((id) => removed.delete(id));
  });
  return removed;
}

/** 지금 보이는 획 */
export function visibleStrokes(ink) {
  if (!ink) return [];
  const removed = removedIds(ink);
  return ink.strokes.filter((s) => !removed.has(s.id));
}

export const hasInk = (ink) => visibleStrokes(ink).length > 0;

/** 보이는 획의 수와 길이 합(논리 단위) */
export function inkStats(ink) {
  const strokes = visibleStrokes(ink);
  let length = 0;
  strokes.forEach((s) => {
    const pts = decodePoints(s.d);
    for (let i = 1; i < pts.length; i += 1) length += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  });
  return { strokes: strokes.length, length: Math.round(length), total: ink?.strokes.length ?? 0 };
}

/** 2단계 옮겨 적기: 필기 양이 최소 기준 이상인가 (글자 비교는 할 수 없어 교사가 확인한다) */
export function inkEnough(ink) {
  const { strokes, length } = inkStats(ink);
  return strokes >= INK_MIN_STROKES && length >= INK_MIN_LENGTH;
}

/** 새 획을 덧붙인다. points는 [{x, y, t}] (t는 획 시작부터 ms) */
export function addStroke(ink, { t, p, lw, points, cancelled = false }) {
  const stroke = { id: ink.strokes.length, t: Math.round(t), p, lw: Math.round(lw * 10) / 10, d: encodePoints(points) };
  if (cancelled) stroke.c = 1;
  ink.strokes.push(stroke);
  return stroke;
}

const pushOp = (ink, op) => ink.ops.push({ t: inkClock(ink), k: ink.strokes.length, ...op });

/** 되돌리기 대상: 그리기와 지우기를 일어난 순서대로 쌓고 되돌리기마다 하나씩 꺼낸 뒤 맨 위 */
function actionStack(ink) {
  const stack = [];
  let drawn = 0;
  const drawUpTo = (k) => {
    for (; drawn < k; drawn += 1) stack.push({ kind: 'draw', ids: [drawn] });
  };
  ink.ops.forEach((op) => {
    drawUpTo(op.k ?? ink.strokes.length);
    if (op.op === 'erase') stack.push({ kind: 'erase', ids: op.ids });
    if (op.op === 'undo' || op.op === 'restore') stack.pop();
  });
  drawUpTo(ink.strokes.length);
  return stack;
}

export const canUndo = (ink) => Boolean(ink) && actionStack(ink).length > 0;

/** 마지막 그리기나 지우기를 되돌린다. 되돌렸으면 true */
export function undoInk(ink) {
  const top = actionStack(ink).at(-1);
  if (!top) return false;
  pushOp(ink, { op: top.kind === 'draw' ? 'undo' : 'restore', ids: top.ids });
  return true;
}

export function eraseStrokes(ink, ids) {
  if (!ids.length) return;
  pushOp(ink, { op: 'erase', ids });
}

export function growInk(ink) {
  if (ink.h >= INK_MAX_HEIGHT) return false;
  ink.h = Math.min(INK_MAX_HEIGHT, ink.h + INK_GROW);
  pushOp(ink, { op: 'grow', h: ink.h });
  return true;
}

export function noteFinger(ink, on) {
  pushOp(ink, { op: 'finger', on });
}

function segmentDistance(px, py, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  const k = len ? Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / len)) : 0;
  return Math.hypot(px - (a.x + k * dx), py - (a.y + k * dy));
}

/** (x, y)에서 반지름 r 안에 닿는 보이는 획 id (획 지우개) */
export function strokesNear(ink, x, y, r) {
  return visibleStrokes(ink).filter((s) => {
    const pts = decodePoints(s.d);
    const reach = r + s.lw / 2;
    if (pts.length === 1) return Math.hypot(x - pts[0].x, y - pts[0].y) <= reach;
    for (let i = 1; i < pts.length; i += 1) if (segmentDistance(x, y, pts[i - 1], pts[i]) <= reach) return true;
    return false;
  }).map((s) => s.id);
}

/** 재생용: 획의 점과 동작이 일어난 모든 시각(정렬됨) */
export function eventTimes(ink) {
  const times = [];
  ink.strokes.forEach((s) => decodePoints(s.d).forEach((pt) => times.push(s.t + pt.t)));
  ink.ops.forEach((op) => times.push(op.t));
  return times.sort((a, b) => a - b);
}
