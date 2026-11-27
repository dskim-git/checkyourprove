// 원리 활동 설명 화면(문항 앞 5장): AI가 답하는 원리를 그림과 움직임으로 보여 준다. 외부 라이브러리 없이 HTML·SVG·CSS로 그린다.
//   s1 퍼셉트론(입력을 눌러 켜고 끄면 가중치 합과 출력이 바뀜) · s2 학습(한 날씩 학습하면 가중치가 바뀌고 맞힌 날이 늘어남)
//   s3 신경망(층을 따라 신호가 흐름) · s4 다음 낱말 고르기(낱말 확률 → 뽑기 → 문장에 붙이기) · s5 정리(문항 묶음과 연결)
// 학생 화면(principleView)과 교사 진행 화면(teacher/principlePaceView)이 함께 쓴다. 기록은 하지 않는다(화면을 넘길 때 principleView가 기록).

import { escapeHtml } from '../../ui/dom.js';
import { icons } from '../../ui/icons.js';

const INPUT_LABELS = ['비 예보가 있다', '하늘이 흐리다', '가방이 무겁다'];
const SHORT_LABELS = ['비 예보', '흐림', '무거움'];
// 가중치는 0.1 단위 정수로 다룬다(소수 오차 없이 기준과 비교)
const S1_WEIGHTS = [7, 4, -3];
const THRESHOLD = 5;
const S2_START = [1, 6, 3];
const S2_RATE = 2; // 가 틀림 → 나 틀림 → 다 맞음 → 라 틀림 → 가 틀림: 학습 다섯 번이면 네 날을 모두 맞힌다
const S2_DAYS = [
  { name: '가', x: [1, 0, 0], y: 1 },
  { name: '나', x: [0, 1, 0], y: 0 },
  { name: '다', x: [1, 1, 1], y: 1 },
  { name: '라', x: [0, 1, 1], y: 0 },
];
const GEN_START = ['나는', '아침에'];
const GEN_STEPS = [
  { probs: [['일어나서', 0.46], ['밥을', 0.22], ['학교에', 0.18], ['운동을', 0.14]], pick: 0, note: '확률이 가장 높은 "일어나서"가 뽑혔어요.' },
  { probs: [['세수를', 0.41], ['밥을', 0.33], ['물을', 0.15], ['창문을', 0.11]], pick: 1, note: '이번에는 가장 높은 "세수를"이 아니라 "밥을"이 뽑혔어요. 확률에 따라 뽑기 때문에, 같은 질문에도 답이 달라질 수 있어요.' },
  { probs: [['먹었다', 0.78], ['차렸다', 0.12], ['샀다', 0.06], ['굶었다', 0.04]], pick: 0, note: '문장이 완성됐어요. AI의 긴 답도 이렇게 낱말을 하나씩 이어 붙여 만든 거예요.' },
];
const NET_LAYERS = [3, 5, 5, 3];
const NET_LABELS = ['입력 층', '숨은 층 1', '숨은 층 2', '출력 층'];
const NET_PICK = 1; // 출력 층에서 가장 크게 켜지는 출력(답)
const NET_STEP_MS = 700;

const tenth = (v) => (v / 10).toFixed(1).replace('-', '−');
const signed = (v) => (v < 0 ? `(${tenth(v)})` : tenth(v));
const sumOf = (w, x) => w.reduce((s, wi, i) => s + wi * x[i], 0);
const fire = (w, x) => (sumOf(w, x) >= THRESHOLD ? 1 : 0);
const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

// ── 퍼셉트론 그림 (s1, s2 공용) ──

function perceptronHtml({ id, w, x, toggles }) {
  const rows = INPUT_LABELS.map((label, i) => {
    const inner = `<span class="pc-in__dot num">${x[i]}</span><span class="pc-in__text"><span class="pc-in__label">${escapeHtml(label)}</span><span class="pc-in__w num" data-pc-w="${i}">가중치 ${tenth(w[i])}</span></span>`;
    return toggles
      ? `<button type="button" class="pc-in${x[i] ? ' is-on' : ''}" data-pc-in="${i}" aria-pressed="${x[i] ? 'true' : 'false'}">${inner}</button>`
      : `<div class="pc-in${x[i] ? ' is-on' : ''}" data-pc-in="${i}">${inner}</div>`;
  }).join('');
  const ys = [16.7, 50, 83.3];
  const wires = ys.map((y, i) => `<line class="pc-wire" data-pc-wire="${i}" x1="0" y1="${y}" x2="100" y2="50" vector-effect="non-scaling-stroke"/>`).join('');
  return `<div class="pc" id="${id}">
    <div class="pc__inputs">${rows}</div>
    <svg class="pc__wires" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${wires}</svg>
    <div class="pc__node" aria-hidden="true"><span class="pc__sigma">합</span><span class="pc__sum num" data-pc-sum></span><span class="pc__th num">기준 ${tenth(THRESHOLD)}</span></div>
    <div class="pc__out" data-pc-out aria-live="polite"><span class="pc__out-v num" data-pc-outv></span><span class="pc__out-t" data-pc-outt></span></div>
    <p class="pc__calc num" data-pc-calc></p>
  </div>`;
}

