// 교사 화면: 설문 문항 고치기 (구현 4)
// 문항마다 영역(증명 개념 이해, 수학 능력, AI 리터러시), 형식(5점 척도, 객관식, 단답, 서술형), 문항 글,
// 객관식 보기(줄마다 하나), 5점 척도 역문항 여부를 정한다. 학생이 응답을 시작한 설문은 잠겨 읽기만 한다.

import { QUESTION_TYPES, SCALE_LABELS, SURVEY_DOMAINS } from '../../data/surveyDefaults.js';
import { findSurvey, newQuestionId, updateSurvey } from '../../state/surveyStore.js';
import { escapeHtml, formatDateTime } from '../../ui/dom.js';
import { breadcrumb, notice, renderNotFound } from '../../ui/components.js';

const label = (list, id) => list.find((x) => x.id === id)?.label ?? id;

export function renderSurveyEdit(root, [id]) {
  const survey = findSurvey(id);
  if (!survey) {
    renderNotFound(root);
    return null;
  }
  // 고치는 동안의 초안 (저장 전까지 설문에 쓰지 않는다)
  let draft = JSON.parse(JSON.stringify({ title: survey.title, intro: survey.intro ?? '', questions: survey.questions }));
  const locked = Boolean(survey.lockedAt);

  const select = (name, list, value, id) => `<select class="field__select" id="${id}" name="${name}">${list.map((o) => `<option value="${o.id}"${o.id === value ? ' selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}</select>`;

  function qEditor(q, i) {
    return `<fieldset class="choice-group rubric-edit" data-q="${i}">
      <legend>${i + 1}. ${escapeHtml(label(SURVEY_DOMAINS, q.domain))}, ${escapeHtml(label(QUESTION_TYPES, q.type))}</legend>
      <div class="q-grid">
        <div class="field field--inline"><label class="field__label" for="q-${i}-domain">영역</label>${select('domain', SURVEY_DOMAINS, q.domain, `q-${i}-domain`)}</div>
        <div class="field field--inline"><label class="field__label" for="q-${i}-type">형식</label>${select('type', QUESTION_TYPES, q.type, `q-${i}-type`)}</div>
      </div>
      <div class="field"><label class="field__label" for="q-${i}-text">문항</label><textarea class="field__input" id="q-${i}-text" name="text" rows="2">${escapeHtml(q.text)}</textarea></div>
      ${q.type === 'choice' ? `<div class="field"><label class="field__label" for="q-${i}-opts">보기 <span class="field__req">(줄마다 하나)</span></label><textarea class="field__input" id="q-${i}-opts" name="options" rows="4">${escapeHtml((q.options ?? []).join('\n'))}</textarea></div>` : ''}
      ${q.type === 'scale' ? `<label class="check"><input type="checkbox" name="reverse"${q.reverse ? ' checked' : ''}><span>역문항 <span class="meta">점수가 높을수록 부정적인 문항입니다. 분석할 때 6 − 점수로 바꾸어 영역 평균을 냅니다.</span></span></label>` : ''}
      <div class="actions actions--start">
        <button type="button" class="button button--ghost button--small" data-q-action="up" data-i="${i}"${i === 0 ? ' disabled' : ''}>위로</button>
        <button type="button" class="button button--ghost button--small" data-q-action="down" data-i="${i}"${i === draft.questions.length - 1 ? ' disabled' : ''}>아래로</button>
        <button type="button" class="button button--ghost button--small" data-q-action="remove" data-i="${i}">이 문항 지우기</button>
      </div>
    </fieldset>`;
  }

  function qRead(q, i) {
    const extra = q.type === 'choice' ? `<ul class="tag-list">${(q.options ?? []).map((o) => `<li class="tag">${escapeHtml(o)}</li>`).join('')}</ul>` : q.type === 'scale' ? `<p class="meta">1 ${SCALE_LABELS[0]} ~ 5 ${SCALE_LABELS[4]}${q.reverse ? ', 역문항' : ''}</p>` : '';
    return `<li class="survey-q"><p class="survey-q__text"><span class="survey-q__num num">${i + 1}</span>${escapeHtml(q.text)}</p><p class="meta">${escapeHtml(label(SURVEY_DOMAINS, q.domain))}, ${escapeHtml(label(QUESTION_TYPES, q.type))}</p>${extra}</li>`;
  }

  function readForm() {
    const form = root.querySelector('[data-survey-edit]');
    if (!form) return;
    draft.title = form.querySelector('[name="title"]').value;
    draft.intro = form.querySelector('[name="intro"]').value;
    form.querySelectorAll('[data-q]').forEach((box) => {
      const q = draft.questions[Number(box.dataset.q)];
      q.domain = box.querySelector('[name="domain"]').value;
      q.type = box.querySelector('[name="type"]').value;
      q.text = box.querySelector('[name="text"]').value;
      const opts = box.querySelector('[name="options"]');
      if (opts) q.options = opts.value.split('\n').map((x) => x.trim()).filter(Boolean);
      const rev = box.querySelector('[name="reverse"]');
      q.reverse = rev ? rev.checked : false;
    });
  }

  function draw(status = '') {
    root.innerHTML = `<div class="page page--teacher">
      ${breadcrumb([{ label: '교사 화면', href: '#/teacher' }, { label: '설문과 연구 동의', href: '#/teacher/surveys' }, { label: survey.title }])}
      <header class="page-intro"><h1>${escapeHtml(survey.title)}</h1></header>
      ${locked
        ? `${notice('lock', '잠긴 설문입니다', `${formatDateTime(survey.lockedAt)}에 학생 응답이 시작되어 문항을 고칠 수 없습니다. 고치려면 설문 목록에서 복사해 새 설문을 만드세요.`)}
          <p class="lead">${escapeHtml(survey.intro ?? '')}</p>
          <ol class="survey-form survey-read">${survey.questions.map(qRead).join('')}</ol>`
        : `<form class="settings-form rubric-form" data-survey-edit novalidate>
          <div class="field"><label class="field__label" for="sv-title">설문 이름</label><input type="text" class="field__input" id="sv-title" name="title" value="${escapeHtml(draft.title)}"></div>
          <div class="field"><label class="field__label" for="sv-intro">학생에게 보이는 안내</label><textarea class="field__input" id="sv-intro" name="intro" rows="2">${escapeHtml(draft.intro)}</textarea></div>
          ${draft.questions.map(qEditor).join('') || '<p class="empty-text">아직 문항이 없습니다.</p>'}
          <div class="actions actions--start"><button type="button" class="button button--secondary" data-q-action="add">문항 추가</button></div>
          <div class="actions">
            <p class="save-status" role="status">${escapeHtml(status)}</p>
            <a class="button button--ghost" href="#/teacher/surveys">설문 목록</a>
            <button type="submit" class="button button--primary">설문 저장</button>
          </div>
        </form>`}
    </div>`;
  }

  const onClick = (event) => {
    const btn = event.target.closest('[data-q-action]');
    if (!btn || locked) return;
    readForm();
    const i = Number(btn.dataset.i);
    const qs = draft.questions;
    if (btn.dataset.qAction === 'add') qs.push({ id: newQuestionId(), domain: 'concept', type: 'scale', text: '' });
    if (btn.dataset.qAction === 'remove') qs.splice(i, 1);
    if (btn.dataset.qAction === 'up' && i > 0) [qs[i - 1], qs[i]] = [qs[i], qs[i - 1]];
    if (btn.dataset.qAction === 'down' && i < qs.length - 1) [qs[i + 1], qs[i]] = [qs[i], qs[i + 1]];
    draw('저장하지 않은 변경 사항이 있습니다.');
    if (btn.dataset.qAction === 'add') root.querySelector(`[data-q="${qs.length - 1}"] [name="text"]`)?.focus();
  };
  const onChange = (event) => {
    // 형식을 바꾸면 보기·역문항 칸이 달라지므로 다시 그린다
    if (event.target.name !== 'type' || locked) return;
    readForm();
    draw('저장하지 않은 변경 사항이 있습니다.');
  };
  const onSubmit = (event) => {
    if (!event.target.matches('[data-survey-edit]')) return;
    event.preventDefault();
    readForm();
    const empty = draft.questions.findIndex((q) => !q.text.trim() || (q.type === 'choice' && (q.options ?? []).length < 2));
    if (empty !== -1) {
      draw(`${empty + 1}번 문항을 채우세요(객관식은 보기가 2개 이상이어야 합니다).`);
      return;
    }
    const ok = updateSurvey(survey.id, { title: draft.title.trim() || '설문', intro: draft.intro.trim(), questions: draft.questions });
    draft = JSON.parse(JSON.stringify({ title: survey.title, intro: survey.intro, questions: survey.questions }));
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
