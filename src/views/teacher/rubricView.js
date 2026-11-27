// 교사 화면: 루브릭 보기·고치기
// 기준 이름, 설명, 점수별 설명을 고칠 수 있다. 점수 범위와 합계(10점)는 연구 비교를 위해 고정한다.
// 고친 시각은 그 뒤에 매긴 점수에 함께 기록된다(state/gradingStore.js).

import { DEFAULT_RUBRIC, RUBRIC_TOTAL } from '../../data/rubric.js';
import { activeRubric, getGrading, resetRubric, saveRubric } from '../../state/gradingStore.js';
import { escapeHtml, formatDateTime } from '../../ui/dom.js';
import { breadcrumb } from '../../ui/components.js';

export function renderRubric(root) {
  const draw = (status = '') => {
    const rubric = activeRubric();
    const edited = getGrading().rubricEditedAt;
    const blocks = rubric.map((c, i) => {
      const levels = Object.keys(c.levels).map(Number).sort((a, b) => b - a).map((n) => `<div class="field rubric-level">
          <label class="field__label" for="r-${c.id}-l${n}"><span class="num">${n}점</span></label>
          <input type="text" class="field__input" id="r-${c.id}-l${n}" name="${c.id}.l${n}" value="${escapeHtml(c.levels[n])}">
        </div>`).join('');
      return `<fieldset class="choice-group rubric-edit">
        <legend>${i + 1}. ${escapeHtml(c.title)} <span class="meta">0~${c.max}점</span></legend>
        <div class="field">
          <label class="field__label" for="r-${c.id}-title">기준 이름</label>
          <input type="text" class="field__input" id="r-${c.id}-title" name="${c.id}.title" value="${escapeHtml(c.title)}">
        </div>
        <div class="field">
          <label class="field__label" for="r-${c.id}-desc">설명</label>
          <textarea class="field__input" id="r-${c.id}-desc" name="${c.id}.desc" rows="2">${escapeHtml(c.desc)}</textarea>
        </div>
        ${levels}
      </fieldset>`;
    }).join('');
    root.innerHTML = `<div class="page page--teacher">
      ${breadcrumb([{ label: '관리자 설정', href: '#/admin/tools' }, { label: '채점 루브릭' }])}
      <header class="page-intro">
        <h1>채점 루브릭</h1>
        <p class="lead">1·2·4단계 증명을 같은 기준으로 채점합니다. 기준 이름과 점수 설명을 고칠 수 있지만, 점수 범위와 합계(${RUBRIC_TOTAL}점)는 바꿀 수 없습니다.</p>
        <p class="meta">${edited ? `마지막으로 고친 시각: ${escapeHtml(formatDateTime(edited))}. 그 뒤에 매긴 점수에는 고친 시각이 함께 기록됩니다.` : '기본 루브릭(2026-11-26 확정)을 쓰고 있습니다.'}</p>
      </header>
      <form class="settings-form rubric-form" data-rubric-form novalidate>
        ${blocks}
        <div class="actions">
          <p class="save-status" data-rubric-status aria-live="polite">${escapeHtml(status)}</p>
          <button type="button" class="button button--ghost" data-action="reset">기본 루브릭으로 되돌리기</button>
          <button type="submit" class="button button--primary">루브릭 저장</button>
        </div>
      </form>
    </div>`;
  };

  const onSubmit = (event) => {
    if (!event.target.matches('[data-rubric-form]')) return;
    event.preventDefault();
    const data = new FormData(event.target);
    const edits = {};
    DEFAULT_RUBRIC.forEach((c) => {
      const levels = {};
      Object.keys(c.levels).forEach((n) => {
        const text = String(data.get(`${c.id}.l${n}`) ?? '').trim();
        if (text && text !== c.levels[n]) levels[n] = text;
      });
      const title = String(data.get(`${c.id}.title`) ?? '').trim();
      const desc = String(data.get(`${c.id}.desc`) ?? '').trim();
      const e = {};
      if (title && title !== c.title) e.title = title;
      if (desc && desc !== c.desc) e.desc = desc;
      if (Object.keys(levels).length) e.levels = levels;
      if (Object.keys(e).length) edits[c.id] = e;
    });
    const ok = saveRubric(Object.keys(edits).length ? edits : null);
    draw(ok ? '루브릭을 저장했습니다.' : '이 브라우저에 저장하지 못했습니다.');
  };
  const onClick = (event) => {
    if (!event.target.closest('[data-action="reset"]')) return;
    if (!window.confirm('고친 내용을 지우고 기본 루브릭으로 되돌릴까요?')) return;
    resetRubric();
    draw('기본 루브릭으로 되돌렸습니다.');
  };

  draw();
  root.addEventListener('submit', onSubmit);
  root.addEventListener('click', onClick);
  return () => {
    root.removeEventListener('submit', onSubmit);
    root.removeEventListener('click', onClick);
  };
}
