// 관리자 설정 > AI (#/admin/ai, 로드맵 5-1, 2026-11-29 사용자 결정)
// - 용도별 모델: 연구용(회차를 만들 때 고정), 증명 연습용, 교사 보조, 틀린 증명 만들기, 모델 상담 챗봇. 기본·대체 모델(OpenRouter 식별자).
//   OpenRouter 모델 목록(가격·문맥 길이)을 서버가 받아 고르기 목록과 가격 표시에 쓴다. 바꾼 기록은 서버의 aiHistory.
// - 요청 한도: 학생 하루 횟수, 메시지·답 길이, 앱 전체 하루 비용 상한, 교사가 학급별로 올릴 수 있는 배수.
// - 프롬프트: 용도별 지침을 보고 고친다(고치면 새 버전), 기본으로 되돌리기. 기본값은 서버 코드(api/_lib/prompts.js).
// 서버 모드에서만 실제로 바뀐다. 프로토타입·시연 모드에서는 기본값만 보여 준다.
// 관리자 화면은 서버 값이 바뀔 때마다 다시 그려지므로, 받은 값은 이 모듈에 두고 다시 그릴 때 쓴다.

import { isFirebase } from '../../state/appMode.js';
import { currentUser } from '../../state/accountStore.js';
import {
  loadAiAdmin, loadModelList, resetPrompt, saveAiLimits, saveAiModels, savePrompt,
} from '../../state/aiStore.js';
import { AI_LIMIT_FIELDS, AI_USES, aiLimits, aiModels } from '../../data/aiConfig.js';
import { notice } from '../../ui/components.js';
import { escapeHtml, formatDateTime } from '../../ui/dom.js';
import { chrome, guard } from './adminView.js';

// draft: 저장하기 전에 고친 칸(이름 → 값). 화면이 다시 그려져도 남고, 저장하면 비운다
const st = { owner: null, data: null, loading: false, error: '', models: null, modelError: '', promptId: 'research', status: '', busy: false, draft: {} };
const draftOr = (name, value) => (name in st.draft ? st.draft[name] : value);

const usd = (v) => (v == null || Number.isNaN(Number(v)) ? '–' : `$${Number(v).toFixed(Number(v) > 0 && Number(v) < 0.01 ? 4 : 2)}`);
const price = (m) => (m ? `입력 ${usd(m.inUsd)} · 출력 ${usd(m.outUsd)} /100만 토큰` : '');
const findModel = (id) => st.models?.find((m) => m.id === id) ?? null;

// 지금 보이는 화면을 다시 그리는 함수(받는 사이에 화면이 다시 그려지면 처음 화면은 사라지므로 받은 뒤에 이것을 부른다)
let redraw = () => {};

async function load({ force = false } = {}) {
  const me = currentUser()?.uid ?? null;
  if (me !== st.owner) Object.assign(st, { owner: me, data: null, models: null, error: '', modelError: '', draft: {}, status: '', loading: false });
  // 로그인 전(서버 연결 전)에는 부르지 않는다. 로그인하면 화면이 다시 그려지며 다시 온다
  if (!isFirebase || !me || st.loading || (st.data && !force)) return;
  st.loading = true;
  const [r, m] = await Promise.all([loadAiAdmin(), st.models ? Promise.resolve(null) : loadModelList()]);
  if (st.owner !== me) return; // 그사이 다른 사람으로 바뀜
  st.loading = false;
  if (r?.error) st.error = r.error;
  else { st.data = r; st.error = ''; }
  if (m) {
    if (m.error) st.modelError = m.error;
    else st.models = [...m.models].sort((a, b) => a.id.localeCompare(b.id));
  }
  redraw();
}