function paintPerceptron(el, w, x, outLabels) {
  INPUT_LABELS.forEach((_, i) => {
    const input = el.querySelector(`[data-pc-in="${i}"]`);
    input.classList.toggle('is-on', !!x[i]);
    if (input.tagName === 'BUTTON') input.setAttribute('aria-pressed', x[i] ? 'true' : 'false');
    input.querySelector('.pc-in__dot').textContent = x[i];
    const wl = el.querySelector(`[data-pc-w="${i}"]`);
    const text = `가중치 ${tenth(w[i])}`;
    if (wl.textContent !== text && el.dataset.painted) {
      wl.classList.remove('is-changed');
      void wl.offsetWidth;
      wl.classList.add('is-changed');
    }
    wl.textContent = text;
    const wire = el.querySelector(`[data-pc-wire="${i}"]`);
    wire.classList.toggle('is-on', !!x[i]);
    wire.classList.toggle('is-neg', w[i] < 0);
    wire.style.setProperty('--w', String(Math.max(1.5, Math.abs(w[i]) * 1.2)));
  });
  const s = sumOf(w, x);
  const y = fire(w, x);
  el.querySelector('[data-pc-sum]').textContent = tenth(s);
  const out = el.querySelector('[data-pc-out]');
  out.classList.toggle('is-yes', y === 1);
  el.querySelector('.pc__node').classList.toggle('is-yes', y === 1);
  el.querySelector('[data-pc-outv]').textContent = y;
  el.querySelector('[data-pc-outt]').textContent = outLabels[y];
  el.dataset.painted = '1';
  el.querySelector('[data-pc-calc]').textContent = `${x.map((xi, i) => `${xi} × ${signed(w[i])}`).join(' + ')} = ${tenth(s)} ${s >= THRESHOLD ? '≥' : '<'} ${tenth(THRESHOLD)} → 출력 ${y}`;
}

// ── 신경망 그림 (s3) ──

