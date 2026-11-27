// 교사 분석 화면의 차트 부품 (HTML로 그려 화면 폭에 맞게 늘어난다)
// 규칙: 색은 토큰으로만(styles/views.css의 --color-chart-*), 세 단계는 색과 모양을 함께 다르게(빈 원·마름모·채운 원),
// 2개 이상 계열이면 범례, 모든 표시는 마우스·키보드 초점에 설명(data-tip)이 뜨고, "표로 보기"로 같은 값을 표로 볼 수 있다.

import { escapeHtml } from './dom.js';

/** 단계 계열: 1단계 나의 증명, 2단계 AI 증명, 4단계 최종 증명 */
export const STAGE_SERIES = [
  { key: 1, label: '1단계 나의 증명', short: '나', cls: 'mine' },
  { key: 2, label: '2단계 AI 증명', short: 'AI', cls: 'ai' },
  { key: 4, label: '4단계 최종 증명', short: '최종', cls: 'final' },
];

const pct = (v, max) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
const fmt = (v) => (v == null ? '–' : Number.isInteger(v) ? String(v) : v.toFixed(1));

export const legend = (series = STAGE_SERIES) => `<ul class="chart-legend" aria-label="범례">${series.map((s) => `<li><span class="chart-key chart-key--${s.cls}" aria-hidden="true"></span>${escapeHtml(s.label)}</li>`).join('')}</ul>`;

/**
 * 점그래프: 행마다 계열 값을 한 축(0~max) 위의 점으로 놓고, 가장 낮은 값과 높은 값 사이를 가는 선으로 잇는다.
 * rows: [{ label, values: { [계열 key]: number|null } }]
 */
