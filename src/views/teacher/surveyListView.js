// 교사 화면: 설문 목록과 연구 동의서 (구현 4)
// 설문(문항 세트)을 만들고 복사·지우고, 세션마다 쓸 설문은 수업 설정에서 고른다. 학생이 응답을 시작한 설문은 잠긴다.

import { getSessions, sessionConfig, sessionLabel } from '../../state/sessionStore.js';
import { consentDoc, copySurvey, createSurvey, listSurveys, removeSurvey, saveConsent } from '../../state/surveyStore.js';
import { escapeHtml, formatDateTime } from '../../ui/dom.js';
import { breadcrumb, notice } from '../../ui/components.js';

export function renderSurveyList(root) {
  const draw = (status = '') => {
    const doc = consentDoc();
    const usedBy = (id) => getSessions().sessions.filter((s) => sessionConfig(s).surveyId === id);
    const rows = listSurveys().map((s) => {
      const used = usedBy(s.id);
      return `<li class="session-row">
        <div class="session-row__main">
          <strong>${escapeHtml(s.title)}</strong>${s.lockedAt ? ' <span class="tag">잠김</span>' : ''}${s.example ? ' <span class="tag tag--proto">예시 문항</span>' : ''}
          <span class="session-row__meta">문항 ${s.questions.length}개${used.length ? `, 쓰는 세션: ${escapeHtml(used.map(sessionLabel).join(', '))}` : ', 쓰는 세션 없음'}${s.lockedAt ? `, ${escapeHtml(formatDateTime(s.lockedAt))}에 학생 응답이 시작되어 잠김` : ''}</span>
        </div>
        <div class="session-actions">
          <a class="button button--secondary button--small" href="#/teacher/surveys/${s.id}">${s.lockedAt ? '문항 보기' : '문항 고치기'}</a>
          <button type="button" class="button button--ghost button--small" data-survey-action="copy" data-id="${s.id}">복사</button>
          ${!s.lockedAt && !used.length ? `<button type="button" class="button button--ghost button--small" data-survey-action="remove" data-id="${s.id}">지우기</button>` : ''}
        </div>
      </li>`;
    }).join('');
    root.innerHTML = `<div class="page page--teacher">
      ${breadcrumb([{ label: '교사 화면', href: '#/teacher' }, { label: '설문과 연구 동의' }])}
      <header class="page-intro">
        <h1>설문과 연구 동의</h1>
        <p class="lead">사전·사후 설문은 같은 문항 세트를 씁니다. 세션마다 쓸 설문은 교사 화면의 "수업 설정"에서 고릅니다.</p>
      </header>
      ${notice('warn', '문항은 아직 확정 전입니다', '처음 들어 있는 문항은 화면을 시험하기 위한 예시입니다(로드맵 구현 7에서 확정). 학생이 응답을 시작하면 그 설문은 잠기니, 고치려면 복사해서 새 설문을 만드세요.')}
      <section class="panel" aria-labelledby="survey-list-heading">
        <div class="section-head">
          <h2 id="survey-list-heading" class="section-title">설문</h2>
          <button type="button" class="button button--secondary button--small" data-survey-action="new">새 설문 만들기</button>
        </div>
        <p class="save-status" role="status">${escapeHtml(status)}</p>
        <ul class="session-list">${rows}</ul>
      </section>
      <section class="panel" aria-labelledby="consent-heading">
        <h2 id="consent-heading" class="section-title">연구 동의서</h2>
        <p class="meta">학생이 1단계 전에 읽고 동의 여부를 고르는 글입니다. 내용을 바꾸면 판이 바뀌고, 학생이 어느 판에 동의했는지 기록됩니다. 지금 판: ${escapeHtml(doc.version)}${doc.editedAt ? `, ${escapeHtml(formatDateTime(doc.editedAt))} 수정` : ''}</p>
        <form class="settings-form rubric-form" data-consent-form novalidate>
          <div class="field"><label class="field__label" for="consent-title">제목</label><input type="text" class="field__input" id="consent-title" name="title" value="${escapeHtml(doc.title)}"></div>
          <div class="field"><label class="field__label" for="consent-body">내용 <span class="field__req">(줄마다 한 문단)</span></label><textarea class="field__input" id="consent-body" name="body" rows="8">${escapeHtml(doc.body)}</textarea></div>
          <div class="actions"><button type="submit" class="button button--primary">동의서 저장</button></div>
        </form>
      </section>
    </div>`;
  };

  const onClick = (event) => {
    const btn = event.target.closest('[data-survey-action]');
    if (!btn) return;
    const { surveyAction: action, id } = btn.dataset;
    if (action === 'new') {
      const s = createSurvey();
      window.location.hash = `#/teacher/surveys/${s.id}`;
      return;
    }
    if (action === 'copy') {
      const s = copySurvey(id);
      draw(`"${s.title}"를 만들었습니다.`);
      return;
    }
    if (action === 'remove' && window.confirm('이 설문을 지울까요?')) {
      removeSurvey(id);
      draw('설문을 지웠습니다.');
    }
  };
  const onSubmit = (event) => {
    if (!event.target.matches('[data-consent-form]')) return;
    event.preventDefault();
    const data = new FormData(event.target);
    saveConsent({ title: String(data.get('title')).trim() || '연구 참여 동의', body: String(data.get('body')).trim() });
    draw('동의서를 저장했습니다.');
  };

  draw();
  root.addEventListener('click', onClick);
  root.addEventListener('submit', onSubmit);
  return () => {
    root.removeEventListener('click', onClick);
    root.removeEventListener('submit', onSubmit);
  };
}
