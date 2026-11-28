// 교사: 원리 활동 진행 화면 (#/teacher/principle)
// 설명 화면과 문항(정답·설명 포함)을 크게 띄워 설명하고, 학생에게 열어 줄 화면을 정한다(2026-11-27 사용자 결정).
//   진행 제어를 켜면 학생은 교사가 연 화면까지만 자기 속도로 가고, 그다음은 기다린다. 화면 하나씩 또는 묶음 끝까지 한 번에 연다.
// 프로토타입: 같은 브라우저의 다른 탭에서 연 학생 화면에만 실시간으로 반영된다. 서버 모드(4-3): 회차 문서로 학생 기기에 실시간.
// 화면별 도착 학생 수(2026-11-28 사용자 결정): 학생 기록의 원리 활동(설명을 본 시각, 문항 답, 마친 시각)으로 계산해
//   목록의 화면마다 "n명"을 보이고, 학생 기록이 바뀌면 목록만 다시 그린다(띄운 설명 화면은 그대로).

import { PRINCIPLE_GROUPS, PRINCIPLE_ITEMS, PRINCIPLE_REFLECTION, PRINCIPLE_SLIDES, PRINCIPLE_STEPS } from '../../data/principleActivity.js';
import { getClassroom } from '../../state/classroomStore.js';
import { getPacing, setPacing, subscribePacing } from '../../state/pacingStore.js';
import { escapeHtml } from '../../ui/dom.js';
import { icons } from '../../ui/icons.js';
import { breadcrumb, notice } from '../../ui/components.js';
import { itemCardHtml } from '../research/principleParts.js';
import { researchStudents } from '../../state/researchRoster.js';
import { isFirebase } from '../../state/appMode.js';
import { itemResponses, reflectionList, slideViews } from '../../services/principleAnalysis.js';
import { mountSlide, slideHtml } from '../research/principleSlides.js';

const LAST = PRINCIPLE_STEPS.length - 1;

/** 학생이 간 가장 먼 화면 번호(시작 전이면 -1) */
export function furthestStep(principle) {
  if (!principle) return -1;
  let far = 0;
  PRINCIPLE_STEPS.forEach((st, i) => {
    const reached = st.kind === 'slide' ? principle.slides?.[st.id] : st.kind === 'item' ? principle.answers?.[st.id] : principle.finishedAt;
    if (reached) far = i;
  });
  return far;
}

/** 이 회차의 학생(예시 학생 제외) */
const sessionStudents = (sessionId) => researchStudents({ includeSamples: false, sessionIds: [sessionId] });

/** 회차의 화면별 도착 수: { total(시작한 학생), finished, reached: [i번 화면까지 온 학생 수] } */
export function arrivals(sessionId) {
  const fars = sessionStudents(sessionId)
    .filter((s) => s.record?.principle)
    .map((s) => ({ far: furthestStep(s.record.principle), done: Boolean(s.record.principle.finishedAt) }));
  return {
    total: fars.length,
    finished: fars.filter((f) => f.done).length,
    reached: PRINCIPLE_STEPS.map((_, i) => fars.filter((f) => f.far >= i).length),
  };
}

function stepLabel(step) {
  if (step.kind === 'slide') return `설명 ${PRINCIPLE_SLIDES.findIndex((s) => s.id === step.id) + 1}. ${step.title}`;
  if (step.kind === 'item') {
    const item = PRINCIPLE_ITEMS.find((it) => it.id === step.id);
    return `${step.title}. ${item.prompt}`;
  }
  return '마무리 (서술)';
}

