// AI와 탐구하기: 사전·사후 설문 (구현 4)
// 사전 설문은 1단계 전, 사후 설문은 4단계 제출 뒤. 같은 문항 세트를 쓴다. 모든 문항에 답해야 제출되고, 제출하면 고칠 수 없다.
// 응답 시간(시작·제출·화면을 보고 있던 시간), 문항별 처음 답한 시각, 답을 바꾼 횟수를 남긴다.
// 학생이 응답을 시작하면 그 설문은 잠긴다(교사가 문항을 고칠 수 없음).

import { SCALE_LABELS } from '../../data/surveyDefaults.js';
import { getClassroom } from '../../state/classroomStore.js';
import {
  ensureSurveyResponse, getSurveyResponse, postSurveyState, preStageBlocker, researchParticipating, saveResearch,
} from '../../state/researchStore.js';
import { findSurvey, lockSurvey } from '../../state/surveyStore.js';
import { escapeHtml, formatDateTime } from '../../ui/dom.js';
import { breadcrumb, notice, renderNotFound } from '../../ui/components.js';

const KIND_LABEL = { pre: '사전 설문', post: '사후 설문' };
const TICK_MS = 5000;

const answered = (q, v) => (q.type === 'scale' ? v != null : String(v ?? '').trim().length > 0);

