// 펜 필기 그리기: 캔버스에 획을 그리고, 작성 과정을 다시 보여 주고, 필요할 때 이미지를 만든다.
// 좌표는 논리 단위(폭 INK_WIDTH)로 저장되어 있으므로 캔버스 폭에 맞춰 늘이거나 줄여 그린다.

import { decodePoints, eventTimes, INK_START_HEIGHT, INK_WIDTH, inkStats, removedIds } from '../state/inkModel.js';
import { escapeHtml } from './dom.js';
import { icons } from './icons.js';

const decoded = new WeakMap();
const pointsOf = (stroke) => {
  if (!decoded.has(stroke)) decoded.set(stroke, decodePoints(stroke.d));
  return decoded.get(stroke);
};

/** 글자색 토큰(--color-ink)을 캔버스가 물려받은 색에서 읽는다. */
export const inkColor = (el) => (el && window.getComputedStyle ? window.getComputedStyle(el).color : '') || 'black';

/**
 * 캔버스 크기를 화면 폭(cssWidth)과 논리 높이에 맞춘다. 그리기 좌표는 논리 단위가 된다.
 * @returns {{ ctx: CanvasRenderingContext2D | null, scale: number }}
 */
export function fitCanvas(canvas, cssWidth, logicalHeight) {
  const scale = cssWidth > 0 ? cssWidth / INK_WIDTH : 1;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const cssHeight = Math.round(logicalHeight * scale);
  canvas.style.height = `${cssHeight}px`;
  canvas.width = Math.max(1, Math.round(cssWidth * dpr));
  canvas.height = Math.max(1, Math.round(cssHeight * dpr));
  let ctx = null;
  try {
    ctx = canvas.getContext('2d');
  } catch {
    ctx = null;
  }
  ctx?.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
  return { ctx, scale };
}

const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

function setPen(ctx, lw, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

/** 점들을 부드러운 곡선으로 잇는다(이웃한 두 점의 가운데를 지나는 2차 곡선). */
function strokeLine(ctx, pts, lw, color) {
  if (!pts.length) return;
  setPen(ctx, lw, color);
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  if (pts.length === 1) ctx.lineTo(pts[0].x + 0.1, pts[0].y);
  else if (pts.length === 2) ctx.lineTo(pts[1].x, pts[1].y);
  else {
    const first = mid(pts[0], pts[1]);
    ctx.lineTo(first.x, first.y);
    for (let i = 1; i < pts.length - 1; i += 1) {
      const end = mid(pts[i], pts[i + 1]);
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, end.x, end.y);
    }
    ctx.lineTo(pts.at(-1).x, pts.at(-1).y);
  }
  ctx.stroke();
}

/**
 * 필기를 그린다.
 * until: 이 시각(ms)까지의 모습만 그린다(재생용). hide: 잠시 가릴 획 id(지우개로 지우는 중).
 */
export function renderInk(ctx, ink, { color, until = Infinity, hide = null, clear = true } = {}) {
  if (!ctx) return;
  if (clear) ctx.clearRect(0, 0, INK_WIDTH, ink?.h ?? INK_START_HEIGHT);
  if (!ink) return;
  const removed = removedIds(ink, until);
  ink.strokes.forEach((stroke) => {
    if (stroke.t > until || removed.has(stroke.id) || hide?.has(stroke.id)) return;
    let pts = pointsOf(stroke);
    if (until !== Infinity) pts = pts.filter((pt) => stroke.t + pt.t <= until);
    strokeLine(ctx, pts, stroke.lw, color);
  });
}

/** 그리는 중인 획의 새 구간만 덧그린다(strokeLine과 같은 곡선). 끝 구간은 획을 마친 뒤 다시 그릴 때 채워진다. */
export function drawLive(ctx, pts, lw, color) {
  if (!ctx || !pts.length) return;
  const n = pts.length;
  setPen(ctx, lw, color);
  ctx.beginPath();
  if (n === 1) {
    ctx.moveTo(pts[0].x, pts[0].y);
    ctx.lineTo(pts[0].x + 0.1, pts[0].y);
  } else if (n === 2) {
    const m = mid(pts[0], pts[1]);
    ctx.moveTo(pts[0].x, pts[0].y);
    ctx.lineTo(m.x, m.y);
  } else {
    const from = mid(pts[n - 3], pts[n - 2]);
    const to = mid(pts[n - 2], pts[n - 1]);
    ctx.moveTo(from.x, from.y);
    ctx.quadraticCurveTo(pts[n - 2].x, pts[n - 2].y, to.x, to.y);
  }
  ctx.stroke();
}

/** 필기 이미지(PNG data URL)를 만든다. 저장하지 않고 필요할 때만 만든다. */
export function inkImage(ink, { width = 1200, color = 'black', background = 'white' } = {}) {
  const canvas = document.createElement('canvas');
  const scale = width / INK_WIDTH;
  canvas.width = width;
  canvas.height = Math.round((ink?.h ?? INK_START_HEIGHT) * scale);
  const ctx = canvas.getContext?.('2d');
  if (!ctx) return '';
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  renderInk(ctx, ink, { color, clear: false });
  return canvas.toDataURL('image/png');
}

