// AI와 탐구하기: "AI는 어떻게 답할까?" 원리 활동 (구현 5)
// 설명 5장(AI가 답하는 원리를 그림·움직임으로) → 문항 11개 → 마무리. 한 화면에 하나.
// 문항은 처음 고른 답과 정답 여부, 고르기까지 걸린 시간을 기록하고 바로 설명을 보여 준다(다시 고르지 않음).
// 설명 화면은 "다음"을 누른 때와 머문 시간을 기록한다. 이어서 하면 아직 하지 않은 첫 화면부터.
// 교사 진행 제어(state/pacingStore.js)가 켜져 있으면 교사가 연 화면까지만 가고, 그다음은 기다리는 화면이 나온다.
// 모든 문항 뒤 마무리 질문(서술)에 답하면 끝나고 1단계가 열린다.

import { PRINCIPLE_ITEMS, PRINCIPLE_REFLECTION, PRINCIPLE_SLIDES, PRINCIPLE_STEPS, PRINCIPLE_VERSION } from '../../data/principleActivity.js';
import { getClassroom } from '../../state/classroomStore.js';
import { getPacing, subscribePacing } from '../../state/pacingStore.js';
import { ensurePrinciple, getPrinciple, preStageBlocker, saveResearch } from '../../state/researchStore.js';
import { escapeHtml } from '../../ui/dom.js';
import { icons } from '../../ui/icons.js';
import { breadcrumb, notice } from '../../ui/components.js';
import { itemCardHtml } from './principleParts.js';
import { mountSlide, slideHtml } from './principleSlides.js';

const TICK_MS = 5000;
const LAST = PRINCIPLE_STEPS.length - 1;

/** 설명 화면에 이전·다음 버튼을 붙인다 */
function withSlideNav(html, { prev, last }) {
  return html.replace(/<\/section>\s*$/, `
    <div class="actions pr-slide__nav">
      ${prev ? `<button type="button" class="button button--secondary" data-action="prev">${icons.chevronLeft}<span>이전</span></button>` : ''}
      <button type="button" class="button button--primary" data-action="next">${last ? '문제 풀러 가기' : '다음'}</button>
    </div>
  </section>`);
}

