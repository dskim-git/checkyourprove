// 펜 필기 입력 칸 (그림판): 펜, 획 지우개, 되돌리기, 칸 늘리기
// 손바닥 오입력을 막기 위해 기본으로 펜(애플펜슬 등)과 마우스만 그린다. 펜을 쓰기 전에는 손가락으로 밀면 화면이 움직이고,
// 펜을 한 번 쓰면 그때부터 필기 칸 위의 손가락·손바닥 터치는 모두 무시한다(화면은 칸 밖을 밀어 움직인다).
// 펜이 없는 기기는 "손가락으로도 쓰기"를 켜면 손가락으로 그릴 수 있다(켠 기록이 남는다).
// iPad Safari: 터치 이벤트를 막지 않으면 Scribble(손글씨 인식)·확대경 같은 시스템 동작이 펜 획을 가로채므로 칸 위의 터치 기본 동작을 막는다.

import {
  addStroke, canUndo, eraseStrokes, growInk, INK_MAX_HEIGHT, INK_START_HEIGHT, inkClock, inkStats,
  noteFinger, strokesNear, undoInk,
} from '../state/inkModel.js';
import { getPrefs } from '../state/prefsStore.js';
import { escapeHtml } from './dom.js';
import { icons } from './icons.js';
import { drawLive, fitCanvas, inkColor, renderInk } from './inkCanvas.js';

const LINE_PX = 2.6; // 화면에서 보이는 선 굵기(px)
const ERASER_PX = 12; // 지우개 반지름(px)
const MIN_STEP_PX = 0.8; // 이보다 가까운 점은 저장하지 않는다
const PALM_MS = 1500; // 펜을 뗀 뒤 이 시간 안의 손가락 입력은 손바닥으로 보고 무시한다
const PEN_HINT = '펜으로 쓰는 동안 손바닥이 닿아도 괜찮아요. 화면을 움직이려면 필기 칸 밖을 미세요.';

// 이 화면에서 펜 입력을 본 적이 있는가 (있으면 필기 칸 위의 손가락 터치를 손바닥으로 본다)
let penSeen = false;

/** 이 화면에서 펜(애플펜슬 등)으로 필기한 적이 있는가 */
export const penWasUsed = () => penSeen;

const hasTouchScreen = () => (navigator.maxTouchPoints ?? 0) > 0;

/** 필기 칸 HTML. labelledBy는 칸의 이름이 되는 요소 id */
export function inkPadHtml({ id, labelledBy }) {
  const touch = hasTouchScreen();
  return `<div class="ink-pad" id="${id}" data-ink-pad>
    <div class="ink-tools" role="toolbar" aria-label="필기 도구">
      <div class="ink-tools__group" role="group" aria-label="도구 고르기">
        <button type="button" class="ink-tool is-on" aria-pressed="true" data-ink-tool="pen">${icons.pencil}<span>펜</span></button>
        <button type="button" class="ink-tool" aria-pressed="false" data-ink-tool="eraser">${icons.eraser}<span>지우개</span></button>
      </div>
      <div class="ink-tools__group">
        <button type="button" class="ink-tool" data-ink-action="undo" disabled>${icons.undo}<span>되돌리기</span></button>
        <button type="button" class="ink-tool" data-ink-action="grow">${icons.grow}<span>칸 늘리기</span></button>
      </div>
    </div>
    <div class="ink-surface" data-tool="pen">
      <canvas class="ink-canvas" role="img" aria-labelledby="${escapeHtml(labelledBy)}" aria-describedby="${id}-hint"></canvas>
    </div>
    <div class="ink-foot">
      <label class="ink-finger"${touch ? '' : ' hidden'}><input type="checkbox" data-ink-finger><span>손가락으로도 쓰기</span></label>
      <span class="ink-count" data-ink-count aria-live="polite">획 0개</span>
    </div>
    <p class="ink-hint" id="${id}-hint" data-ink-hint>${touch
      ? '펜(애플펜슬)으로 쓰세요. 손가락으로 밀면 화면이 움직여요.'
      : '마우스로 쓸 수 있어요. 태블릿에서는 펜으로 쓰세요.'}</p>
  </div>`;
}

/**
 * 필기 칸을 연결한다.
 * getInk() 지금 필기 기록(없으면 null), ensureInk() 없으면 만들어 돌려줌,
 * onInput(type) 작성 과정 기록('ink' | 'deleteInk'), onChange() 저장 요청
 * @returns {{ refresh(): void, dispose(): void }}
 */
