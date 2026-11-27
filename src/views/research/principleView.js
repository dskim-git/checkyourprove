// AI와 탐구하기: "AI는 어떻게 답할까?" 원리 활동 (구현 5)
// 한 화면에 문항 하나. 처음 고른 답과 정답 여부, 고르기까지 걸린 시간을 기록하고 바로 설명을 보여 준다(다시 고르지 않음).
// 이어서 하면 아직 답하지 않은 첫 문항부터. 모든 문항 뒤 마무리 질문(서술)에 답하면 끝나고 1단계가 열린다.

import { PRINCIPLE_ITEMS, PRINCIPLE_PARTS, PRINCIPLE_REFLECTION, PRINCIPLE_VERSION } from '../../data/principleActivity.js';
import { getClassroom } from '../../state/classroomStore.js';
import { ensurePrinciple, getPrinciple, preStageBlocker, saveResearch } from '../../state/researchStore.js';
import { escapeHtml } from '../../ui/dom.js';
import { icons } from '../../ui/icons.js';
import { breadcrumb, notice } from '../../ui/components.js';

const TICK_MS = 5000;
const pct = (p) => `${Math.round(p * 100)}%`;

function visualHtml(v) {
  if (!v) return '';
  if (v.kind === 'probs') {
    return `<figure class="chart pr-probs"><figcaption class="chart__head"><span class="chart__title">AI가 계산한 다음 낱말의 확률</span></figcaption>
      <div class="barlist barlist--wide">${v.items.map(([w, p]) => `<div class="barlist__row"><span class="barlist__label">${escapeHtml(w)}</span><div class="barlist__track"><span class="barlist__bar" style="width:${pct(p)}" role="img" aria-label="${escapeHtml(`${w} ${pct(p)}`)}"></span><span class="barlist__value num">${pct(p)}</span></div></div>`).join('')}</div></figure>`;
  }
  if (v.kind === 'answers') return `<ol class="pr-answers">${v.items.map((t, i) => `<li><span class="meta">AI 답 ${i + 1}</span><div class="chat__body">${escapeHtml(t)}</div></li>`).join('')}</ol>`;
  if (v.kind === 'proof') return `<div class="proof-text pr-proof">${v.lines.map((l) => `<p>${escapeHtml(l)}</p>`).join('')}</div>`;
  if (v.kind === 'compare') return `<div class="pr-compare">${v.items.map((it) => `<div class="pr-compare__item"><p class="pr-compare__q">${escapeHtml(it.q)}</p><div class="chat__body">${escapeHtml(it.a)}</div></div>`).join('')}</div>`;
  return '';
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
  const rec = ensurePrinciple(PRINCIPLE_VERSION);
  saveResearch();
  const firstOpen = () => PRINCIPLE_ITEMS.findIndex((it) => !rec.answers[it.id]);
  let index = rec.finishedAt ? PRINCIPLE_ITEMS.length : (firstOpen() === -1 ? PRINCIPLE_ITEMS.length : firstOpen());
  let shownAt = Date.now();

  function itemScreen(item, i) {
    const part = PRINCIPLE_PARTS.find((p) => p.id === item.part);
    const partIndex = PRINCIPLE_PARTS.indexOf(part);
    const firstOfPart = PRINCIPLE_ITEMS.findIndex((x) => x.part === item.part) === i;
    const ans = rec.answers[item.id];
    const visualFirst = item.visual && item.visual.kind !== 'probs';
    const opts = item.options.map((o, k) => {
      let cls = '';
      if (ans) cls = k === item.answer ? ' is-right' : k === ans.choice ? ' is-wrong' : ' is-dim';
      return `<li><button type="button" class="pr-option${cls}" data-choice="${k}"${ans ? ' disabled' : ''}>${ans && k === item.answer ? icons.check : ans && k === ans.choice ? icons.x : ''}<span>${escapeHtml(o)}</span></button></li>`;
    }).join('');
    return `<section class="pr-card" aria-labelledby="pr-q">
      <p class="pr-part"><span class="tag tag--strong">${partIndex + 1}. ${escapeHtml(part.title)}</span></p>
      ${firstOfPart && !ans ? `<p class="note-chip">${icons.info}<span>${escapeHtml(part.intro)}</span></p>` : ''}
      ${visualFirst ? visualHtml(item.visual) : ''}
      <h2 class="pr-q" id="pr-q">${escapeHtml(item.prompt)}</h2>
      ${item.context ? `<p class="pr-context">${escapeHtml(item.context)}</p>` : ''}
      <ul class="pr-options">${opts}</ul>
      ${ans ? `<div class="pr-feedback ${ans.correct ? 'is-right' : 'is-wrong'}" role="status">
          <p class="pr-feedback__title">${ans.correct ? '맞았어요' : '아쉬워요'}</p>
          <p>${escapeHtml(item.explain)}</p>
          ${item.visual?.kind === 'probs' ? visualHtml(item.visual) : ''}
        </div>
        <div class="actions"><button type="button" class="button button--primary" data-action="next">${i === PRINCIPLE_ITEMS.length - 1 ? '마무리로' : '다음'}</button></div>` : ''}
    </section>`;
  }

  function endScreen() {
    const right = PRINCIPLE_ITEMS.filter((it) => rec.answers[it.id]?.correct).length;
    return `<section class="pr-card" aria-labelledby="pr-end">
      <h2 class="pr-q" id="pr-end">${rec.finishedAt ? '활동을 마쳤어요' : '마무리'}</h2>
      <p class="lead">${PRINCIPLE_ITEMS.length}문항 중 처음에 <strong class="num">${right}</strong>문항을 맞혔어요. 점수보다, AI는 그럴듯한 다음 낱말을 고르는 도구라서 틀릴 수 있다는 점을 기억하세요.</p>
      <div class="field">
        <label class="field__label" for="pr-reflect">${escapeHtml(PRINCIPLE_REFLECTION)} <span class="field__req">(필수)</span></label>
        ${rec.finishedAt ? `<p class="proof-text">${escapeHtml(rec.reflection)}</p>` : `<textarea id="pr-reflect" class="field__input" rows="3">${escapeHtml(rec.reflection ?? '')}</textarea>
        <p class="field__error" data-error-for="reflect" hidden></p>`}
      </div>
      <div class="actions">${rec.finishedAt ? '<a class="button button--primary" href="#/research">탐구 단계 목록으로</a>' : '<button type="button" class="button button--primary" data-action="finish">활동 마치기</button>'}</div>
    </section>`;
  }

  function draw() {
    const done = PRINCIPLE_ITEMS.filter((it) => rec.answers[it.id]).length;
    root.innerHTML = `<div class="page page--principle">
      ${breadcrumb(crumbs)}
      <header class="page-intro">
        <h1>AI는 어떻게 답할까?</h1>
        <p class="grade-who"><span class="tag">${escapeHtml(classroom.sessionLabel)}</span></p>
        <div class="pr-progress" role="progressbar" aria-label="진행" aria-valuemin="0" aria-valuemax="${PRINCIPLE_ITEMS.length}" aria-valuenow="${done}"><span style="width:${(done / PRINCIPLE_ITEMS.length) * 100}%"></span></div>
        <p class="meta">${done} / ${PRINCIPLE_ITEMS.length}</p>
      </header>
      ${index < PRINCIPLE_ITEMS.length ? itemScreen(PRINCIPLE_ITEMS[index], index) : endScreen()}
    </div>`;
    shownAt = Date.now();
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

  const onClick = (event) => {
    const opt = event.target.closest('[data-choice]');
    if (opt && index < PRINCIPLE_ITEMS.length) {
      const item = PRINCIPLE_ITEMS[index];
      if (rec.answers[item.id]) return;
      const choice = Number(opt.dataset.choice);
      rec.answers[item.id] = { choice, correct: choice === item.answer, at: new Date().toISOString(), ms: Date.now() - shownAt };
      saveResearch();
      draw();
      root.querySelector('.pr-feedback')?.setAttribute('tabindex', '-1');
      root.querySelector('.pr-feedback')?.focus();
      return;
    }
    if (event.target.closest('[data-action="next"]')) {
      index += 1;
      draw();
      root.querySelector('#pr-q, #pr-end')?.setAttribute('tabindex', '-1');
      root.querySelector('#pr-q, #pr-end')?.focus();
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

  draw();
  root.addEventListener('click', onClick);
  root.addEventListener('input', onInput);
  return () => {
    tick();
    window.clearInterval(timer);
    if (!rec.finishedAt) saveResearch();
    root.removeEventListener('click', onClick);
    root.removeEventListener('input', onInput);
  };
}