function modelsSection(models) {
  const rows = AI_USES.map((u) => {
    const cur = models[u.id];
    const fieldFor = (kind, saved) => {
      const value = draftOr(`${u.id}.${kind}`, saved);
      return `<div class="field ai-model__field">
        <label class="field__label" for="am-${u.id}-${kind}">${kind === 'model' ? '기본 모델' : '대체 모델(장애 때)'}</label>
        <input class="field__input num" id="am-${u.id}-${kind}" name="${u.id}.${kind}" value="${escapeHtml(value ?? '')}" list="ai-model-list" autocomplete="off" spellcheck="false" inputmode="url">
        <p class="meta" data-price-for="${u.id}.${kind}">${escapeHtml(price(findModel(value)))}</p>
      </div>`;
    };
    return `<fieldset class="ai-model">
        <legend class="ai-model__title">${escapeHtml(u.label)}</legend>
        <p class="meta">${escapeHtml(u.desc)}</p>
        <div class="ai-model__fields">${fieldFor('model', cur.model)}${fieldFor('fallback', cur.fallback)}</div>
      </fieldset>`;
  }).join('');
  const list = st.models ? `<datalist id="ai-model-list">${st.models.map((m) => `<option value="${escapeHtml(m.id)}">${escapeHtml(`${m.name} · ${price(m)}`)}</option>`).join('')}</datalist>` : '';
  return `<section class="panel" aria-labelledby="ai-models-heading">
      <h2 id="ai-models-heading" class="section-title">용도별 모델</h2>
      <p class="meta">OpenRouter 모델 식별자(예: anthropic/claude-sonnet-5.5)를 쓰거나 목록에서 고르세요. 연구용 모델은 <strong>새로 만드는 회차부터</strong> 적용되고, 이미 만든 회차는 만들 때의 모델을 그대로 씁니다(장애 때만 대체 모델).</p>
      ${st.modelError ? notice('warn', 'OpenRouter 모델 목록을 받지 못했어요', `${st.modelError} 식별자를 직접 쓸 수 있어요.`) : ''}
      ${list}
      <form class="settings-form" data-ai-models novalidate>
        ${rows}
        <div class="field"><label class="field__label" for="am-reason">바꾸는 까닭(기록에 남음, 고르지 않아도 됨)</label>
          <textarea class="field__input" id="am-reason" name="reason" rows="2" placeholder="예: 가격 대비 지표가 좋아서, 새 모델 출시">${escapeHtml(draftOr('reason', ''))}</textarea></div>
        <p><button type="submit" class="button button--primary"${st.busy ? ' disabled' : ''}>모델 저장</button></p>
      </form>
    </section>`;
}

function limitsSection(limits) {
  return `<section class="panel" aria-labelledby="ai-limits-heading">
      <h2 id="ai-limits-heading" class="section-title">요청 한도</h2>
      <p class="meta">서버가 막습니다. 한도에 닿으면 학생에게 한국어로 안내하고, 쓴 내용은 그대로 남습니다. 하루는 한국 시간 0시에 바뀝니다. 교사는 "교사 설정 > 증명 연습"에서 학급마다 하루 횟수를 기본값 × 배수까지 바꿀 수 있습니다.</p>
      <form class="settings-form ai-limits" data-ai-limits novalidate>
        ${AI_LIMIT_FIELDS.map((f) => `<div class="field"><label class="field__label" for="al-${f.id}">${escapeHtml(f.label)}</label>
          <span class="iv-criteria__input"><input type="number" class="field__input" id="al-${f.id}" name="${f.id}" min="${f.min}" max="${f.max}" step="${f.step ?? 1}" value="${escapeHtml(String(draftOr(f.id, limits[f.id])))}" inputmode="decimal"><span class="meta">${escapeHtml(f.unit)}</span></span></div>`).join('')}
        <p><button type="submit" class="button button--secondary"${st.busy ? ' disabled' : ''}>한도 저장</button></p>
      </form>
    </section>`;
}

function promptsSection(prompts) {
  const p = prompts.find((x) => x.id === st.promptId) ?? prompts[0];
  if (!p) return '';
  const vars = Object.entries(p.vars ?? {}).map(([k, v]) => `<li><code>{{${escapeHtml(k)}}}</code> ${escapeHtml(v)}</li>`).join('');
  return `<section class="panel" aria-labelledby="ai-prompts-heading">
      <h2 id="ai-prompts-heading" class="section-title">프롬프트</h2>
      <p class="meta">AI에게 주는 지침입니다. 학생의 메시지는 이 지침을 바꿀 수 없습니다. 고쳐서 저장하면 새 버전이 되고, 모든 AI 기록에 쓴 버전이 남습니다.</p>
      <div class="field"><label class="field__label" for="ap-pick">용도</label>
        <select class="field__select" id="ap-pick" name="promptPick">${prompts.map((x) => `<option value="${x.id}"${x.id === p.id ? ' selected' : ''}>${escapeHtml(x.label)}${x.edited ? ' (고침)' : ''}</option>`).join('')}</select></div>
      <p class="meta">지금 버전 <strong class="num">${escapeHtml(p.version)}</strong>${p.edited ? ` · 기본 버전 <span class="num">${escapeHtml(p.defaultVersion)}</span>` : ' (기본값)'}</p>
      <form class="settings-form" data-ai-prompt novalidate>
        <input type="hidden" name="id" value="${escapeHtml(p.id)}">
        <div class="field"><label class="field__label" for="ap-text">지침</label>
          <textarea class="field__input ai-prompt__text" id="ap-text" name="template" rows="14" spellcheck="false">${escapeHtml(draftOr(`prompt.${p.id}`, p.template))}</textarea></div>
        ${vars ? `<details class="disclosure"><summary>서버가 채우는 값</summary><ul class="meta">${vars}</ul></details>` : ''}
        <div class="actions actions--start">
          <button type="submit" class="button button--primary"${st.busy ? ' disabled' : ''}>새 버전으로 저장</button>
          ${p.edited ? `<button type="button" class="button button--ghost" data-ai-reset="${escapeHtml(p.id)}"${st.busy ? ' disabled' : ''}>기본으로 되돌리기</button>` : ''}
        </div>
      </form>
      ${p.edited ? `<details class="disclosure"><summary>기본 지침 보기 (${escapeHtml(p.defaultVersion)})</summary><pre class="ai-prompt__default">${escapeHtml(p.defaultTemplate)}</pre></details>` : ''}
    </section>`;
}

