// 증명 연습: 증명법 한눈에 보기 (#/practice/guide) — 직접증명법(연역적 증명, 귀납적 증명: 수학적 귀납법)과
// 간접증명법(대우를 이용한 증명, 귀류법)을 그림과 움직임으로 설명한다. 외부 라이브러리 없이 HTML·CSS로 그린다.
// 예시 명제는 연습 명제(data/problems)와 겹치지 않게 골랐다(두 짝수의 합, 2 + 4 + ⋯ + 2n, 3n + 1, 2√2).

import { METHODS } from '../../data/methods.js';
import { escapeHtml } from '../../ui/dom.js';
import { icons } from '../../ui/icons.js';
import { breadcrumb } from '../../ui/components.js';

const DEDUCTIVE = {
  statement: '두 짝수의 합은 짝수이다.',
  steps: [
    { why: '가정', text: '두 정수 a, b가 짝수라고 하자.' },
    { why: '짝수의 정의', text: 'a = 2m, b = 2n (m, n은 정수)으로 놓을 수 있다.' },
    { why: '계산', text: 'a + b = 2m + 2n = 2(m + n)' },
    { why: '정수의 성질', text: 'm + n은 정수이다.' },
    { why: '짝수의 정의', text: '그러므로 a + b는 짝수이다.', end: true },
  ],
};
const CONTRA = {
  steps: [
    { why: '결론의 부정', text: '2√2가 유리수라고 가정하자.' },
    { why: '식으로 나타내기', text: '2√2 = r (r은 유리수)로 놓으면 √2 = r/2이다.' },
    { why: '유리수의 성질', text: '유리수를 2로 나눈 r/2도 유리수이므로 √2는 유리수이다.' },
    { why: '모순', text: '"√2는 무리수이다"라는 이미 알려진 명제와 모순이다.', clash: true },
    { why: '결론', text: '따라서 처음 가정이 틀렸으므로 2√2는 무리수이다.', end: true },
  ],
};
const DOMINOES = ['1', '2', '3', '4', '5', 'k', 'k+1', '⋯'];

const methodHref = (id) => `#/practice/${id}`;
const methodLabel = (id) => METHODS.find((m) => m.id === id)?.label ?? id;

function stepsHtml(id, steps) {
  return `<ol class="gd-steps" data-player="${id}" aria-live="polite">${steps.map((s, i) => `<li class="gd-step${s.end ? ' is-end' : ''}${s.clash ? ' is-clash' : ''}" data-i="${i}"${i === 0 ? '' : ' hidden'}>
      <span class="gd-step__why">${escapeHtml(s.why)}</span><span class="gd-step__text">${escapeHtml(s.text)}</span></li>`).join('')}</ol>
    <div class="actions gd-player">
      <button type="button" class="button button--primary button--small" data-play-next="${id}">${icons.play}<span>한 줄씩 보기</span></button>
      <button type="button" class="button button--ghost button--small" data-play-reset="${id}">처음부터</button>
    </div>`;
}

function mapHtml() {
  return `<figure class="gd-map" aria-labelledby="gd-map-cap">
    <figcaption id="gd-map-cap" class="gd-map__cap">명제 <strong>"p이면 q이다"</strong>를 어떤 모양으로 증명할까?</figcaption>
    <div class="gd-prop" aria-hidden="true"><span class="gd-chip gd-chip--p">p <small>가정</small></span><span class="gd-arrow">${icons.chevronRight}</span><span class="gd-chip gd-chip--q">q <small>결론</small></span></div>
    <div class="gd-map__branches">
      <div class="gd-branch gd-branch--direct"><p class="gd-branch__title">직접증명법</p><p class="gd-branch__desc">구조를 <strong>그대로</strong> 두고 p에서 q로</p><ul><li>연역적 증명</li><li>귀납적 증명 (수학적 귀납법)</li></ul></div>
      <div class="gd-branch gd-branch--indirect"><p class="gd-branch__title">간접증명법</p><p class="gd-branch__desc">구조를 <strong>바꾸어</strong> 증명</p><ul><li>대우를 이용한 증명</li><li>귀류법</li></ul></div>
    </div>
  </figure>`;
}