export function renderPrinciple(root) {
  const classroom = getClassroom();
  const crumbs = [{ label: '홈', href: '#/' }, { label: 'AI와 탐구하기', href: '#/research' }, { label: 'AI는 어떻게 답할까?' }];
  const blocker = preStageBlocker(classroom);
  if (!getPrinciple()?.finishedAt && (!classroom.principleOpen || (blocker && blocker.step !== 'principle'))) {
    root.innerHTML = `<div class="page">${breadcrumb(crumbs)}<h1>AI는 어떻게 답할까?</h1>
      ${notice('lock', '아직 할 수 없어요', !classroom.principleOpen ? '선생님이 이 활동을 열지 않았어요.' : blocker.label)}
      <p><a class="button button--secondary" href="#/research">탐구 단계 목록으로</a></p></div>`;
    return null;
  }
  const { sessionId } = classroom;
  const rec = ensurePrinciple(PRINCIPLE_VERSION);
  rec.slides ??= {};
  saveResearch();
  const isDone = (step) => (step.kind === 'slide' ? !!rec.slides[step.id] : step.kind === 'item' ? !!rec.answers[step.id] : !!rec.finishedAt);
  const firstOpen = PRINCIPLE_STEPS.findIndex((st) => !isDone(st));
  let index = rec.finishedAt || firstOpen === -1 ? LAST : firstOpen;
  let shownAt = Date.now();
  let pacing = getPacing(sessionId);
  let unmountSlide = null;
  const locked = (i) => !rec.finishedAt && pacing.paced && i > pacing.openUpTo;

  function waitScreen() {
    return `<section class="pr-card pr-wait" aria-labelledby="pr-q">
      <div class="pr-wait__dots" aria-hidden="true"><span></span><span></span><span></span></div>
      <h2 class="pr-q" id="pr-q">선생님이 다음 화면을 열 때까지 기다려요</h2>
      <p class="lead">선생님의 설명을 들으며 앞 화면을 다시 살펴보세요. 선생님이 열면 자동으로 넘어가요.</p>
      <div class="actions"><button type="button" class="button button--secondary" data-action="prev">${icons.chevronLeft}<span>앞 화면 다시 보기</span></button></div>
    </section>`;
  }

  function endScreen() {
    const right = PRINCIPLE_ITEMS.filter((it) => rec.answers[it.id]?.correct).length;
    return `<section class="pr-card" aria-labelledby="pr-q">
      <h2 class="pr-q" id="pr-q">${rec.finishedAt ? '활동을 마쳤어요' : '마무리'}</h2>
      <p class="lead">${PRINCIPLE_ITEMS.length}문항 중 처음에 <strong class="num">${right}</strong>문항을 맞혔어요. 점수보다, AI는 그럴듯한 다음 낱말을 고르는 도구라서 틀릴 수 있다는 점을 기억하세요.</p>
      <div class="field">
        <label class="field__label" for="pr-reflect">${escapeHtml(PRINCIPLE_REFLECTION)} <span class="field__req">(필수)</span></label>
        ${rec.finishedAt ? `<p class="proof-text">${escapeHtml(rec.reflection)}</p>` : `<textarea id="pr-reflect" class="field__input" rows="3">${escapeHtml(rec.reflection ?? '')}</textarea>
        <p class="field__error" data-error-for="reflect" hidden></p>`}
      </div>
      <div class="actions">${rec.finishedAt ? '<a class="button button--primary" href="#/research">탐구 단계 목록으로</a>' : '<button type="button" class="button button--primary" data-action="finish">활동 마치기</button>'}</div>
    </section>`;
  }

  function screen() {
    if (locked(index)) return waitScreen();
    const step = PRINCIPLE_STEPS[index];
    if (step.kind === 'slide') {
      const n = PRINCIPLE_SLIDES.findIndex((sl) => sl.id === step.id);
      return withSlideNav(slideHtml(PRINCIPLE_SLIDES[n], n + 1, PRINCIPLE_SLIDES.length), { prev: index > 0, last: n === PRINCIPLE_SLIDES.length - 1 });
    }
    if (step.kind === 'item') {
      const item = PRINCIPLE_ITEMS.find((it) => it.id === step.id);
      return itemCardHtml(item, { ans: rec.answers[item.id] });
    }
    return endScreen();
  }

  function draw({ focus = false } = {}) {
    unmountSlide?.();
    unmountSlide = null;
    const slidesSeen = PRINCIPLE_SLIDES.filter((sl) => rec.slides[sl.id]).length;
    const answered = PRINCIPLE_ITEMS.filter((it) => rec.answers[it.id]).length;
    const total = PRINCIPLE_SLIDES.length + PRINCIPLE_ITEMS.length;
    root.innerHTML = `<div class="page page--principle">
      ${breadcrumb(crumbs)}
      <header class="page-intro">
        <h1>AI는 어떻게 답할까?</h1>
        <p class="grade-who"><span class="tag">${escapeHtml(classroom.sessionLabel)}</span>${pacing.paced && !rec.finishedAt ? ' <span class="tag tag--strong">선생님과 함께 진행</span>' : ''}</p>
        <div class="pr-progress" role="progressbar" aria-label="진행" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${slidesSeen + answered}"><span style="width:${((slidesSeen + answered) / total) * 100}%"></span></div>
        <p class="meta">설명 ${slidesSeen} / ${PRINCIPLE_SLIDES.length} · 문항 ${answered} / ${PRINCIPLE_ITEMS.length}</p>
      </header>
      ${screen()}
    </div>`;
    if (!locked(index) && PRINCIPLE_STEPS[index].kind === 'slide') unmountSlide = mountSlide(root);
    shownAt = Date.now();
    if (focus) {
      const h = root.querySelector('#pr-q');
      h?.setAttribute('tabindex', '-1');
      h?.focus();
    }
  }

  let lastTick = Date.now();
  const tick = () => {
    const t = Date.now();
    if (!rec.finishedAt && document.visibilityState !== 'hidden') rec.activeMs += Math.min(t - lastTick, TICK_MS * 3);
    lastTick = t;
  };
  const timer = window.setInterval(() => {
    tick();
    if (!rec.finishedAt) saveResearch();
  }, TICK_MS);

  const go = (next) => {
    index = Math.max(0, Math.min(LAST, next));
    draw({ focus: true });
  };

  const onClick = (event) => {
    const step = PRINCIPLE_STEPS[index];
    const opt = event.target.closest('[data-choice]');
    if (opt && step.kind === 'item' && !locked(index)) {
      const item = PRINCIPLE_ITEMS.find((it) => it.id === step.id);
      if (rec.answers[item.id]) return;
      const choice = Number(opt.dataset.choice);
      rec.answers[item.id] = { choice, correct: choice === item.answer, at: new Date().toISOString(), ms: Date.now() - shownAt };
      saveResearch();
      draw();
      root.querySelector('.pr-feedback')?.setAttribute('tabindex', '-1');
      root.querySelector('.pr-feedback')?.focus();
      return;
    }
    if (event.target.closest('[data-action="prev"]')) {
      go(index - 1);
      return;
    }
    if (event.target.closest('[data-action="next"]')) {
      if (step.kind === 'slide' && !locked(index)) {
        const seen = rec.slides[step.id];
        const ms = Date.now() - shownAt;
        rec.slides[step.id] = seen ? { ...seen, ms: seen.ms + ms } : { at: new Date().toISOString(), ms };
        saveResearch();
      }
      go(index + 1);
      return;
    }
    if (event.target.closest('[data-action="finish"]')) {
      const text = root.querySelector('#pr-reflect').value.trim();
      if (!text) {
        const slot = root.querySelector('[data-error-for="reflect"]');
        slot.hidden = false;
        slot.textContent = '한 가지를 쓰세요.';
        root.querySelector('#pr-reflect').focus();
        return;
      }
      tick();
      rec.reflection = text;
      rec.finishedAt = new Date().toISOString();
      saveResearch();
      window.location.hash = '#/research';
    }
  };
  const onInput = (event) => {
    if (event.target.id === 'pr-reflect') rec.reflection = event.target.value;
  };
  // 교사가 화면을 열거나 닫으면: 지금 화면의 잠김이나 진행 제어 켜짐이 바뀔 때만 다시 그린다(쓰던 마무리 글은 rec에 남아 있다)
  const unsubscribe = subscribePacing(sessionId, (next) => {
    const before = locked(index);
    const wasPaced = pacing.paced;
    pacing = next;
    if (before !== locked(index) || wasPaced !== pacing.paced) draw({ focus: before && !locked(index) });
  });

  draw();
  root.addEventListener('click', onClick);
  root.addEventListener('input', onInput);
  return () => {
    tick();
    window.clearInterval(timer);
    unsubscribe();
    unmountSlide?.();
    if (!rec.finishedAt) saveResearch();
    root.removeEventListener('click', onClick);
    root.removeEventListener('input', onInput);
  };
}