export function mountInkPad(el, { getInk, ensureInk, onInput, onChange }) {
  const surface = el.querySelector('.ink-surface');
  const canvas = el.querySelector('canvas');
  const countEl = el.querySelector('[data-ink-count]');
  const hintEl = el.querySelector('[data-ink-hint]');
  const fingerBox = el.querySelector('[data-ink-finger]');
  const undoBtn = el.querySelector('[data-ink-action="undo"]');
  const growBtn = el.querySelector('[data-ink-action="grow"]');
  let baseHint = hintEl.textContent;
  if (penSeen) {
    baseHint = PEN_HINT;
    hintEl.textContent = PEN_HINT;
  }

  let ctx = null;
  let scale = 1;
  let tool = 'pen';
  let active = null; // 그리는 중: { id, kind, t0, stamp, points, lw, pointerType } / 지우는 중: { id, kind, hits }
  let scrolling = null; // 손가락으로 화면 움직이는 중: { id, y, moved }
  let lastPenAt = 0;
  const lastFinger = getInk()?.ops.filter((op) => op.op === 'finger').at(-1);
  // 손가락으로도 쓰기: 이 필기에서 마지막으로 고른 값, 없으면 내 설정의 기본값
  let finger = lastFinger ? Boolean(lastFinger.on) : getPrefs().fingerDefault;
  if (fingerBox) fingerBox.checked = finger;

  const color = () => inkColor(canvas);
  const height = () => getInk()?.h ?? INK_START_HEIGHT;

  function paint() {
    renderInk(ctx, getInk(), { color: color(), hide: active?.kind === 'erase' ? active.hits : null });
  }

  function refreshUi() {
    const ink = getInk();
    countEl.textContent = `획 ${inkStats(ink).strokes}개`;
    undoBtn.disabled = !canUndo(ink);
    growBtn.disabled = height() >= INK_MAX_HEIGHT;
    surface.dataset.finger = String(finger);
  }

  function layout() {
    ({ ctx, scale } = fitCanvas(canvas, surface.clientWidth, height()));
    paint();
    refreshUi();
  }

  const toPoint = (event, stamp) => {
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale, t: Math.max(0, event.timeStamp - stamp) };
  };

  const setHint = (text) => { hintEl.textContent = text; };

  function capture(event) {
    try {
      canvas.setPointerCapture?.(event.pointerId);
    } catch {
      // 무시
    }
  }

  function eraseAt(point) {
    const ink = getInk();
    if (!ink) return;
    strokesNear(ink, point.x, point.y, ERASER_PX / scale).forEach((id) => active.hits.add(id));
    paint();
  }

  const onDown = (event) => {
    const type = event.pointerType || 'mouse';
    if (type === 'mouse' && event.button !== 0) return;
    if (type === 'touch' && !finger) {
      // 손바닥(펜을 쓰는 중, 방금 뗀 직후, 펜을 써 본 기기)은 무시하고, 아니면 화면을 움직인다.
      if (active || penSeen || Date.now() - lastPenAt < PALM_MS) return;
      scrolling = { id: event.pointerId, y: event.clientY, moved: 0 };
      capture(event);
      return;
    }
    if (active) {
      // 펜으로 쓰는 중에 닿은 손가락·손바닥, 같은 획의 중복 신호는 무시한다.
      if (active.id === event.pointerId || type === 'touch') return;
      // 앞 획의 "뗌" 신호를 놓친 경우: 앞 획을 마무리하고 새 획을 받는다(이후 획이 모두 막히지 않게).
      endActive(false);
    }
    scrolling = null;
    event.preventDefault();
    capture(event);
    if (type === 'pen') {
      lastPenAt = Date.now();
      if (!penSeen) {
        penSeen = true;
        baseHint = PEN_HINT;
      }
    }
    if (tool === 'eraser') {
      active = { id: event.pointerId, kind: 'erase', hits: new Set(), last: null };
      const point = toPoint(event, 0);
      active.last = point;
      eraseAt(point);
      return;
    }
    const ink = ensureInk();
    active = { id: event.pointerId, kind: 'draw', t0: inkClock(ink), stamp: event.timeStamp, points: [], lw: LINE_PX / scale, pointerType: type };
    const point = toPoint(event, active.stamp);
    active.points.push(point);
    drawLive(ctx, active.points, active.lw, color());
    if (hintEl.textContent !== baseHint) setHint(baseHint);
  };

  const onMove = (event) => {
    if (scrolling && event.pointerId === scrolling.id) {
      const dy = event.clientY - scrolling.y;
      scrolling.y = event.clientY;
      scrolling.moved += Math.abs(dy);
      window.scrollBy?.(0, -dy);
      return;
    }
    if (!active || event.pointerId !== active.id) return;
    event.preventDefault();
    if (active.pointerType === 'pen') lastPenAt = Date.now();
    const events = event.getCoalescedEvents?.() ?? [];
    (events.length ? events : [event]).forEach((e) => {
      if (active.kind === 'erase') {
        const point = toPoint(e, 0);
        // 빠르게 문질러도 빠지지 않게 앞 점과 사이를 촘촘히 확인한다
        const gap = Math.hypot(point.x - active.last.x, point.y - active.last.y);
        const steps = Math.ceil(gap / (ERASER_PX / scale / 2));
        for (let i = 1; i <= steps; i += 1) {
          eraseAt({ x: active.last.x + ((point.x - active.last.x) * i) / steps, y: active.last.y + ((point.y - active.last.y) * i) / steps });
        }
        active.last = point;
        return;
      }
      const point = toPoint(e, active.stamp);
      const prev = active.points.at(-1);
      if (Math.hypot(point.x - prev.x, point.y - prev.y) * scale < MIN_STEP_PX) return;
      active.points.push(point);
      drawLive(ctx, active.points, active.lw, color());
    });
  };

  const finish = (event) => {
    if (scrolling && event.pointerId === scrolling.id) {
      if (scrolling.moved < 6 && event.type === 'pointerup') {
        setHint('펜으로만 쓸 수 있어요. 펜이 없으면 아래의 "손가락으로도 쓰기"를 켜세요.');
      }
      scrolling = null;
      return;
    }
    if (!active || event.pointerId !== active.id) return;
    // 마지막 위치가 아직 반영되지 않았으면 더한다(빠르게 긋고 뗀 획의 끝이 잘리지 않게)
    if (active.kind === 'draw' && event.type === 'pointerup') {
      const point = toPoint(event, active.stamp);
      const prev = active.points.at(-1);
      if (Math.hypot(point.x - prev.x, point.y - prev.y) * scale >= MIN_STEP_PX) active.points.push(point);
    }
    endActive(event.type === 'pointercancel');
  };

  function endActive(cancelled) {
    const done = active;
    active = null;
    if (done.pointerType === 'pen') lastPenAt = Date.now();
    if (done.kind === 'erase') {
      if (done.hits.size) {
        eraseStrokes(getInk(), [...done.hits]);
        onInput('deleteInk');
        onChange();
      }
    } else {
      addStroke(getInk(), { t: done.t0, p: done.pointerType, lw: done.lw, points: done.points, cancelled });
      onInput('ink');
      onChange();
    }
    paint();
    refreshUi();
  }

  // 놓친 "뗌" 신호를 대신해 포인터 잡기가 풀리면 획을 마무리한다.
  const onLostCapture = (event) => {
    if (active && event.pointerId === active.id) endActive(false);
  };
  // 필기 칸 위의 터치 기본 동작(시스템 손글씨 인식, 확대경, 두 번 눌러 확대)을 막는다. 포인터 이벤트는 그대로 온다.
  const blockTouch = (event) => {
    if (event.cancelable) event.preventDefault();
  };

  const onClick = (event) => {
    const toolBtn = event.target.closest('[data-ink-tool]');
    if (toolBtn) {
      tool = toolBtn.dataset.inkTool;
      el.querySelectorAll('[data-ink-tool]').forEach((b) => {
        const on = b === toolBtn;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-pressed', String(on));
      });
      surface.dataset.tool = tool;
      return;
    }
    if (event.target.closest('[data-ink-action="undo"]')) {
      if (undoInk(getInk())) {
        onInput('deleteInk');
        onChange();
        paint();
        refreshUi();
      }
      return;
    }
    if (event.target.closest('[data-ink-action="grow"]')) {
      if (growInk(ensureInk())) {
        onChange();
        layout();
      }
    }
  };

  const onFinger = () => {
    finger = fingerBox.checked;
    noteFinger(ensureInk(), finger);
    setHint(finger ? '손가락으로도 쓸 수 있어요. 화면을 움직이려면 필기 칸 밖을 미세요.' : baseHint);
    onChange();
    refreshUi();
  };
  const noMenu = (event) => event.preventDefault();

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', finish);
  canvas.addEventListener('pointercancel', finish);
  canvas.addEventListener('contextmenu', noMenu);
  canvas.addEventListener('lostpointercapture', onLostCapture);
  ['touchstart', 'touchmove', 'touchend'].forEach((type) => canvas.addEventListener(type, blockTouch, { passive: false }));
  el.addEventListener('click', onClick);
  fingerBox?.addEventListener('change', onFinger);
  const observer = window.ResizeObserver ? new window.ResizeObserver(() => layout()) : null;
  observer?.observe(surface);
  layout();

  return {
    refresh: layout,
    dispose() {
      observer?.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', finish);
      canvas.removeEventListener('pointercancel', finish);
      canvas.removeEventListener('contextmenu', noMenu);
      canvas.removeEventListener('lostpointercapture', onLostCapture);
      ['touchstart', 'touchmove', 'touchend'].forEach((type) => canvas.removeEventListener(type, blockTouch));
      el.removeEventListener('click', onClick);
      fingerBox?.removeEventListener('change', onFinger);
    },
  };
}