const USE_LABEL = Object.fromEntries(AI_USES.map((u) => [u.id, u.label]));
function historySection(history) {
  if (!history?.length) return '';
  const what = (h) => {
    if (h.kind === 'model') return `${USE_LABEL[h.use] ?? h.use}: ${h.from?.model ?? ''} → ${h.to?.model ?? ''}${h.to?.fallback ? ` (대체 ${h.to.fallback})` : ''}${h.source === 'advisor' ? ' · 상담 챗봇 추천' : ''}`;
    if (h.kind === 'limits') return '요청 한도 변경';
    if (h.kind === 'prompt') return `프롬프트 ${h.id}: ${h.reset ? '기본으로 ' : ''}${h.version}`;
    return h.kind;
  };
  return `<section class="panel" aria-labelledby="ai-history-heading">
      <h2 id="ai-history-heading" class="section-title">바꾼 기록</h2>
      <div class="table-wrap" role="region" aria-labelledby="ai-history-heading" tabindex="0"><table class="data-table">
        <thead><tr><th scope="col">때</th><th scope="col">바꾼 것</th><th scope="col">까닭</th><th scope="col">누가</th></tr></thead>
        <tbody>${history.map((h) => `<tr><td>${escapeHtml(formatDateTime(h.at))}</td><td class="wrap">${escapeHtml(what(h))}</td><td class="wrap">${escapeHtml(h.reason || h.note || '')}</td><td class="num">${escapeHtml(h.by ?? '')}</td></tr>`).join('')}</tbody>
      </table></div>
    </section>`;
}

function pageHtml() {
  if (!isFirebase) {
    const models = aiModels();
    return `${notice('info', '서버 모드에서 바꿀 수 있어요', '이 화면의 설정은 로그인한 서버 모드에서 저장됩니다. 지금(프로토타입·시연)은 더미 AI로 동작하며, 아래는 처음 값입니다.')}
      <section class="panel" aria-labelledby="ai-models-heading"><h2 id="ai-models-heading" class="section-title">용도별 모델 (처음 값)</h2>
        <div class="table-wrap" role="region" aria-labelledby="ai-models-heading" tabindex="0"><table class="data-table">
          <thead><tr><th scope="col">용도</th><th scope="col">기본 모델</th><th scope="col">대체 모델</th></tr></thead>
          <tbody>${AI_USES.map((u) => `<tr><th scope="row">${escapeHtml(u.label)}</th><td class="num">${escapeHtml(models[u.id].model)}</td><td class="num">${escapeHtml(models[u.id].fallback)}</td></tr>`).join('')}</tbody></table></div>
      </section>
      ${limitsSection(aiLimits()).replace(/<button[^>]*>한도 저장<\/button>/, '')}`;
  }
  if (!st.data) {
    return st.error
      ? `${notice('warn', 'AI 설정을 불러오지 못했어요', st.error)}<p><button type="button" class="button button--secondary" data-ai-reload>다시 불러오기</button></p>`
      : '<p class="meta" role="status">AI 설정을 불러오는 중…</p>';
  }
  const d = st.data;
  const today = d.today ?? {};
  return `${d.hasKey ? '' : notice('warn', 'OpenRouter 키가 없어요', '서버 환경 변수 OPENROUTER_API_KEY가 없어 지금은 더미 AI로 답합니다. 키를 넣으면(로컬 .env.local, Vercel 환경 변수) 실제 AI로 바뀝니다.')}
    <section class="panel ai-today" aria-labelledby="ai-today-heading">
      <div class="section-head"><h2 id="ai-today-heading" class="section-title">오늘 사용량</h2><button type="button" class="button button--ghost" data-ai-reload>새로 고침</button></div>
      <p><span class="num">${Number(today.calls ?? 0)}</span>회 · 비용 <strong class="num">${usd(today.costUsd ?? 0)}</strong> / 하루 상한 <span class="num">${usd(d.limits.dailyBudgetUsd)}</span> <span class="meta">(${escapeHtml(today.date ?? '')}, 한국 시간)</span></p>
    </section>
    ${modelsSection(d.models)}
    ${limitsSection(d.limits)}
    ${promptsSection(d.prompts ?? [])}
    ${historySection(d.history)}`;
}