export function dotPlot({ title, rows, max, min = 0, unit = '점', series = STAGE_SERIES, ticks = null, note = '' }) {
  const at = (v) => pct(v - min, max - min);
  const tickList = ticks ?? Array.from({ length: max + 1 }, (_, i) => i).filter((i) => max <= 10 || i % 2 === 0);
  const body = rows.map((row) => {
    const vals = series.map((s) => row.values[s.key]).filter((v) => v != null);
    const lo = vals.length ? Math.min(...vals) : null;
    const hi = vals.length ? Math.max(...vals) : null;
    const marks = series.map((s, i) => {
      const v = row.values[s.key];
      if (v == null) return '';
      const tip = `${row.label}, ${s.label}: ${fmt(v)}${unit}`;
      return `<span class="dot dot--${s.cls}" style="left:${at(v)};--lane:${i - 1}" tabindex="0" role="img" aria-label="${escapeHtml(tip)}" data-tip="${escapeHtml(tip)}"></span>`;
    }).join('');
    const missing = series.filter((s) => row.values[s.key] == null).map((s) => s.short);
    return `<div class="dotplot__row">
      <span class="dotplot__label">${escapeHtml(row.label)}${missing.length && missing.length < series.length ? `<span class="dotplot__missing">${escapeHtml(missing.join(', '))} 채점 전</span>` : ''}</span>
      <div class="dotplot__track">
        ${tickList.map((t) => `<span class="dotplot__grid" style="left:${at(t)}" aria-hidden="true"></span>`).join('')}
        ${lo != null && hi > lo ? `<span class="dotplot__range" style="left:${at(lo)};width:calc(${at(hi)} - ${at(lo)})" aria-hidden="true"></span>` : ''}
        ${vals.length ? marks : '<span class="dotplot__empty">채점 전</span>'}
      </div>
    </div>`;
  }).join('');
  const axis = `<div class="dotplot__row dotplot__row--axis" aria-hidden="true"><span></span><div class="dotplot__axis">${tickList.map((t) => `<span style="left:${at(t)}">${t}</span>`).join('')}</div></div>`;
  const table = `<details class="chart-table"><summary>표로 보기</summary><div class="table-wrap"><table class="data-table data-table--compact">
      <thead><tr><th scope="col"></th>${series.map((s) => `<th scope="col">${escapeHtml(s.label)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((r) => `<tr><th scope="row">${escapeHtml(r.label)}</th>${series.map((s) => `<td class="num">${fmt(r.values[s.key])}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div></details>`;
  return `<figure class="chart">
    <figcaption class="chart__head"><span class="chart__title">${escapeHtml(title)}</span>${legend(series)}</figcaption>
    ${note ? `<p class="meta">${escapeHtml(note)}</p>` : ''}
    <div class="dotplot">${body}${axis}</div>
    ${table}
  </figure>`;
}

/** 가로 막대: rows [{ label, value, sub? }], 한 계열이라 범례 없음(제목이 말한다) */
export function barList({ title, rows, unit = '', max = null, wide = false }) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value ?? 0));
  return `<figure class="chart">
    <figcaption class="chart__head"><span class="chart__title">${escapeHtml(title)}</span></figcaption>
    <div class="barlist${wide ? ' barlist--wide' : ''}">${rows.map((r) => {
      const tip = `${r.label}: ${fmt(r.value)}${unit}${r.sub ? `, ${r.sub}` : ''}`;
      return `<div class="barlist__row">
        <span class="barlist__label">${escapeHtml(r.label)}</span>
        <div class="barlist__track"><span class="barlist__bar" style="width:${pct(r.value ?? 0, top)}"${r.value ? ` tabindex="0" role="img" aria-label="${escapeHtml(tip)}" data-tip="${escapeHtml(tip)}"` : ' aria-hidden="true"'}></span><span class="barlist__value num">${fmt(r.value)}${escapeHtml(unit)}</span></div>
        ${r.sub ? `<span class="barlist__sub meta">${escapeHtml(r.sub)}</span>` : ''}
      </div>`;
    }).join('')}</div>
  </figure>`;
}

/** 산점도: points [{ x, y, label }] (한 계열) — x, y 축 범위 [min, max], 0 기준선. 같은 자리의 점은 하나로 합쳐 개수를 표시한다. */
export function scatter({ title, points, x, y, xLabel, yLabel, note = '' }) {
  const px = (v) => pct(v - x[0], x[1] - x[0]);
  const py = (v) => pct(v - y[0], y[1] - y[0]);
  const xTicks = Array.from({ length: (x[1] - x[0]) / 2 + 1 }, (_, i) => x[0] + i * 2);
  const yTicks = Array.from({ length: (y[1] - y[0]) / 2 + 1 }, (_, i) => y[0] + i * 2);
  return `<figure class="chart">
    <figcaption class="chart__head"><span class="chart__title">${escapeHtml(title)}</span></figcaption>
    ${note ? `<p class="meta">${escapeHtml(note)}</p>` : ''}
    <div class="scatter">
      <span class="scatter__ylabel">세로: ${escapeHtml(yLabel)}</span>
      <div class="scatter__plot">
        ${yTicks.map((t) => `<span class="scatter__hgrid${t === 0 ? ' is-zero' : ''}" style="bottom:${py(t)}" aria-hidden="true"><span>${t}</span></span>`).join('')}
        ${xTicks.map((t) => `<span class="scatter__vgrid${t === 0 ? ' is-zero' : ''}" style="left:${px(t)}" aria-hidden="true"><span>${t}</span></span>`).join('')}
        ${[...points.reduce((m, p) => {
          const k = `${p.x}|${p.y}`;
          m.set(k, [...(m.get(k) ?? []), p]);
          return m;
        }, new Map()).values()].map((group) => {
          const p = group[0];
          const n = group.length;
          const tip = `${xLabel} ${fmt(p.x)}, ${yLabel} ${fmt(p.y)}: ${group.map((g) => g.label).join(', ')}`;
          return `<span class="scatter__dot${n > 1 ? ' is-many' : ''}" style="left:${px(p.x)};bottom:${py(p.y)};--n:${Math.min(n, 6)}" tabindex="0" role="img" aria-label="${escapeHtml(tip)}" data-tip="${escapeHtml(tip)}">${n > 1 ? `<span aria-hidden="true">${n}</span>` : ''}</span>`;
        }).join('')}
      </div>
      <span class="scatter__xlabel">가로: ${escapeHtml(xLabel)}</span>
    </div>
    <details class="chart-table"><summary>표로 보기</summary><div class="table-wrap"><table class="data-table data-table--compact">
      <thead><tr><th scope="col"></th><th scope="col">${escapeHtml(xLabel)}</th><th scope="col">${escapeHtml(yLabel)}</th></tr></thead>
      <tbody>${points.map((p) => `<tr><th scope="row">${escapeHtml(p.label)}</th><td class="num">${fmt(p.x)}</td><td class="num">${fmt(p.y)}</td></tr>`).join('')}</tbody>
    </table></div></details>
  </figure>`;
}

/** 얇은 나눔 막대(글 없음): 나의 답변 / AI 답변 비율 */
export const splitBar = (mine) => (mine == null ? '' : `<span class="splitbar" role="img" aria-label="나의 답변 ${mine * 10}%, AI의 답변 ${100 - mine * 10}%"><span class="splitbar__mine" style="width:${mine * 10}%"></span><span class="splitbar__ai" style="width:${100 - mine * 10}%"></span></span>`);

/** 요약 수치 한 줄 */
export function statTiles(tiles) {
  return `<dl class="stat-tiles">${tiles.map((t) => `<div class="stat-tile">
    <dt>${escapeHtml(t.label)}</dt>
    <dd><span class="stat-tile__value">${escapeHtml(t.value)}</span>${t.sub ? `<span class="stat-tile__sub">${escapeHtml(t.sub)}</span>` : ''}</dd>
  </div>`).join('')}</dl>`;
}

/** 차트 설명 말풍선: [data-tip]에 마우스를 올리거나 초점이 가면 보인다(글은 textContent로 넣는다) */
export function bindChartTips(root) {
  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  tip.setAttribute('role', 'status');
  tip.hidden = true;
  document.body.append(tip);
  const show = (el) => {
    tip.textContent = el.dataset.tip;
    tip.hidden = false;
    const r = el.getBoundingClientRect();
    const w = tip.offsetWidth;
    tip.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2))}px`;
    tip.style.top = `${Math.max(8, r.top - tip.offsetHeight - 10)}px`;
  };
  const onOver = (e) => {
    const el = e.target.closest?.('[data-tip]');
    if (el && root.contains(el)) show(el);
  };
  const onOut = (e) => {
    if (e.target.closest?.('[data-tip]')) tip.hidden = true;
  };
  root.addEventListener('pointerover', onOver);
  root.addEventListener('focusin', onOver);
  root.addEventListener('pointerout', onOut);
  root.addEventListener('focusout', onOut);
  return () => {
    root.removeEventListener('pointerover', onOver);
    root.removeEventListener('focusin', onOver);
    root.removeEventListener('pointerout', onOut);
    root.removeEventListener('focusout', onOut);
    tip.remove();
  };
}

/**
 * 세로 막대 분포 (한 계열): bins [{ label, count, tip? }]. 막대 위에 개수를 쓴다(0은 쓰지 않음).
 */
export function columns({ title, bins, unit = '개', note = '', axisLabel = '' }) {
  const top = Math.max(1, ...bins.map((b) => b.count));
  return `<figure class="chart">
    <figcaption class="chart__head"><span class="chart__title">${escapeHtml(title)}</span></figcaption>
    ${note ? `<p class="meta">${escapeHtml(note)}</p>` : ''}
    <div class="columns" style="--cols:${bins.length}">
      ${bins.map((b) => {
        const tip = b.tip ?? `${b.label}: ${b.count}${unit}`;
        return `<div class="columns__col">
          <span class="columns__value num">${b.count ? b.count : ''}</span>
          <span class="columns__bar" style="height:${(b.count / top) * 100}%"${b.count ? ` tabindex="0" role="img" aria-label="${escapeHtml(tip)}" data-tip="${escapeHtml(tip)}"` : ' aria-hidden="true"'}></span>
          <span class="columns__label">${escapeHtml(b.label)}</span>
        </div>`;
      }).join('')}
    </div>
    ${axisLabel ? `<p class="columns__axis">${escapeHtml(axisLabel)}</p>` : ''}
    <details class="chart-table"><summary>표로 보기</summary><div class="table-wrap"><table class="data-table data-table--compact">
      <thead><tr><th scope="col"></th><th scope="col">${escapeHtml(unit === '개' ? '수' : unit)}</th></tr></thead>
      <tbody>${bins.map((b) => `<tr><th scope="row">${escapeHtml(b.label)}</th><td class="num">${b.count}</td></tr>`).join('')}</tbody>
    </table></div></details>
  </figure>`;
}

/**
 * 워드클라우드: words [{ word, count, docs }] — 많이 나온 낱말일수록 크고 진하다. 큰 낱말을 가운데에 놓는다.
 * 같은 값을 빈도 막대로도 보여 준다(워드클라우드만으로는 크기 비교가 어렵다).
 */
export function wordCloud({ words, empty = '아직 답이 없습니다.' }) {
  if (!words.length) return `<p class="empty-text">${escapeHtml(empty)}</p>`;
  const max = words[0].count;
  const min = words.at(-1).count;
  const level = (c) => (max === min ? 3 : Math.round(((Math.sqrt(c) - Math.sqrt(min)) / (Math.sqrt(max) - Math.sqrt(min))) * 4) + 1);
  const arranged = [];
  words.forEach((w, i) => { if (i % 2) arranged.push(w); else arranged.unshift(w); });
  return `<div class="wordcloud" role="list" aria-label="많이 나온 낱말">
    ${arranged.map((w) => `<span class="wordcloud__word" role="listitem" data-level="${level(w.count)}" tabindex="0" data-tip="${escapeHtml(`${w.word}: ${w.count}번 (답 ${w.docs}개)`)}">${escapeHtml(w.word)}</span>`).join(' ')}
  </div>`;
}