function networkHtml() {
  const W = 400;
  const H = 220;
  const xs = NET_LAYERS.map((_, l) => 40 + (l * (W - 80)) / (NET_LAYERS.length - 1));
  const pos = NET_LAYERS.map((n, l) => Array.from({ length: n }, (_, k) => [xs[l], H / 2 + (k - (n - 1) / 2) * 40]));
  let edges = '';
  pos.slice(0, -1).forEach((layer, l) => layer.forEach(([x1, y1], a) => pos[l + 1].forEach(([x2, y2], b) => {
    const strong = (a * 3 + b * 5 + l) % 4 === 0;
    edges += `<line class="nn-edge${strong ? ' is-strong' : ''}" data-layer="${l}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  })));
  const nodes = pos.map((layer, l) => layer.map(([x, y], k) => `<circle class="nn-node" data-layer="${l}" data-k="${k}" cx="${x}" cy="${y}" r="11"/>`).join('')).join('');
  const weights = NET_LAYERS.slice(0, -1).reduce((s, n, l) => s + n * NET_LAYERS[l + 1], 0);
  return `<figure class="nn">
    <svg class="nn__svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="입력 층 3개, 숨은 층 5개씩 두 층, 출력 층 3개의 퍼셉트론이 선으로 이어진 신경망. 왼쪽에서 오른쪽으로 신호가 흐른다.">${edges}${nodes}</svg>
    <figcaption class="nn__layers">${NET_LABELS.map((t, l) => `<span data-layer="${l}">${t}</span>`).join('')}</figcaption>
    <p class="nn__status" data-nn-status aria-live="polite">"신호 보내기"를 누르면 입력 층에서 출력 층까지 한 층씩 계산이 이어져요.</p>
    <button type="button" class="button button--secondary button--small" data-nn-replay>${icons.play}<span>신호 보내기</span></button>
    <div class="nn__facts">
      <p class="nn__fact"><span class="nn__fact-v num">${weights}개</span><span class="meta">이 그림의 가중치(선)</span></p>
      <p class="nn__fact"><span class="nn__fact-v">수천억 개</span><span class="meta">AI 언어 모델의 가중치</span></p>
    </div>
  </figure>`;
}

// ── 다음 낱말 고르기 (s4) ──

function genHtml() {
  return `<div class="gen" data-gen>
    <p class="gen__sentence" aria-live="polite"><span class="gen__label meta">지금까지의 문장</span><span class="gen__toks" data-gen-toks></span></p>
    <div class="gen__machine" aria-hidden="true"><span class="gen__arrow">${icons.arrowDown}</span><span class="gen__box">신경망<span class="meta">가중치로 계산</span></span><span class="gen__arrow">${icons.arrowDown}</span></div>
    <figure class="chart gen__probs"><figcaption class="chart__head"><span class="chart__title">다음 낱말의 확률</span></figcaption><div class="barlist barlist--wide" data-gen-bars></div></figure>
    <p class="gen__note" data-gen-note aria-live="polite"></p>
    <div class="actions"><button type="button" class="button button--secondary" data-gen-next></button></div>
  </div>`;
}

// ── 정리 (s5) ──

function summaryHtml() {
  const cards = [
    { t: '확률이 높다 ≠ 맞다', d: 'AI는 참인지 따지지 않고 그럴듯한 낱말을 골라요. 자신 있는 말투여도 틀릴 수 있어요.', parts: '묶음 1 · 3' },
    { t: '뽑기라서 답이 달라져요', d: '확률에 따라 뽑기 때문에 같은 질문에도 다른 답이 나올 수 있어요.', parts: '묶음 2' },
    { t: '입력이 바뀌면 출력이 바뀌어요', d: '질문(입력)을 어떻게 쓰느냐에 따라 AI가 주는 도움이 달라져요.', parts: '묶음 4' },
  ];
  return `<ol class="sum-cards">${cards.map((c, i) => `<li class="sum-card sum-card--${i + 1}"><span class="sum-card__num num">${i + 1}</span><div><p class="sum-card__t">${escapeHtml(c.t)}</p><p>${escapeHtml(c.d)}</p><p class="meta">문항 ${escapeHtml(c.parts)}에서 확인해요</p></div></li>`).join('')}</ol>`;
}

/** 설명 화면 하나 (no: 1부터) */
export function slideHtml(slide, no, total) {
  const visual = {
    s1: () => perceptronHtml({ id: 'pc-s1', w: S1_WEIGHTS, x: [1, 0, 0], toggles: true }),
    s2: () => `${perceptronHtml({ id: 'pc-s2', w: S2_START, x: S2_DAYS[0].x, toggles: false })}<div class="train" data-train></div>`,
    s3: networkHtml,
    s4: genHtml,
    s5: summaryHtml,
  }[slide.id];
  return `<section class="pr-card pr-slide" aria-labelledby="pr-q" data-slide="${slide.id}">
    <p class="pr-part"><span class="tag tag--strong">설명 ${no} / ${total}</span></p>
    <h2 class="pr-q pr-slide__title" id="pr-q">${escapeHtml(slide.title)}</h2>
    <p class="pr-slide__body">${escapeHtml(slide.body)}</p>
    <div class="pr-slide__visual">${visual ? visual() : ''}</div>
  </section>`;
}

const OUT_UMBRELLA = ['우산을 두고 가요', '우산을 챙겨요'];

/** 화면에 있는 설명 그림을 움직이게 한다. 해제 함수를 돌려준다. */
export function mountSlide(root) {
  const cleanups = [];
  const s1 = root.querySelector('#pc-s1');
  if (s1) {
    const x = [1, 0, 0];
    paintPerceptron(s1, S1_WEIGHTS, x, OUT_UMBRELLA);
    const onClick = (e) => {
      const b = e.target.closest('[data-pc-in]');
      if (!b) return;
      const i = Number(b.dataset.pcIn);
      x[i] = x[i] ? 0 : 1;
      paintPerceptron(s1, S1_WEIGHTS, x, OUT_UMBRELLA);
    };
    s1.addEventListener('click', onClick);
    cleanups.push(() => s1.removeEventListener('click', onClick));
  }
  const s2 = root.querySelector('#pc-s2');
  if (s2) cleanups.push(mountTraining(s2, root.querySelector('[data-train]')));
  const nn = root.querySelector('.nn');
  if (nn) {
    // 신호 보내기: 한 층씩 켠다(움직임 줄이기 설정이 켜진 기기에서도 단계가 보이도록 CSS 애니메이션이 아니라 상태를 바꾼다)
    let timers = [];
    const status = nn.querySelector('[data-nn-status]');
    const btn = nn.querySelector('[data-nn-replay]');
    const clear = () => {
      timers.forEach((t) => window.clearTimeout(t));
      timers = [];
      nn.querySelectorAll('.is-lit, .is-pick').forEach((el) => el.classList.remove('is-lit', 'is-pick'));
    };
    const light = (l) => {
      nn.querySelectorAll(`.nn-edge[data-layer="${l - 1}"]`).forEach((el) => el.classList.add('is-lit'));
      nn.querySelectorAll(`.nn-node[data-layer="${l}"]`).forEach((el) => el.classList.add('is-lit'));
      nn.querySelector(`.nn__layers [data-layer="${l}"]`)?.classList.add('is-lit');
      const last = l === NET_LAYERS.length - 1;
      if (last) nn.querySelector(`.nn-node[data-layer="${l}"][data-k="${NET_PICK}"]`)?.classList.add('is-pick');
      status.textContent = l === 0
        ? '입력 층: 입력(예: 앞의 문장)이 들어와요.'
        : last
          ? '출력 층: 가장 크게 켜진 출력이 답이 돼요. 이 계산이 모두 가중치로 정해져요.'
          : `${NET_LABELS[l]}: 앞 층의 출력에 가중치를 곱해 더한 값으로 켜질지 정해요.`;
      if (last) {
        btn.disabled = false;
        btn.querySelector('span').textContent = '신호 다시 보내기';
      }
    };
    const run = () => {
      clear();
      btn.disabled = true;
      NET_LAYERS.forEach((_, l) => timers.push(window.setTimeout(() => light(l), l * NET_STEP_MS)));
    };
    const onClick = (e) => {
      if (e.target.closest('[data-nn-replay]')) run();
    };
    nn.addEventListener('click', onClick);
    cleanups.push(() => {
      clear();
      nn.removeEventListener('click', onClick);
    });
  }
  const gen = root.querySelector('[data-gen]');
  if (gen) cleanups.push(mountGen(gen));
  return () => cleanups.forEach((f) => f());
}

function mountTraining(pc, box) {
  let w = [...S2_START];
  let at = 0; // 다음에 학습할 날
  let steps = 0;
  let message = '"한 날씩 학습하기"를 누르면 AI가 그날을 예측하고, 틀리면 가중치를 고쳐요.';
  const allRight = () => S2_DAYS.every((d) => fire(w, d.x) === d.y);
  const draw = (focus = at) => {
    const day = S2_DAYS[focus];
    paintPerceptron(pc, w, day.x, OUT_UMBRELLA);
    const right = S2_DAYS.filter((d) => fire(w, d.x) === d.y).length;
    const done = allRight() && steps > 0;
    box.innerHTML = `<div class="table-wrap"><table class="data-table train__table">
        <caption class="visually-hidden">지난 날들의 입력과 정답, 지금 가중치로 한 예측</caption>
        <thead><tr><th scope="col">날</th>${SHORT_LABELS.map((l) => `<th scope="col">${l}</th>`).join('')}<th scope="col">정답</th><th scope="col">AI 예측</th></tr></thead>
        <tbody>${S2_DAYS.map((d, i) => {
          const p = fire(w, d.x);
          return `<tr class="${i === focus ? 'is-focus' : ''}"><th scope="row">${d.name}</th>${d.x.map((v) => `<td class="num">${v}</td>`).join('')}<td class="num">${d.y}</td><td class="num">${p} ${p === d.y ? `<span class="train__mark is-right">${icons.check}<span class="visually-hidden">맞음</span></span>` : `<span class="train__mark is-wrong">${icons.x}<span class="visually-hidden">틀림</span></span>`}</td></tr>`;
        }).join('')}</tbody>
      </table></div>
      <p class="train__score"><strong class="num">${right} / ${S2_DAYS.length}</strong> 날을 맞혀요 <span class="meta">(학습 ${steps}번)</span></p>
      <p class="train__msg" aria-live="polite">${escapeHtml(message)}</p>
      <div class="actions"><button type="button" class="button button--secondary" data-train-step>${done ? '처음부터 다시' : '한 날씩 학습하기'}</button></div>`;
  };
  const onClick = (e) => {
    if (!e.target.closest('[data-train-step]')) return;
    if (allRight() && steps > 0) {
      w = [...S2_START];
      at = 0;
      steps = 0;
      message = '가중치를 처음 값으로 되돌렸어요.';
      draw();
      return;
    }
    const day = S2_DAYS[at];
    const p = fire(w, day.x);
    steps += 1;
    if (p === day.y) {
      message = `${day.name}날: 예측 ${p}, 정답 ${day.y}. 맞혔으니 가중치를 그대로 둬요.`;
    } else {
      const delta = day.y === 1 ? S2_RATE : -S2_RATE;
      const on = day.x.map((v, i) => (v ? SHORT_LABELS[i] : null)).filter(Boolean);
      w = w.map((wi, i) => wi + delta * day.x[i]);
      message = `${day.name}날: 예측 ${p}, 정답 ${day.y}. 틀렸으니 켜져 있던 입력(${on.join(', ')})의 가중치를 ${tenth(Math.abs(delta))}만큼 ${delta > 0 ? '올려요' : '내려요'}.`;
    }
    const focus = at;
    at = (at + 1) % S2_DAYS.length;
    if (allRight()) message += ' 이제 네 날을 모두 맞혀요. 학습이 끝났어요!';
    draw(focus);
  };
  draw();
  box.addEventListener('click', onClick);
  return () => box.removeEventListener('click', onClick);
}

function mountGen(gen) {
  let step = 0; // 지금까지 만든 낱말 수
  let busy = false;
  let timer = null;
  const toks = gen.querySelector('[data-gen-toks]');
  const bars = gen.querySelector('[data-gen-bars]');
  const note = gen.querySelector('[data-gen-note]');
  const btn = gen.querySelector('[data-gen-next]');
  const sentence = (n, fresh) => [...GEN_START, ...GEN_STEPS.slice(0, n).map((s) => s.probs[s.pick][0])]
    .map((t, i, arr) => `<span class="gen__tok${fresh && i === arr.length - 1 ? ' is-new' : ''}">${escapeHtml(t)}</span>`).join('');
  const barsHtml = (s, picked, grow) => s.probs.map(([word, p], i) => `<div class="barlist__row${picked && i === s.pick ? ' is-picked' : ''}"><span class="barlist__label">${escapeHtml(word)}</span><div class="barlist__track"><span class="barlist__bar" style="width:${Math.round(p * 100)}%${grow ? '; scale: 0 1' : ''}" role="img" aria-label="${escapeHtml(`${word} ${Math.round(p * 100)}%`)}"></span><span class="barlist__value num">${Math.round(p * 100)}%</span></div></div>`).join('');
  const idle = () => {
    toks.innerHTML = sentence(step, false);
    btn.textContent = step >= GEN_STEPS.length ? '처음부터 다시' : '다음 낱말 만들기';
    if (step === 0) {
      bars.innerHTML = '<p class="meta">버튼을 누르면 신경망이 다음 낱말의 확률을 계산해요.</p>';
      note.textContent = '';
    }
  };
  const onClick = (e) => {
    if (!e.target.closest('[data-gen-next]') || busy) return;
    if (step >= GEN_STEPS.length) {
      step = 0;
      idle();
      return;
    }
    const s = GEN_STEPS[step];
    const instant = reduceMotion();
    busy = true;
    btn.disabled = true;
    note.textContent = '확률을 계산하는 중…';
    bars.innerHTML = barsHtml(s, false, !instant);
    if (!instant) window.requestAnimationFrame(() => window.requestAnimationFrame(() => bars.querySelectorAll('.barlist__bar').forEach((b) => { b.style.scale = '1 1'; })));
    timer = window.setTimeout(() => {
      bars.innerHTML = barsHtml(s, true, false);
      step += 1;
      toks.innerHTML = sentence(step, true);
      note.textContent = `"${s.probs[s.pick][0]}" 낱말을 뽑아 문장 뒤에 붙였어요. ${s.note}`;
      btn.textContent = step >= GEN_STEPS.length ? '처음부터 다시' : '다음 낱말 만들기';
      btn.disabled = false;
      busy = false;
    }, instant ? 0 : 1100);
  };
  idle();
  gen.addEventListener('click', onClick);
  return () => {
    window.clearTimeout(timer);
    gen.removeEventListener('click', onClick);
  };
}