function directPanel() {
  return `<div class="gd-panel" role="tabpanel" id="gd-panel-direct" aria-labelledby="gd-tab-direct">
    <div class="gd-def gd-def--direct">
      <p class="gd-def__title">직접증명법</p>
      <p>증명하려는 명제의 <strong>구조를 그대로 유지한 채</strong>, 가정 p에서 출발해 결론 q를 이끌어 냅니다.</p>
      <div class="gd-rail" aria-hidden="true"><span class="gd-chip gd-chip--p">p 가정</span><span class="gd-rail__track"><span class="gd-rail__dot"></span></span><span class="gd-chip gd-chip--q">q 결론</span></div>
      <p class="meta">p → q 모양 그대로, 앞에서 뒤로 한 걸음씩</p>
    </div>

    <article class="gd-card" aria-labelledby="gd-deductive">
      <h3 id="gd-deductive" class="gd-card__title"><span class="gd-card__num num">1</span>연역적 증명</h3>
      <p>정의와 이미 참으로 알려진 성질을 근거로, 가정에서 결론까지 한 줄씩 이어 갑니다. 줄마다 <strong>근거</strong>가 있어야 해요.</p>
      <p class="gd-example"><span class="tag">예시</span> ${escapeHtml(DEDUCTIVE.statement)}</p>
      ${stepsHtml('deductive', DEDUCTIVE.steps)}
      <p><a class="an-link" href="${methodHref('direct')}">${escapeHtml(methodLabel('direct'))} 연습하러 가기</a></p>
    </article>

    <article class="gd-card" aria-labelledby="gd-induction">
      <h3 id="gd-induction" class="gd-card__title"><span class="gd-card__num num">2</span>귀납적 증명: 수학적 귀납법</h3>
      <p>자연수 n에 대한 명제가 <strong>모든 자연수</strong>에서 성립함을 두 가지로 보입니다. 도미노와 같아요.</p>
      <ol class="gd-two">
        <li><strong>(i) 시작</strong> n = 1일 때 성립한다. <span class="meta">첫 도미노가 넘어진다.</span></li>
        <li><strong>(ii) 이어짐</strong> n = k일 때 성립하면 n = k + 1일 때도 성립한다. <span class="meta">앞 도미노가 넘어지면 다음 도미노도 넘어진다.</span></li>
      </ol>
      <div class="domino" data-domino>
        <div class="domino__switches" role="group" aria-label="도미노 조건">
          <button type="button" class="domino__switch is-on" data-domino-sw="start" aria-pressed="true">(i) 첫 도미노 넘어뜨리기</button>
          <button type="button" class="domino__switch is-on" data-domino-sw="link" aria-pressed="true">(ii) 가깝게 세우기</button>
        </div>
        <div class="domino__stage is-link" aria-hidden="true">${DOMINOES.map((d, i) => `<span class="domino__slot"><span class="domino__piece${d === '⋯' ? ' is-more' : ''}" style="--i:${i}"></span><span class="domino__label">${escapeHtml(d)}</span></span>`).join('')}</div>
        <p class="domino__msg" aria-live="polite">두 조건을 켜고 끄며 "넘어뜨려 보기"를 눌러 보세요.</p>
        <div class="actions"><button type="button" class="button button--primary button--small" data-domino-go>${icons.play}<span>넘어뜨려 보기</span></button></div>
      </div>
      <details class="ref-card"><summary>예시: 2 + 4 + 6 + ⋯ + 2n = n(n + 1)</summary>
        <div class="gd-proof">
          <p><strong>(i)</strong> n = 1일 때 (좌변) = 2, (우변) = 1 × 2 = 2이므로 성립한다.</p>
          <p><strong>(ii)</strong> n = k일 때 성립한다고 가정하면 2 + 4 + ⋯ + 2k = k(k + 1)이다. 양변에 2(k + 1)을 더하면</p>
          <p class="gd-proof__math">2 + 4 + ⋯ + 2k + 2(k + 1) = k(k + 1) + 2(k + 1) = (k + 1)(k + 2)</p>
          <p>이므로 n = k + 1일 때도 성립한다. (i), (ii)에 의해 모든 자연수 n에 대하여 성립한다.</p>
        </div>
      </details>
      <p><a class="an-link" href="${methodHref('induction')}">${escapeHtml(methodLabel('induction'))} 연습하러 가기</a></p>
    </article>
  </div>`;
}