export function renderAdminAi(root) {
  if (guard(root, '관리자 설정')) return null;
  let alive = true;
  const draw = (focus = null) => {
    root.innerHTML = `<div class="page page--teacher page--admin">${chrome('ai')}
      <p class="save-status" role="status" data-admin-status>${escapeHtml(st.status)}</p>
      ${pageHtml()}</div>`;
    if (focus) root.querySelector(focus)?.focus();
  };
  const mine = () => { if (alive) draw(); };
  redraw = mine;
  const refresh = (opts) => load(opts);
  const done = (r, ok, focus, clear = []) => {
    st.busy = false;
    if (!r?.error) clear.forEach((k) => { st.draft = Object.fromEntries(Object.entries(st.draft).filter(([name]) => name !== k)); });
    st.status = r?.error ? `저장하지 못했어요: ${r.error}` : ok;
    if (alive) refresh({ force: true }).then(() => alive && root.querySelector(focus)?.focus());
  };

  const onSubmit = async (event) => {
    const form = event.target;
    if (!form.matches?.('[data-ai-models], [data-ai-limits], [data-ai-prompt]')) return;
    event.preventDefault();
    if (st.busy) return;
    const fd = new FormData(form);
    st.busy = true;
    if (form.matches('[data-ai-models]')) {
      const models = {};
      AI_USES.forEach(({ id }) => { models[id] = { model: String(fd.get(`${id}.model`) ?? '').trim(), fallback: String(fd.get(`${id}.fallback`) ?? '').trim() }; });
      const r = await saveAiModels(models, { reason: String(fd.get('reason') ?? ''), source: 'manual' });
      done(r, r?.changed ? `모델 ${r.changed}개를 바꾸었습니다.` : '바뀐 모델이 없어요.', '#ai-models-heading', [...AI_USES.flatMap(({ id }) => [`${id}.model`, `${id}.fallback`]), 'reason']);
    } else if (form.matches('[data-ai-limits]')) {
      const limits = Object.fromEntries(AI_LIMIT_FIELDS.map((f) => [f.id, Number(fd.get(f.id))]));
      done(await saveAiLimits(limits), '요청 한도를 저장했습니다.', '#ai-limits-heading', AI_LIMIT_FIELDS.map((f) => f.id));
    } else {
      const id = String(fd.get('id'));
      const r = await savePrompt(id, String(fd.get('template') ?? ''));
      done(r, r?.version ? `프롬프트를 새 버전 ${r.version}(으)로 저장했습니다.` : '', '#ai-prompts-heading', [`prompt.${id}`]);
    }
  };
  const onClick = async (event) => {
    if (event.target.closest('[data-ai-reload]')) {
      st.status = '';
      st.data = st.error ? null : st.data;
      await refresh({ force: true });
      return;
    }
    const reset = event.target.closest('[data-ai-reset]');
    if (reset && !st.busy) {
      if (!window.confirm('이 프롬프트를 기본 지침으로 되돌릴까요? 고친 판은 바꾼 기록에 남습니다.')) return;
      st.busy = true;
      const r = await resetPrompt(reset.dataset.aiReset);
      done(r, r?.version ? `기본 지침(${r.version})으로 되돌렸습니다.` : '', '#ai-prompts-heading', [`prompt.${reset.dataset.aiReset}`]);
    }
  };
  const onChange = (event) => {
    const t = event.target;
    if (t.name === 'promptPick') {
      st.promptId = t.value;
      draw('#ap-pick');
    }
  };
  // 모델 식별자를 고치면 그 자리의 가격을 바로 보여 준다
  const onInput = (event) => {
    const t = event.target;
    if (t.closest?.('[data-ai-models], [data-ai-limits]') && t.name) st.draft[t.name] = t.value;
    if (t.name === 'template' && t.closest?.('[data-ai-prompt]')) st.draft[`prompt.${t.form.elements.id.value}`] = t.value;
    if (!t.closest?.('[data-ai-models]') || !/\.(model|fallback)$/.test(t.name)) return;
    const out = root.querySelector(`[data-price-for="${t.name}"]`);
    if (out) out.textContent = price(findModel(t.value.trim())) || (st.models && t.value.trim() ? '목록에 없는 식별자예요. 철자를 확인하세요.' : '');
  };

  draw();
  refresh();
  root.addEventListener('submit', onSubmit);
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  root.addEventListener('input', onInput);
  return () => {
    alive = false;
    if (redraw === mine) redraw = () => {};
    root.removeEventListener('submit', onSubmit);
    root.removeEventListener('click', onClick);
    root.removeEventListener('change', onChange);
    root.removeEventListener('input', onInput);
  };
}
