// 교사 화면: 설문 고치기 (구현 4, 구현 7에서 평가도구 기능)
// 설문 이름·안내, 평가도구 정보(이름, 출처, 신뢰도·타당도, 고친 내용, 사용 허락), 척도(4~7점과 선택지 글),
// 하위 요인(영역) 만들기·이름 바꾸기·지우기, 문항 한꺼번에 붙여넣기(미리 보기 → 더하기 또는 바꾸기),
// 문항마다 하위 요인·형식·글·객관식 보기·역문항·원도구 문항 번호와 원문. 학생이 응답을 시작한 설문은 잠겨 읽기만 한다.

import {
  INSTRUMENT_FIELDS, QUESTION_TYPES, SCALE_POINTS, SCALE_PRESETS, surveyDomains, surveyScale,
} from '../../data/surveyDefaults.js';
import { parseItems } from '../../services/surveyImport.js';
import { findSurvey, newQuestionId, updateSurvey } from '../../state/surveyStore.js';
import { escapeHtml, formatDateTime, newId } from '../../ui/dom.js';
import { breadcrumb, notice, renderNotFound } from '../../ui/components.js';

const label = (list, id) => list.find((x) => x.id === id)?.label ?? id;
const typeLabel = (id, points) => (id === 'scale' ? `${points}점 척도` : label(QUESTION_TYPES, id));
const clone = (v) => JSON.parse(JSON.stringify(v));