function indirectPanel() {
  return `<div class="gd-panel" role="tabpanel" id="gd-panel-indirect" aria-labelledby="gd-tab-indirect" hidden>
    <div class="gd-def gd-def--indirect">
      <p class="gd-def__title">간접증명법</p>
      <p>증명하려는 명제를 <strong>원래 모양(p이면 q)으로 증명하기 어려울 때</strong>, 명제의 <strong>구조를 바꾸어</strong> 증명합니다.</p>
    </div>

    <article class="gd-card" aria-labelledby="gd-contrapositive">
      <h3 id="gd-contrapositive" class="gd-card__title"><span class="gd-card__num num">3</span>대우를 이용한 증명</h3>
      <p><strong>결론의 부정</strong>(q가 아니다)에서 출발해 <strong>가정의 부정</strong>(p가 아니다)을 이끌어 냅니다. 명제와 그 대우는 참·거짓이 같으므로, 대우가 참이면 원래 명제도 참이에요.</p>
      <div class="cp" data-cp>
        <div class="cp__row">
          <div class="cp__card cp__card--p" data-cp-card="p"><span class="cp__face cp__front"><b>p</b><small>가정</small><span>3n + 1이 짝수</span></span><span class="cp__face cp__back"><b>~p</b><small>가정의 부정</small><span>3n + 1이 홀수</span></span></div>
          <span class="cp__arrow" aria-hidden="true">${icons.chevronRight}</span>
          <div class="cp__card cp__card--q" data-cp-card="q"><span class="cp__face cp__front"><b>q</b><small>결론</small><span>n이 홀수</span></span><span class="cp__face cp__back"><b>~q</b><small>결론의 부정</small><span>n이 짝수</span></span></div>
        </div>
        <p class="cp__caption" aria-live="polite" data-cp-caption>원래 명제: 3n + 1이 짝수이면 n은 홀수이다.</p>
        <div class="actions"><button type="button" class="button button--primary button--small" data-cp-flip>${icons.undo}<span>대우로 바꾸기</span></button></div>
      </div>
      <details class="ref-card"><summary>예시: 정수 n에 대하여 3n + 1이 짝수이면 n은 홀수이다.</summary>
        <div class="gd-proof">
          <p>대우 "n이 짝수이면 3n + 1은 홀수이다"를 증명한다.</p>
          <p>n이 짝수이면 n = 2k (k는 정수)로 놓을 수 있고, 3n + 1 = 6k + 1 = 2(3k) + 1이므로 3n + 1은 홀수이다.</p>
          <p>대우가 참이므로 원래 명제도 참이다.</p>
        </div>
      </details>
      <p><a class="an-link" href="${methodHref('contrapositive')}">${escapeHtml(methodLabel('contrapositive'))} 연습하러 가기</a></p>
    </article>

    <article class="gd-card" aria-labelledby="gd-contradiction">
      <h3 id="gd-contradiction" class="gd-card__title"><span class="gd-card__num num">4</span>귀류법</h3>
      <p><strong>결론을 부정</strong>한 뒤 이끌어 내다가, 그것이 <strong>가정이나 이미 알려진 명제와 모순</strong>이 되는 점을 찾아냅니다. 모순이 생기므로 결론의 부정이 틀렸고, 결론이 참이에요.</p>
      <p class="gd-example"><span class="tag">예시</span> 2√2는 무리수이다. <span class="meta">(√2가 무리수임은 알려져 있다)</span></p>
      <div class="clash" data-clash aria-hidden="true">
        <span class="clash__ball">결론의 부정</span>
        <span class="clash__track"></span>
        <span class="clash__bolt">${icons.flame}<b>모순!</b></span>
        <span class="clash__wall">알려진 명제<br>√2는 무리수</span>
      </div>
      ${stepsHtml('contradiction', CONTRA.steps)}
      <p><a class="an-link" href="${methodHref('contradiction')}">${escapeHtml(methodLabel('contradiction'))} 연습하러 가기</a></p>
    </article>

    <div class="gd-compare">
      <h3 class="gd-card__title">대우와 귀류법, 무엇이 다를까?</h3>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th scope="col">증명법</th><th scope="col">어디서 출발?</th><th scope="col">어디에 도착?</th></tr></thead>
        <tbody>
          <tr><th scope="row">직접증명법</th><td>가정 p</td><td>결론 q</td></tr>
          <tr><th scope="row">대우를 이용한 증명</th><td>결론의 부정 ~q</td><td>가정의 부정 ~p</td></tr>
          <tr><th scope="row">귀류법</th><td>결론의 부정 ~q</td><td>모순 (가정이나 알려진 명제와 부딪힘)</td></tr>
        </tbody>
      </table></div>
    </div>
  </div>`;
}