export function renderSurvey(root, [kind]) {
  const classroom = getClassroom();
  const crumbs = [{ label: '홈', href: '#/' }, { label: 'AI와 탐구하기', href: '#/research' }, { label: KIND_LABEL[kind] ?? '설문' }];
  const survey = findSurvey(classroom.surveyId);
  if (!KIND_LABEL[kind] || !survey) {
    renderNotFound(root);
    return null;
  }
  const blockedPage = (title, body) => {
    root.innerHTML = `<div class="page">${breadcrumb(crumbs)}<h1>${KIND_LABEL[kind]}</h1>${notice('lock', title, body)}<p><a class="button button--secondary" href="#/research">탐구 단계 목록으로</a></p></div>`;
    return null;
  };
  if (preStageBlocker(classroom)?.step === 'consent') return blockedPage('먼저 연구 동의에 답하세요', '탐구 단계 목록에서 "연구 참여 동의"를 먼저 하세요.');
  if (!researchParticipating(classroom)) return blockedPage('설문을 하지 않아요', '연구에 참여하지 않기로 해서 설문은 하지 않습니다. 탐구 활동은 그대로 할 수 있어요.');
  const existing = getSurveyResponse(kind);
  if (!existing?.submittedAt) {
    if (kind === 'pre') {
      if (!classroom.surveyPreOpen) return blockedPage('아직 열리지 않았어요', '선생님이 사전 설문을 열면 할 수 있어요.');
    } else {
      const state = postSurveyState(classroom);
      if (state === 'closed') return blockedPage('아직 열리지 않았어요', '선생님이 사후 설문을 열면 할 수 있어요.');
      if (state === 'waiting') return blockedPage('4단계를 먼저 제출하세요', '사후 설문은 4단계 최종 증명을 제출한 뒤에 할 수 있어요.');
    }
  }

  const res = existing ?? ensureSurveyResponse(kind, survey.id);
  const locked = Boolean(res.submittedAt);
  if (!locked) {
    lockSurvey(survey.id);
    saveResearch();
  }
  const questions = survey.questions;

  function questionHtml(q, i) {
    const v = res.answers[q.id];
    const legend = `<span class="survey-q__num num">${i + 1}</span>${escapeHtml(q.text)}`;
    if (locked) {
      const shown = q.type === 'scale' ? (v == null ? '–' : `${v} ${SCALE_LABELS[v - 1]}`) : q.type === 'choice' ? (v ?? '–') : (v || '–');
      return `<div class="survey-q"><p class="survey-q__text">${legend}</p><p class="survey-q__answer">${escapeHtml(String(shown))}</p></div>`;
    }
    if (q.type === 'scale') {
      return `<fieldset class="survey-q" id="sq-${q.id}">
        <legend class="survey-q__text">${legend}</legend>
        <div class="scale-row">${SCALE_LABELS.map((label, k) => `<label class="pick pick--scale"><input type="radio" name="${q.id}" value="${k + 1}"${v === k + 1 ? ' checked' : ''}><span><strong class="num">${k + 1}</strong><span>${escapeHtml(label)}</span></span></label>`).join('')}</div>
        <p class="field__error" data-error-for="${q.id}" hidden></p>
      </fieldset>`;
    }
    if (q.type === 'choice') {
      return `<fieldset class="survey-q choice-group" id="sq-${q.id}">
        <legend class="survey-q__text">${legend}</legend>
        ${(q.options ?? []).map((o) => `<label class="check"><input type="radio" name="${q.id}" value="${escapeHtml(o)}"${v === o ? ' checked' : ''}><span>${escapeHtml(o)}</span></label>`).join('')}
        <p class="field__error" data-error-for="${q.id}" hidden></p>
      </fieldset>`;
    }
    const input = q.type === 'short'
      ? `<input type="text" class="field__input" id="sq-${q.id}" name="${q.id}" value="${escapeHtml(v ?? '')}">`
      : `<textarea class="field__input" id="sq-${q.id}" name="${q.id}" rows="4">${escapeHtml(v ?? '')}</textarea>`;
    return `<div class="survey-q field"><label class="survey-q__text" for="sq-${q.id}">${legend}</label>${input}<p class="field__error" data-error-for="${q.id}" hidden></p></div>`;
  }

  function draw() {
    const done = questions.filter((q) => answered(q, res.answers[q.id])).length;
    root.innerHTML = `<div class="page page--survey">
      ${breadcrumb(crumbs)}
      <header class="page-intro">
        <h1>${KIND_LABEL[kind]}</h1>
        <p class="grade-who"><span class="tag">${escapeHtml(classroom.sessionLabel)}</span></p>
        <p class="lead">${escapeHtml(survey.intro ?? '')}</p>
      </header>
      ${locked ? notice('success', `${KIND_LABEL[kind]}을 제출했습니다`, `${formatDateTime(res.submittedAt)}에 제출했습니다. 제출한 응답은 고칠 수 없어요.`) : `<p class="survey-progress" data-survey-progress>${done} / ${questions.length} 답함</p>`}
      <form class="survey-form" data-survey-form novalidate>
        ${questions.map(questionHtml).join('')}
        <div class="submit-errors" data-survey-errors aria-live="assertive"></div>
        <div class="actions">
          <a class="button button--ghost" href="#/research">탐구 단계 목록으로</a>
          ${locked ? '' : `<button type="submit" class="button button--primary">${KIND_LABEL[kind]} 제출하기</button>`}
        </div>
      </form>
    </div>`;
  }

  // 시간 기록
  let lastTick = Date.now();
  const tick = () => {
    const t = Date.now();
    if (!locked && document.visibilityState !== 'hidden') res.activeMs += Math.min(t - lastTick, TICK_MS * 3);
    lastTick = t;
  };
  const timer = window.setInterval(() => {
    tick();
    if (!locked) saveResearch();
  }, TICK_MS);

  let saveTimer = 0;
  const onInput = (event) => {
    if (locked) return;
    const q = questions.find((x) => x.id === event.target.name);
    if (!q) return;
    if (event.target.type === 'radio' && !event.target.checked) return;
    const value = q.type === 'scale' ? Number(event.target.value) : event.target.value;
    if (res.answers[q.id] !== undefined && res.answers[q.id] !== value && (q.type === 'scale' || q.type === 'choice')) res.changes += 1;
    res.answers[q.id] = value;
    if (answered(q, value)) res.answeredAt[q.id] ??= new Date().toISOString();
    const slot = root.querySelector(`[data-error-for="${q.id}"]`);
    if (slot) slot.hidden = true;
    const prog = root.querySelector('[data-survey-progress]');
    if (prog) prog.textContent = `${questions.filter((x) => answered(x, res.answers[x.id])).length} / ${questions.length} 답함`;
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => saveResearch(), 300);
  };
  const onSubmit = (event) => {
    if (!event.target.matches('[data-survey-form]')) return;
    event.preventDefault();
    const missing = questions.filter((q) => q.required !== false && !answered(q, res.answers[q.id]));
    root.querySelectorAll('[data-error-for]').forEach((el) => { el.hidden = true; });
    if (missing.length) {
      missing.forEach((q) => {
        const slot = root.querySelector(`[data-error-for="${q.id}"]`);
        if (slot) {
          slot.hidden = false;
          slot.textContent = q.type === 'long' || q.type === 'short' ? '답을 쓰세요. 쓸 내용이 없으면 "없음"이라고 쓰세요.' : '하나를 고르세요.';
        }
      });
      root.querySelector('[data-survey-errors]').innerHTML = notice('warn', `답하지 않은 문항이 ${missing.length}개 있습니다`, '모든 문항에 답해야 제출할 수 있어요.');
      const first = root.querySelector(`#sq-${missing[0].id}`);
      first?.scrollIntoView({ block: 'center' });
      (first?.matches('input, textarea') ? first : first?.querySelector('input'))?.focus();
      return;
    }
    if (!window.confirm(`${KIND_LABEL[kind]}을 제출할까요? 제출하면 고칠 수 없어요.`)) return;
    tick();
    res.submittedAt = new Date().toISOString();
    saveResearch();
    window.location.hash = '#/research';
  };

  draw();
  root.addEventListener('input', onInput);
  root.addEventListener('change', onInput);
  root.addEventListener('submit', onSubmit);
  return () => {
    tick();
    window.clearInterval(timer);
    window.clearTimeout(saveTimer);
    if (!locked) saveResearch();
    root.removeEventListener('input', onInput);
    root.removeEventListener('change', onInput);
    root.removeEventListener('submit', onSubmit);
  };
}