export function renderPrinciplePace(root) {
  const classroom = getClassroom();
  const { sessionId } = classroom;
  let pacing = getPacing(sessionId);
  let preview = Math.min(pacing.openUpTo, LAST);
  let unmountSlide = null;

  function stageHtml() {
    const step = PRINCIPLE_STEPS[preview];
    if (step.kind === 'slide') {
      const n = PRINCIPLE_SLIDES.findIndex((s) => s.id === step.id);
      return slideHtml(PRINCIPLE_SLIDES[n], n + 1, PRINCIPLE_SLIDES.length);
    }
    if (step.kind === 'item') return itemCardHtml(PRINCIPLE_ITEMS.find((it) => it.id === step.id), { reveal: true, showNext: false });
    return `<section class="pr-card" aria-labelledby="pr-q"><h2 class="pr-q" id="pr-q">마무리</h2>
      <p class="lead">학생은 "${escapeHtml(PRINCIPLE_REFLECTION)}"에 답하고 활동을 마칩니다. 마치면 1단계가 열립니다.</p></section>`;
  }

  function listHtml() {
    const arr = arrivals(sessionId);
    return `<li class="pace-arrivals meta" aria-live="polite">시작한 학생 ${arr.total}명, 마친 학생 ${arr.finished}명</li>` + PRINCIPLE_GROUPS.map((g) => {
      const steps = PRINCIPLE_STEPS.map((st, i) => ({ st, i })).filter(({ st }) => st.group === g.id);
      const allOpen = steps.every(({ i }) => i <= pacing.openUpTo);
      return `<li class="pace-group">
        <div class="pace-group__head"><p class="pace-group__title">${escapeHtml(g.title)}</p>
          ${pacing.paced && !allOpen ? `<button type="button" class="button button--ghost button--small" data-open-group="${g.id}">끝까지 열기</button>` : ''}</div>
        <ol class="pace-steps">${steps.map(({ st, i }) => {
          const open = !pacing.paced || i <= pacing.openUpTo;
          return `<li><button type="button" class="pace-step${i === preview ? ' is-current' : ''}${open ? ' is-open' : ''}" data-preview="${i}"${i === preview ? ' aria-current="step"' : ''}>
            <span class="pace-step__state">${open ? icons.eye : icons.lock}<span class="visually-hidden">${open ? '학생에게 열림' : '닫힘'}</span></span>
            <span class="pace-step__label">${escapeHtml(stepLabel(st))}</span>
            <span class="pace-step__count num" title="이 화면까지 온 학생">${arr.reached[i]}명<span class="visually-hidden"> 도착</span></span>
            ${pacing.paced && i === pacing.openUpTo ? '<span class="tag tag--strong">여기까지 열림</span>' : ''}
          </button></li>`;
        }).join('')}</ol>
      </li>`;
    }).join('');
  }

  /** 보고 있는 화면의 응답 현황(2026-11-28): 문항은 보기마다 고른 학생, 마무리는 쓴 답, 설명은 본 학생 수. 크게 보기에는 나오지 않는다 */
  function responsesHtml() {
    const step = PRINCIPLE_STEPS[preview];
    // 이 화면은 한 회차만 보므로 이름은 연구 번호만(회차 이름을 붙이지 않음)
    const students = sessionStudents(sessionId).map((s) => ({ ...s, pseudonym: s.researchId ?? s.pseudonym }));
    const head = (extra) => `<div class="section-head"><h2 id="resp-title" class="section-title">응답 현황 <span class="meta">${escapeHtml(stepLabel(step).split('.')[0])}</span></h2>${extra}</div>`;
    if (step.kind === 'slide') {
      const v = slideViews(students, step.id);
      return `${head('')}<p class="meta">이 설명 화면을 본 학생 <strong class="num">${v.seen}</strong>명 / 활동을 시작한 학생 ${v.started}명</p>`;
    }
    if (step.kind === 'end') {
      const list = reflectionList(students);
      return `${head(`<span class="meta">${list.length}명이 씀</span>`)}
        <p class="meta">"${escapeHtml(PRINCIPLE_REFLECTION)}"</p>
        ${list.length ? `<ul class="resp-reflections">${list.map((r) => `<li><span class="tag">${escapeHtml(r.who)}</span> ${escapeHtml(r.text)}</li>`).join('')}</ul>` : '<p class="empty-text">아직 쓴 학생이 없어요.</p>'}`;
    }
    const item = PRINCIPLE_ITEMS.find((it) => it.id === step.id);
    const r = itemResponses(students, item);
    const top = Math.max(1, ...r.options.map((o) => o.count));
    return `${head(`<span class="meta">답한 학생 <strong class="num">${r.answered}</strong>명 / 시작한 학생 ${r.started}명${r.rate != null ? `, 정답률 <strong class="num">${r.rate}%</strong>` : ''}${r.seconds != null ? `, 평균 ${r.seconds}초` : ''}</span>`)}
      <ol class="resp-options">${r.options.map((o, k) => `<li class="resp-option${o.isAnswer ? ' is-answer' : ''}">
        <div class="resp-option__head"><span class="resp-option__no num">${k + 1}</span><span class="resp-option__text">${escapeHtml(o.text)}</span>${o.isAnswer ? `<span class="tag tag--mint">${icons.check}<span>정답</span></span>` : ''}</div>
        <div class="resp-option__bar"><span class="resp-option__fill" style="width:${Math.round((o.count / top) * 100)}%"></span><span class="resp-option__count num">${o.count}명${r.answered ? ` (${Math.round((o.count / r.answered) * 100)}%)` : ''}</span></div>
        ${o.students.length ? `<details class="disclosure resp-option__who"><summary>고른 학생 ${o.students.length}명</summary><p>${o.students.map((n) => `<span class="tag">${escapeHtml(n)}</span>`).join(' ')}</p></details>` : ''}
      </li>`).join('')}</ol>
      ${r.waiting.length ? `<details class="disclosure"><summary>아직 답하지 않은 학생 ${r.waiting.length}명</summary><p>${r.waiting.map((n) => `<span class="tag">${escapeHtml(n)}</span>`).join(' ')}</p></details>` : ''}
      <p class="meta">처음 고른 답 기준입니다(학생은 답을 바꿀 수 없어요). 학생이 답하면 바로 바뀝니다.</p>`;
  }

  function statusText() {
    if (!pacing.paced) return '진행 제어가 꺼져 있어 학생이 자기 속도로 끝까지 진행합니다.';
    return `학생에게 열린 마지막 화면: ${stepLabel(PRINCIPLE_STEPS[pacing.openUpTo])}`;
  }

  function controlHtml() {
    return `<h2 id="pace-title" class="section-title">진행 제어</h2>
      <label class="check"><input type="checkbox" data-paced${pacing.paced ? ' checked' : ''}><span>학생이 내가 연 화면까지만 가게 하기 <span class="meta">끄면 학생이 자기 속도로 끝까지 진행합니다.</span></span></label>
      <p class="pace-status" aria-live="polite">${escapeHtml(statusText())}</p>
      ${pacing.paced ? `<div class="actions actions--start pace-actions">
        <button type="button" class="button button--primary" data-open-next${pacing.openUpTo >= LAST ? ' disabled' : ''}>다음 화면 열기 ${icons.chevronRight}</button>
        <button type="button" class="button button--secondary" data-open-here${preview === pacing.openUpTo ? ' disabled' : ''}>보고 있는 화면까지 열기</button>
        <button type="button" class="button button--ghost" data-open-all${pacing.openUpTo >= LAST ? ' disabled' : ''}>모두 열기</button>
        <button type="button" class="button button--ghost" data-reset${pacing.openUpTo === 0 ? ' disabled' : ''}>처음으로 되돌리기</button>
      </div>` : ''}`;
  }

  function stageInner() {
    const full = !!document.fullscreenElement;
    return `<div class="pace__bar">
        <button type="button" class="button button--secondary button--small" data-step="-1"${preview === 0 ? ' disabled' : ''}>${icons.chevronLeft}<span>이전 화면</span></button>
        <span class="meta num">${preview + 1} / ${PRINCIPLE_STEPS.length}</span>
        <button type="button" class="button button--secondary button--small" data-step="1"${preview === LAST ? ' disabled' : ''}><span>다음 화면</span>${icons.chevronRight}</button>
        ${pacing.paced ? `<button type="button" class="button button--primary button--small" data-open-next${pacing.openUpTo >= LAST ? ' disabled' : ''}>다음 화면 열기</button>` : ''}
        <button type="button" class="button button--ghost button--small" data-fullscreen>${icons.grow}<span>${full ? '크게 보기 닫기' : '크게 보기'}</span></button>
      </div>
      ${pacing.paced && preview > pacing.openUpTo ? `<p class="note-chip">${icons.lock}<span>학생에게 아직 열지 않은 화면입니다.</span></p>` : ''}
      ${stageHtml()}`;
  }

  function draw() {
    unmountSlide?.();
    if (!root.querySelector('.page--pace')) {
      root.innerHTML = `<div class="page page--wide page--pace">
        ${breadcrumb([{ label: '교사 화면', href: '#/teacher' }, { label: '원리 활동 진행' }])}
        <header class="page-intro">
          <h1>"AI는 어떻게 답할까?" 진행</h1>
          <p class="lead">화면을 크게 띄워 설명하고, 학생에게 열어 줄 화면을 정합니다. <span class="tag">${escapeHtml(classroom.sessionLabel)}</span></p>
        </header>
        ${isFirebase ? '' : notice('info', '프로토타입: 같은 브라우저에서만 실시간으로 반영돼요', '이 화면과 학생 화면(AI와 탐구하기)을 같은 브라우저의 두 탭으로 열면 바로 반영됩니다. 서버 연결 뒤에는 학생 기기에 실시간으로 반영됩니다.')}
        <section class="panel pace-control" aria-labelledby="pace-title" data-region="control"></section>
        <div class="pace">
          <nav class="pace__list panel" aria-label="원리 활동 화면 목록"><ol class="pace-groups" data-region="list"></ol></nav>
          <div class="pace__main">
            <div class="pace__stage" id="pace-stage"></div>
            <section class="panel pace-responses" aria-labelledby="resp-title" data-region="responses"></section>
          </div>
        </div>
      </div>`;
    }
    root.querySelector('[data-region="control"]').innerHTML = controlHtml();
    root.querySelector('[data-region="list"]').innerHTML = listHtml();
    root.querySelector('[data-region="responses"]').innerHTML = responsesHtml();
    const stage = root.querySelector('#pace-stage');
    stage.innerHTML = stageInner();
    unmountSlide = PRINCIPLE_STEPS[preview].kind === 'slide' ? mountSlide(stage) : null;
  }

  const open = (n) => {
    pacing = setPacing(sessionId, { openUpTo: Math.min(LAST, n) });
  };

  const onClick = (e) => {
    const t = e.target;
    const pv = t.closest('[data-preview]');
    if (pv) { preview = Number(pv.dataset.preview); draw(); return; }
    const st = t.closest('[data-step]');
    if (st) { preview = Math.max(0, Math.min(LAST, preview + Number(st.dataset.step))); draw(); return; }
    if (t.closest('[data-open-next]')) { open(pacing.openUpTo + 1); preview = pacing.openUpTo; draw(); return; }
    if (t.closest('[data-open-here]')) { open(preview); draw(); return; }
    if (t.closest('[data-open-all]')) { open(LAST); draw(); return; }
    const grp = t.closest('[data-open-group]');
    if (grp) {
      const lastOfGroup = PRINCIPLE_STEPS.reduce((m, s, i) => (s.group === grp.dataset.openGroup ? i : m), 0);
      open(Math.max(pacing.openUpTo, lastOfGroup));
      draw();
      return;
    }
    if (t.closest('[data-reset]')) {
      if (!window.confirm('학생에게 첫 설명 화면만 열린 상태로 되돌릴까요? 이미 답한 기록은 지워지지 않습니다.')) return;
      open(0);
      preview = 0;
      draw();
      return;
    }
    if (t.closest('[data-fullscreen]')) {
      const stage = root.querySelector('#pace-stage');
      if (document.fullscreenElement) document.exitFullscreen?.();
      else stage.requestFullscreen?.();
    }
  };
  const onChange = (e) => {
    if (!e.target.matches('[data-paced]')) return;
    pacing = setPacing(sessionId, { paced: e.target.checked });
    draw();
  };
  // 다른 탭(또 다른 교사 화면)에서 바꾼 경우
  const unsubscribe = subscribePacing(sessionId, (next) => {
    if (next.updatedAt === pacing.updatedAt) return;
    pacing = next;
    draw();
  });

  const onFullscreen = () => draw();
  // 학생 기록이 바뀌면(서버 모드: 학생 기기에서 진행) 목록의 도착 수만 다시 그린다
  const redrawList = () => {
    // 진행 중 세션이 바뀌었으면(로그인 직후 서버 값이 들어옴, 다른 탭에서 바꿈) 화면 전체를 다시 그린다
    if (getClassroom().sessionId !== sessionId) {
      window.dispatchEvent(new Event('hashchange'));
      return;
    }
    const list = root.querySelector('[data-region="list"]');
    if (!list) return;
    const focused = document.activeElement?.closest?.('[data-preview]')?.dataset.preview;
    list.innerHTML = listHtml();
    if (focused != null) list.querySelector(`[data-preview="${focused}"]`)?.focus();
    // 응답 현황: 펼친 학생 목록은 펼친 채로 둔다
    const resp = root.querySelector('[data-region="responses"]');
    if (resp) {
      const open = [...resp.querySelectorAll('details')].map((d, i) => (d.open ? i : -1)).filter((i) => i >= 0);
      resp.innerHTML = responsesHtml();
      const ds = resp.querySelectorAll('details');
      open.forEach((i) => { if (ds[i]) ds[i].open = true; });
    }
  };
  window.addEventListener('checkyourprove:data', redrawList);

  draw();
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  document.addEventListener('fullscreenchange', onFullscreen);
  return () => {
    unmountSlide?.();
    document.removeEventListener('fullscreenchange', onFullscreen);
    window.removeEventListener('checkyourprove:data', redrawList);
    unsubscribe();
    root.removeEventListener('click', onClick);
    root.removeEventListener('change', onChange);
  };
}