export function renderMethodGuide(root) {
  root.innerHTML = `<div class="page page--guide">
    ${breadcrumb([{ label: '홈', href: '#/' }, { label: '증명 연습하기', href: '#/practice' }, { label: '증명법 한눈에 보기' }])}
    <header class="page-intro">
      <h1>증명법 한눈에 보기</h1>
      <p class="lead">명제를 어떤 모양으로 증명하느냐에 따라 직접증명법과 간접증명법으로 나뉘어요.</p>
    </header>
    ${mapHtml()}
    <div class="gd-tabs" role="tablist" aria-label="증명법 나누기">
      <button type="button" role="tab" class="gd-tab" id="gd-tab-direct" aria-controls="gd-panel-direct" aria-selected="true" data-gd-tab="direct">직접증명법</button>
      <button type="button" role="tab" class="gd-tab" id="gd-tab-indirect" aria-controls="gd-panel-indirect" aria-selected="false" tabindex="-1" data-gd-tab="indirect">간접증명법</button>
    </div>
    ${directPanel()}
    ${indirectPanel()}
    <p><a class="button button--secondary" href="#/practice">${icons.chevronLeft}<span>증명법 고르러 가기</span></a></p>
  </div>`;

  const showTab = (id, focus) => {
    root.querySelectorAll('[data-gd-tab]').forEach((t) => {
      const on = t.dataset.gdTab === id;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    });
    root.querySelector('#gd-panel-direct').hidden = id !== 'direct';
    root.querySelector('#gd-panel-indirect').hidden = id !== 'indirect';
  };

  // 한 줄씩 보기
  const player = (id) => root.querySelector(`[data-player="${id}"]`);
  const shownCount = (id) => [...player(id).children].filter((li) => !li.hidden).length;
  const setShown = (id, n) => {
    const items = [...player(id).children];
    items.forEach((li, i) => { li.hidden = i >= n; li.classList.toggle('is-new', i === n - 1 && n > 1); });
    const btn = root.querySelector(`[data-play-next="${id}"]`);
    btn.disabled = n >= items.length;
    if (id === 'contradiction') {
      const clash = root.querySelector('[data-clash]');
      const at = items.findIndex((s) => s.classList.contains('is-clash'));
      clash.style.setProperty('--go', String(Math.min(1, (n - 1) / at)));
      clash.classList.toggle('is-hit', n - 1 >= at);
    }
  };
  setShown('deductive', 1);
  setShown('contradiction', 1);

  // 도미노
  const domino = root.querySelector('[data-domino]');
  const sw = { start: true, link: true };
  const dominoReset = () => domino.querySelectorAll('.domino__piece').forEach((p) => p.classList.remove('is-down'));
  const dominoGo = () => {
    dominoReset();
    const pieces = [...domino.querySelectorAll('.domino__piece')];
    const msg = domino.querySelector('.domino__msg');
    void domino.offsetWidth;
    if (!sw.start) {
      msg.textContent = sw.link ? '아무것도 넘어지지 않았어요. (i) 시작이 없으면 처음부터 성립하는 n이 없어요.' : '아무것도 넘어지지 않았어요.';
      return;
    }
    const count = sw.link ? pieces.length : 1;
    pieces.slice(0, count).forEach((p) => p.classList.add('is-down'));
    msg.textContent = sw.link
      ? '모두 넘어졌어요! (i)과 (ii)가 함께 있으면 모든 자연수 n에서 성립해요.'
      : '첫 도미노만 넘어졌어요. (ii) 이어짐이 없으면 n = 1에서 멈춰요.';
  };

  // 대우 카드 뒤집기
  const cp = root.querySelector('[data-cp]');
  let flipped = false;
  const cpFlip = () => {
    flipped = !flipped;
    const p = cp.querySelector('[data-cp-card="p"]');
    const q = cp.querySelector('[data-cp-card="q"]');
    const dx = q.offsetLeft - p.offsetLeft;
    p.style.translate = flipped ? `${dx}px 0` : '';
    q.style.translate = flipped ? `${-dx}px 0` : '';
    cp.classList.toggle('is-flipped', flipped);
    cp.querySelector('[data-cp-caption]').textContent = flipped
      ? '대우: n이 짝수이면(결론의 부정) 3n + 1은 홀수이다(가정의 부정). 원래 명제와 참·거짓이 같아요.'
      : '원래 명제: 3n + 1이 짝수이면 n은 홀수이다.';
    cp.querySelector('[data-cp-flip] span').textContent = flipped ? '원래 명제로 되돌리기' : '대우로 바꾸기';
  };
  const onResize = () => {
    if (!flipped) return;
    flipped = false;
    cpFlip();
  };

  const onClick = (e) => {
    const tab = e.target.closest('[data-gd-tab]');
    if (tab) { showTab(tab.dataset.gdTab, false); return; }
    const next = e.target.closest('[data-play-next]');
    if (next) { const id = next.dataset.playNext; setShown(id, shownCount(id) + 1); return; }
    const reset = e.target.closest('[data-play-reset]');
    if (reset) { setShown(reset.dataset.playReset, 1); return; }
    const s = e.target.closest('[data-domino-sw]');
    if (s) {
      const k = s.dataset.dominoSw;
      sw[k] = !sw[k];
      s.classList.toggle('is-on', sw[k]);
      s.setAttribute('aria-pressed', sw[k] ? 'true' : 'false');
      domino.querySelector('.domino__stage').classList.toggle('is-link', sw.link);
      dominoReset();
      return;
    }
    if (e.target.closest('[data-domino-go]')) { dominoGo(); return; }
    if (e.target.closest('[data-cp-flip]')) cpFlip();
  };
  const onKey = (e) => {
    const tab = e.target.closest('[data-gd-tab]');
    if (!tab || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault();
    showTab(tab.dataset.gdTab === 'direct' ? 'indirect' : 'direct', true);
  };
  root.addEventListener('click', onClick);
  root.addEventListener('keydown', onKey);
  window.addEventListener('resize', onResize);
  return () => {
    root.removeEventListener('click', onClick);
    root.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onResize);
  };
}