// ── 다시 보기(재생) ──────────────────────────

const REPLAY_SPEED = 3;
const REPLAY_GAP = 350;

export const clockText = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** 작성 과정을 빠르게 다시 그린다. 획 사이의 긴 쉼은 짧게 줄인다. */
function createReplay(paint, ink, { onTick, onEnd }) {
  const times = eventTimes(ink);
  const end = times.at(-1) ?? 0;
  let clock = 0;
  let last = 0;
  let frame = 0;
  const nextAfter = (t) => {
    let lo = 0;
    let hi = times.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (times[mid] <= t) lo = mid + 1;
      else hi = mid;
    }
    return times[lo];
  };
  const step = (now) => {
    clock += (now - last) * REPLAY_SPEED;
    last = now;
    const next = nextAfter(clock);
    if (next !== undefined && next - clock > REPLAY_GAP) clock = next - REPLAY_GAP;
    if (clock >= end) {
      paint(Infinity);
      onTick(end, end);
      frame = 0;
      onEnd();
      return;
    }
    paint(clock);
    onTick(clock, end);
    frame = window.requestAnimationFrame(step);
  };
  return {
    start() {
      clock = (times[0] ?? 0) - 1;
      last = performance.now();
      paint(clock);
      frame = window.requestAnimationFrame(step);
    },
    stop() {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
    },
    get running() { return frame !== 0; },
  };
}

// ── 읽기 전용 필기 보기 ────────────────────

/** 읽기 전용 필기 칸. key로 mountInkViews가 필기 기록을 찾는다. (dd 안에 들어가므로 태그 사이 공백을 두지 않는다) */
export function inkViewHtml(key, ink) {
  const { strokes } = inkStats(ink);
  return `<figure class="ink-view" data-ink-view="${escapeHtml(key)}">`
    + `<div class="ink-view__paper"><canvas class="ink-canvas" role="img" aria-label="펜으로 쓴 필기, 획 ${strokes}개"></canvas></div>`
    + '<figcaption class="ink-view__bar">'
    + `<button type="button" class="button button--small" data-ink-play>${icons.play}<span>작성 과정 다시 보기</span></button>`
    + '<span class="ink-view__time num" data-ink-time aria-live="off"></span>'
    + `<button type="button" class="button button--small button--ghost" data-ink-save>${icons.download}<span>이미지</span><span class="visually-hidden">로 받기</span></button>`
    + '</figcaption></figure>';
}

/** 화면 안의 읽기 전용 필기 칸을 그리고 다시 보기·이미지 버튼을 연결한다. resolve(key) → 필기 기록 */
export function mountInkViews(root, resolve) {
  const disposers = [...root.querySelectorAll('[data-ink-view]')].map((figure) => {
    const ink = resolve(figure.dataset.inkView);
    const canvas = figure.querySelector('canvas');
    const paper = figure.querySelector('.ink-view__paper');
    const play = figure.querySelector('[data-ink-play]');
    const time = figure.querySelector('[data-ink-time]');
    if (!ink) return () => {};
    let ctx = null;
    let until = Infinity;
    const paint = (t) => {
      until = t;
      renderInk(ctx, ink, { color: inkColor(canvas), until: t });
    };
    const layout = () => {
      ({ ctx } = fitCanvas(canvas, paper.clientWidth, ink.h));
      paint(until);
    };
    const total = eventTimes(ink).at(-1) ?? 0;
    const showTotal = () => { time.innerHTML = `<span class="visually-hidden">작성 시간 </span>${clockText(total)}`; };
    showTotal();
    const setPlaying = (on) => {
      play.innerHTML = on ? `${icons.stop}<span>멈추기</span>` : `${icons.play}<span>작성 과정 다시 보기</span>`;
      play.setAttribute('aria-pressed', String(on));
    };
    const replay = createReplay(paint, ink, {
      onTick: (t, end) => { time.textContent = `${clockText(t)} / ${clockText(end)}`; },
      onEnd: () => setPlaying(false),
    });
    const onClick = (event) => {
      if (event.target.closest('[data-ink-play]')) {
        if (replay.running) {
          replay.stop();
          paint(Infinity);
          showTotal();
          setPlaying(false);
        } else {
          setPlaying(true);
          replay.start();
        }
      }
      if (event.target.closest('[data-ink-save]')) {
        const url = inkImage(ink, { color: inkColor(canvas) });
        if (!url) return;
        const link = document.createElement('a');
        link.href = url;
        link.download = `필기-${figure.dataset.inkView.replace(/\|/g, '-')}.png`;
        link.click();
      }
    };
    figure.addEventListener('click', onClick);
    const observer = window.ResizeObserver ? new window.ResizeObserver(layout) : null;
    observer?.observe(paper);
    layout();
    return () => {
      replay.stop();
      observer?.disconnect();
      figure.removeEventListener('click', onClick);
    };
  });
  return () => disposers.forEach((dispose) => dispose());
}