export function renderSurveyEdit(root, [id]) {
  const survey = findSurvey(id);
  if (!survey) {
    renderNotFound(root);
    return null;
  }
  const fromSurvey = () => clone({
    title: survey.title,
    intro: survey.intro ?? '',
    instrument: survey.instrument ?? {},
    domains: surveyDomains(survey),
    scale: surveyScale(survey),
    questions: survey.questions,
  });
  // 고치는 동안의 초안 (저장 전까지 설문에 쓰지 않는다)
  let draft = fromSurvey();
  let preview = null; // 붙여넣기 미리 보기 결과
  let pasteText = '';
  const locked = Boolean(survey.lockedAt);

  const select = (name, list, value, elId) => `<select class="field__select" id="${elId}" name="${name}">${list.map((o) => `<option value="${o.id}"${o.id === value ? ' selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}</select>`;
  const typeOptions = () => QUESTION_TYPES.map((t) => ({ id: t.id, label: typeLabel(t.id, draft.scale.points) }));

  function qEditor(q, i) {
    return `<fieldset class="choice-group rubric-edit" data-q="${i}">
      <legend>${i + 1}. ${escapeHtml(label(draft.domains, q.domain))}, ${escapeHtml(typeLabel(q.type, draft.scale.points))}${q.sourceNo ? ` <span class="meta">원문항 ${escapeHtml(q.sourceNo)}</span>` : ''}</legend>
      <div class="q-grid">
        <div class="field field--inline"><label class="field__label" for="q-${i}-domain">하위 요인</label>${select('domain', draft.domains, q.domain, `q-${i}-domain`)}</div>
        <div class="field field--inline"><label class="field__label" for="q-${i}-type">형식</label>${select('type', typeOptions(), q.type, `q-${i}-type`)}</div>
      </div>
      <div class="field"><label class="field__label" for="q-${i}-text">문항</label><textarea class="field__input" id="q-${i}-text" name="text" rows="2">${escapeHtml(q.text)}</textarea></div>
      ${q.type === 'choice' ? `<div class="field"><label class="field__label" for="q-${i}-opts">보기 <span class="field__req">(줄마다 하나)</span></label><textarea class="field__input" id="q-${i}-opts" name="options" rows="4">${escapeHtml((q.options ?? []).join('\n'))}</textarea></div>` : ''}
      ${q.type === 'scale' ? `<label class="check"><input type="checkbox" name="reverse"${q.reverse ? ' checked' : ''}><span>역문항 <span class="meta">점수가 높을수록 부정적인 문항입니다. 분석할 때 ${draft.scale.points + 1} − 점수로 바꾸어 하위 요인 평균을 냅니다.</span></span></label>` : ''}
      <details class="ref-card sv-source"${q.sourceNo || q.sourceText ? ' open' : ''}>
        <summary>원도구 문항</summary>
        <div class="sv-source__grid">
          <div class="field"><label class="field__label" for="q-${i}-no">원문항 번호</label><input type="text" class="field__input" id="q-${i}-no" name="sourceNo" value="${escapeHtml(q.sourceNo ?? '')}" placeholder="예: 7"></div>
          <div class="field"><label class="field__label" for="q-${i}-src">원문 <span class="field__req">(표현을 고쳤다면 원래 문항)</span></label><textarea class="field__input" id="q-${i}-src" name="sourceText" rows="2">${escapeHtml(q.sourceText ?? '')}</textarea></div>
        </div>
      </details>
      <div class="actions actions--start">
        <button type="button" class="button button--ghost button--small" data-q-action="up" data-i="${i}"${i === 0 ? ' disabled' : ''}>위로</button>
        <button type="button" class="button button--ghost button--small" data-q-action="down" data-i="${i}"${i === draft.questions.length - 1 ? ' disabled' : ''}>아래로</button>
        <button type="button" class="button button--ghost button--small" data-q-action="remove" data-i="${i}">이 문항 지우기</button>
      </div>
    </fieldset>`;
  }

  function qRead(q, i) {
    const { points, labels } = surveyScale(survey);
    const extra = q.type === 'choice' ? `<ul class="tag-list">${(q.options ?? []).map((o) => `<li class="tag">${escapeHtml(o)}</li>`).join('')}</ul>` : q.type === 'scale' ? `<p class="meta">1 ${escapeHtml(labels[0])} ~ ${points} ${escapeHtml(labels[points - 1])}${q.reverse ? ', 역문항' : ''}</p>` : '';
    return `<li class="survey-q"><p class="survey-q__text"><span class="survey-q__num num">${i + 1}</span>${escapeHtml(q.text)}</p><p class="meta">${escapeHtml(label(surveyDomains(survey), q.domain))}, ${escapeHtml(typeLabel(q.type, points))}${q.sourceNo ? `, 원문항 ${escapeHtml(q.sourceNo)}` : ''}</p>${extra}</li>`;
  }

  function instrumentRead() {
    const inst = survey.instrument ?? {};
    const rows = INSTRUMENT_FIELDS.filter((f) => String(inst[f.id] ?? '').trim());
    if (!rows.length) return '';
    return `<section class="panel"><h2 class="section-title">평가도구 정보</h2><dl class="read-list">${rows.map((f) => `<div><dt>${escapeHtml(f.label)}</dt><dd>${escapeHtml(inst[f.id])}</dd></div>`).join('')}</dl></section>`;
  }

  function instrumentForm() {
    return `<section class="panel sv-section" aria-labelledby="sv-inst">
      <h2 id="sv-inst" class="section-title">평가도구 정보</h2>
      <p class="meta">선행 논문의 도구를 쓰면 출처와 사용 허락을 남겨 두세요. 설문 CSV와 분석 화면에 함께 나옵니다.</p>
      <div class="sv-inst">${INSTRUMENT_FIELDS.map((f) => `<div class="field${f.long ? ' sv-inst__long' : ''}"><label class="field__label" for="inst-${f.id}">${escapeHtml(f.label)}</label>${f.long
        ? `<textarea class="field__input" id="inst-${f.id}" name="inst-${f.id}" rows="2" placeholder="${escapeHtml(f.placeholder)}">${escapeHtml(draft.instrument[f.id] ?? '')}</textarea>`
        : `<input type="text" class="field__input" id="inst-${f.id}" name="inst-${f.id}" value="${escapeHtml(draft.instrument[f.id] ?? '')}" placeholder="${escapeHtml(f.placeholder)}">`}</div>`).join('')}</div>
    </section>`;
  }

  function scaleForm() {
    const { points, labels } = draft.scale;
    return `<section class="panel sv-section" aria-labelledby="sv-scale">
      <h2 id="sv-scale" class="section-title">척도</h2>
      <div class="field field--inline"><label class="field__label" for="sv-points">척도 점수</label>
        <select class="field__select" id="sv-points" name="points">${SCALE_POINTS.map((n) => `<option value="${n}"${n === points ? ' selected' : ''}>${n}점 척도</option>`).join('')}</select></div>
      <fieldset class="choice-group"><legend>선택지 글 <span class="meta">학생 화면에 번호와 함께 나옵니다.</span></legend>
        <ol class="sv-labels">${labels.map((l, k) => `<li><label class="visually-hidden" for="sv-label-${k}">${k + 1}점 선택지</label><span class="num sv-labels__n">${k + 1}</span><input type="text" class="field__input" id="sv-label-${k}" name="scaleLabel" value="${escapeHtml(l)}"></li>`).join('')}</ol>
      </fieldset>
      <div class="actions actions--start"><button type="button" class="button button--ghost button--small" data-action="scale-preset">기본 글로 (${points}점)</button></div>
    </section>`;
  }

  function domainForm() {
    const used = (did) => draft.questions.filter((q) => q.domain === did).length;
    return `<section class="panel sv-section" aria-labelledby="sv-domains">
      <h2 id="sv-domains" class="section-title">하위 요인 (영역)</h2>
      <p class="meta">분석 화면은 하위 요인마다 사전·사후 평균과 변화를 냅니다. 도구의 하위 요인 이름을 그대로 쓰세요.</p>
      <ul class="sv-domains">${draft.domains.map((d, k) => `<li data-d="${k}">
        <label class="visually-hidden" for="sv-d-${k}">하위 요인 ${k + 1} 이름</label>
        <input type="text" class="field__input" id="sv-d-${k}" name="domainLabel" value="${escapeHtml(d.label)}">
        <span class="meta">문항 ${used(d.id)}개</span>
        <button type="button" class="button button--ghost button--small" data-action="domain-remove" data-k="${k}"${draft.domains.length === 1 ? ' disabled' : ''}>지우기</button>
      </li>`).join('')}</ul>
      <div class="actions actions--start"><button type="button" class="button button--secondary button--small" data-action="domain-add">하위 요인 더하기</button></div>
    </section>`;
  }

  function pasteForm() {
    return `<section class="panel sv-section" aria-labelledby="sv-paste">
      <h2 id="sv-paste" class="section-title">문항 한꺼번에 붙여넣기</h2>
      <p class="meta">논문이나 엑셀에서 문항 목록을 복사해 붙여넣으세요. 한 줄에 한 문항입니다. 엑셀에서 복사하면 칸(번호, 하위 요인, 문항, 역문항 표시)을 알아봅니다. 칸이 하나면 앞의 번호("1.")와 뒤의 "(R)" "(역)" "*" 표시를 알아봅니다.</p>
      <div class="field"><label class="field__label" for="sv-paste-text">문항 목록</label><textarea class="field__input" id="sv-paste-text" name="pasteText" rows="6" placeholder="1.&#9;비판적 평가&#9;AI의 답이 맞는지 다른 자료로 확인한다.&#10;2.&#9;비판적 평가&#9;AI가 틀린 답을 낼 수 있다는 것을 안다.&#9;R">${escapeHtml(pasteText)}</textarea></div>
      <div class="q-grid">
        <div class="field field--inline"><label class="field__label" for="sv-paste-domain">하위 요인 칸이 없을 때</label>${select('pasteDomain', draft.domains, draft.domains[0]?.id, 'sv-paste-domain')}</div>
        <div class="field field--inline"><label class="field__label" for="sv-paste-type">형식</label>${select('pasteType', typeOptions(), 'scale', 'sv-paste-type')}</div>
      </div>
      <p class="field__error" data-paste-error hidden></p>
      <div class="actions actions--start"><button type="button" class="button button--secondary button--small" data-action="paste-preview">미리 보기</button></div>
      ${preview ? previewBlock() : ''}
    </section>`;
  }

  function previewBlock() {
    const { items, newDomains, skipped } = preview;
    return `<div class="sv-preview" data-paste-preview>
      <p><strong>문항 ${items.length}개</strong>${newDomains.length ? `, 새 하위 요인 ${newDomains.length}개(${escapeHtml(newDomains.join(', '))})` : ''}${skipped ? `, 읽지 못한 줄 ${skipped}개` : ''}</p>
      <div class="table-wrap" role="region" aria-label="붙여넣기 미리 보기" tabindex="0"><table class="data-table grade-table">
        <thead><tr><th scope="col">원문항</th><th scope="col">하위 요인</th><th scope="col">문항</th><th scope="col">역문항</th></tr></thead>
        <tbody>${items.map((it) => `<tr><td class="num">${escapeHtml(it.sourceNo || '–')}</td><td>${it.newDomain ? `${escapeHtml(it.newDomain)} <span class="tag tag--proto">새로</span>` : escapeHtml(label(draft.domains, it.domain))}</td><td class="sv-preview__text">${escapeHtml(it.text)}</td><td>${it.reverse ? '역' : ''}</td></tr>`).join('')}</tbody>
      </table></div>
      <div class="actions actions--start">
        <button type="button" class="button button--primary button--small" data-action="paste-append"${items.length ? '' : ' disabled'}>뒤에 더하기</button>
        <button type="button" class="button button--secondary button--small" data-action="paste-replace"${items.length ? '' : ' disabled'}>지금 문항을 모두 이것으로 바꾸기</button>
        <button type="button" class="button button--ghost button--small" data-action="paste-cancel">취소</button>
      </div>
    </div>`;
  }

  function readForm() {
    const form = root.querySelector('[data-survey-edit]');
    if (!form) return;
    draft.title = form.querySelector('[name="title"]').value;
    draft.intro = form.querySelector('[name="intro"]').value;
    INSTRUMENT_FIELDS.forEach((f) => { draft.instrument[f.id] = form.querySelector(`[name="inst-${f.id}"]`).value; });
    draft.scale.labels = [...form.querySelectorAll('[name="scaleLabel"]')].map((el, k) => el.value.trim() || SCALE_PRESETS[draft.scale.points][k]);
    form.querySelectorAll('[name="domainLabel"]').forEach((el, k) => { draft.domains[k].label = el.value; });
    pasteText = form.querySelector('[name="pasteText"]')?.value ?? pasteText;
    form.querySelectorAll('[data-q]').forEach((box) => {
      const q = draft.questions[Number(box.dataset.q)];
      q.domain = box.querySelector('[name="domain"]').value;
      q.type = box.querySelector('[name="type"]').value;
      q.text = box.querySelector('[name="text"]').value;
      const opts = box.querySelector('[name="options"]');
      if (opts) q.options = opts.value.split('\n').map((x) => x.trim()).filter(Boolean);
      const rev = box.querySelector('[name="reverse"]');
      q.reverse = rev ? rev.checked : false;
      q.sourceNo = box.querySelector('[name="sourceNo"]').value.trim();
      q.sourceText = box.querySelector('[name="sourceText"]').value.trim();
    });
  }

  function draw(status = '', focus = null) {
    root.innerHTML = `<div class="page page--teacher page--survey-edit">
      ${breadcrumb([{ label: '교사 화면', href: '#/teacher' }, { label: '설문과 연구 동의', href: '#/teacher/surveys' }, { label: survey.title }])}
      <header class="page-intro"><h1>${escapeHtml(survey.title)}</h1></header>
      ${locked
        ? `${notice('lock', '잠긴 설문입니다', `${formatDateTime(survey.lockedAt)}에 학생 응답이 시작되어 문항을 고칠 수 없습니다. 고치려면 설문 목록에서 복사해 새 설문을 만드세요.`)}
          ${instrumentRead()}
          <p class="lead">${escapeHtml(survey.intro ?? '')}</p>
          <ol class="survey-form survey-read">${survey.questions.map(qRead).join('')}</ol>`
        : `<form class="settings-form rubric-form" data-survey-edit novalidate>
          ${survey.example ? notice('eye', '추천 초안입니다', '연구자 제작 초안으로 아직 검증하지 않았습니다. 선행 논문의 평가도구를 찾으면 아래 "평가도구 정보"를 채우고 "문항 한꺼번에 붙여넣기"로 문항을 바꾸세요. 학생이 응답을 시작하면 잠기므로 수업 전에 확정하세요.') : ''}
          <section class="panel sv-section" aria-labelledby="sv-basic">
            <h2 id="sv-basic" class="section-title">기본</h2>
            <div class="field"><label class="field__label" for="sv-title">설문 이름</label><input type="text" class="field__input" id="sv-title" name="title" value="${escapeHtml(draft.title)}"></div>
            <div class="field"><label class="field__label" for="sv-intro">학생에게 보이는 안내</label><textarea class="field__input" id="sv-intro" name="intro" rows="2">${escapeHtml(draft.intro)}</textarea></div>
          </section>
          ${instrumentForm()}
          ${scaleForm()}
          ${domainForm()}
          ${pasteForm()}
          <section class="panel sv-section" aria-labelledby="sv-questions">
            <h2 id="sv-questions" class="section-title">문항 (${draft.questions.length})</h2>
            ${draft.questions.map(qEditor).join('') || '<p class="empty-text">아직 문항이 없습니다.</p>'}
            <div class="actions actions--start"><button type="button" class="button button--secondary" data-q-action="add">문항 추가</button></div>
          </section>
          <div class="actions grade-actions">
            <p class="save-status" role="status">${escapeHtml(status)}</p>
            <a class="button button--ghost" href="#/teacher/surveys">설문 목록</a>
            <button type="submit" class="button button--primary">설문 저장</button>
          </div>
        </form>`}
    </div>`;
    if (focus) root.querySelector(focus)?.focus();
  }

  const dirty = '저장하지 않은 변경 사항이 있습니다.';
  const redraw = (status, focus) => {
    const y = window.scrollY;
    draw(status, focus);
    window.scrollTo(0, y);
  };

  function applyPreview(replace) {
    const created = {};
    preview.newDomains.forEach((name) => {
      const d = { id: newId('d'), label: name };
      draft.domains.push(d);
      created[name.toLowerCase()] = d.id;
    });
    const qs = preview.items.map((it) => ({
      id: newQuestionId(),
      domain: it.domain ?? created[it.newDomain.toLowerCase()],
      type: it.type,
      text: it.text,
      ...(it.type === 'choice' ? { options: [] } : {}),
      ...(it.reverse ? { reverse: true } : {}),
      sourceNo: it.sourceNo,
      sourceText: it.sourceText,
    }));
    draft.questions = replace ? qs : [...draft.questions, ...qs];
    const n = qs.length;
    preview = null;
    pasteText = '';
    redraw(`문항 ${n}개를 ${replace ? '바꾸어 넣었습니다' : '더했습니다'}. 저장해야 반영됩니다.`, '#sv-questions');
  }

  const onClick = (event) => {
    if (locked) return;
    const act = event.target.closest('[data-action]');
    if (act) {
      readForm();
      const a = act.dataset.action;
      if (a === 'scale-preset') {
        draft.scale.labels = [...SCALE_PRESETS[draft.scale.points]];
        return redraw(dirty, '#sv-label-0');
      }
      if (a === 'domain-add') {
        draft.domains.push({ id: newId('d'), label: `하위 요인 ${draft.domains.length + 1}` });
        return redraw(dirty, `#sv-d-${draft.domains.length - 1}`);
      }
      if (a === 'domain-remove') {
        const k = Number(act.dataset.k);
        const gone = draft.domains[k];
        const n = draft.questions.filter((q) => q.domain === gone.id).length;
        if (n && !window.confirm(`"${gone.label}" 문항 ${n}개는 첫 하위 요인으로 옮깁니다. 지울까요?`)) return;
        draft.domains.splice(k, 1);
        draft.questions.forEach((q) => { if (q.domain === gone.id) q.domain = draft.domains[0].id; });
        return redraw(dirty, '[data-action="domain-add"]');
      }
      if (a === 'paste-preview') {
        const err = root.querySelector('[data-paste-error]');
        const result = parseItems(pasteText, {
          domains: draft.domains,
          defaultDomain: root.querySelector('[name="pasteDomain"]').value,
          defaultType: root.querySelector('[name="pasteType"]').value,
        });
        if (!result.items.length) {
          err.textContent = '문항을 찾지 못했습니다. 한 줄에 한 문항씩 붙여넣으세요.';
          err.hidden = false;
          return;
        }
        preview = result;
        return redraw(dirty, '[data-paste-preview] strong');
      }
      if (a === 'paste-cancel') {
        preview = null;
        return redraw(dirty, '#sv-paste-text');
      }
      if (a === 'paste-append') return applyPreview(false);
      if (a === 'paste-replace') {
        if (draft.questions.length && !window.confirm(`지금 문항 ${draft.questions.length}개를 지우고 붙여넣은 문항 ${preview.items.length}개로 바꿀까요? (저장해야 반영됩니다)`)) return;
        return applyPreview(true);
      }
      return;
    }
    const btn = event.target.closest('[data-q-action]');
    if (!btn) return;
    readForm();
    const i = Number(btn.dataset.i);
    const qs = draft.questions;
    if (btn.dataset.qAction === 'add') qs.push({ id: newQuestionId(), domain: draft.domains[0].id, type: 'scale', text: '' });
    if (btn.dataset.qAction === 'remove') qs.splice(i, 1);
    if (btn.dataset.qAction === 'up' && i > 0) [qs[i - 1], qs[i]] = [qs[i], qs[i - 1]];
    if (btn.dataset.qAction === 'down' && i < qs.length - 1) [qs[i + 1], qs[i]] = [qs[i], qs[i + 1]];
    redraw(dirty);
    if (btn.dataset.qAction === 'add') root.querySelector(`[data-q="${qs.length - 1}"] [name="text"]`)?.focus();
  };

  const onChange = (event) => {
    if (locked) return;
    const t = event.target;
    // 형식·척도 점수를 바꾸면 보기·역문항·선택지 칸이 달라지므로 다시 그린다
    if (t.name === 'type') {
      readForm();
      return redraw(dirty, `[data-q="${t.closest('[data-q]').dataset.q}"] [name="type"]`);
    }
    if (t.name === 'points') {
      readForm();
      const points = Number(t.value);
      draft.scale = { points, labels: [...SCALE_PRESETS[points]] };
      return redraw(dirty, '#sv-points');
    }
    if (t.name === 'domainLabel') {
      readForm();
      return redraw(dirty, `#${t.id}`);
    }
  };

  const onSubmit = (event) => {
    if (!event.target.matches('[data-survey-edit]')) return;
    event.preventDefault();
    readForm();
    const emptyDomain = draft.domains.findIndex((d) => !d.label.trim());
    if (emptyDomain !== -1) {
      draw(`하위 요인 ${emptyDomain + 1}의 이름을 쓰세요.`, `#sv-d-${emptyDomain}`);
      return;
    }
    const empty = draft.questions.findIndex((q) => !q.text.trim() || (q.type === 'choice' && (q.options ?? []).length < 2));
    if (empty !== -1) {
      draw(`${empty + 1}번 문항을 채우세요(객관식은 보기가 2개 이상이어야 합니다).`, `[data-q="${empty}"] [name="text"]`);
      return;
    }
    const instrument = Object.fromEntries(INSTRUMENT_FIELDS.map((f) => [f.id, String(draft.instrument[f.id] ?? '').trim()]));
    const ok = updateSurvey(survey.id, {
      title: draft.title.trim() || '설문',
      intro: draft.intro.trim(),
      instrument,
      domains: draft.domains.map((d) => ({ id: d.id, label: d.label.trim() })),
      scale: { points: draft.scale.points, labels: draft.scale.labels },
      questions: draft.questions.map((q) => {
        const out = { ...q };
        if (!out.sourceNo) delete out.sourceNo;
        if (!out.sourceText) delete out.sourceText;
        if (out.type !== 'scale') delete out.reverse;
        return out;
      }),
    });
    draft = fromSurvey();
    draw(ok ? '설문을 저장했습니다.' : '저장하지 못했습니다(잠긴 설문일 수 있습니다).');
  };

  draw();
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  root.addEventListener('submit', onSubmit);
  return () => {
    root.removeEventListener('click', onClick);
    root.removeEventListener('change', onChange);
    root.removeEventListener('submit', onSubmit);
  };
}
