// 원리 활동 문항 카드: 학생 화면(principleView)과 교사 진행 화면(teacher/principlePaceView)이 함께 쓴다.

import { PRINCIPLE_ITEMS, PRINCIPLE_PARTS } from '../../data/principleActivity.js';
import { escapeHtml } from '../../ui/dom.js';
import { icons } from '../../ui/icons.js';

const pct = (p) => `${Math.round(p * 100)}%`;

export function visualHtml(v) {
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

/**
 * 문항 하나. ans: 학생이 처음 고른 답({ choice, correct }) 또는 없음.
 * reveal: 교사 화면처럼 정답과 설명을 바로 보여 줄 때 true (고르는 버튼은 꺼진다)
 * showNext: 학생 화면이면 true — "이전" 버튼(늘)과 답한 뒤 "다음"(마지막 문항은 "마무리로") 버튼을 둔다
 */
export function itemCardHtml(item, { ans = null, reveal = false, showNext = true } = {}) {
  const i = PRINCIPLE_ITEMS.indexOf(item);
  const part = PRINCIPLE_PARTS.find((p) => p.id === item.part);
  const partIndex = PRINCIPLE_PARTS.indexOf(part);
  const firstOfPart = PRINCIPLE_ITEMS.findIndex((x) => x.part === item.part) === i;
  const shown = ans || reveal;
  const visualFirst = item.visual && item.visual.kind !== 'probs';
  const opts = item.options.map((o, k) => {
    let cls = '';
    if (ans) cls = k === item.answer ? ' is-right' : k === ans.choice ? ' is-wrong' : ' is-dim';
    else if (reveal) cls = k === item.answer ? ' is-right' : ' is-dim';
    const mark = shown && k === item.answer ? icons.check : ans && k === ans.choice ? icons.x : '';
    return `<li><button type="button" class="pr-option${cls}" data-choice="${k}"${shown ? ' disabled' : ''}>${mark}<span>${escapeHtml(o)}</span></button></li>`;
  }).join('');
  return `<section class="pr-card" aria-labelledby="pr-q">
    <p class="pr-part"><span class="tag tag--strong">${partIndex + 1}. ${escapeHtml(part.title)}</span> <span class="meta">문항 ${i + 1} / ${PRINCIPLE_ITEMS.length}</span></p>
    ${firstOfPart && (!ans || reveal) ? `<p class="note-chip">${icons.info}<span>${escapeHtml(part.intro)}</span></p>` : ''}
    ${visualFirst ? visualHtml(item.visual) : ''}
    <h2 class="pr-q" id="pr-q">${escapeHtml(item.prompt)}</h2>
    ${item.context ? `<p class="pr-context">${escapeHtml(item.context)}</p>` : ''}
    <ul class="pr-options">${opts}</ul>
    ${shown ? `<div class="pr-feedback ${ans ? (ans.correct ? 'is-right' : 'is-wrong') : 'is-right'}" role="status">
        <p class="pr-feedback__title">${ans ? (ans.correct ? '맞았어요' : '아쉬워요') : '정답과 설명'}</p>
        <p>${escapeHtml(item.explain)}</p>
        ${item.visual?.kind === 'probs' ? visualHtml(item.visual) : ''}
      </div>
` : ''}
    ${showNext ? `<div class="actions pr-slide__nav">
      <button type="button" class="button button--secondary" data-action="prev">${icons.chevronLeft}<span>이전</span></button>
      ${ans ? `<button type="button" class="button button--primary" data-action="next">${i === PRINCIPLE_ITEMS.length - 1 ? '마무리로' : '다음'}</button>` : ''}
    </div>` : ''}
  </section>`;
}
