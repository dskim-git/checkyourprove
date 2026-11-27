// 교사 화면: 설문 목록과 연구 동의서 (구현 4)
// 설문(문항 세트)을 만들고 복사·지우고, 세션마다 쓸 설문은 수업 설정에서 고른다. 학생이 응답을 시작한 설문은 잠긴다.

import { getSessions, sessionConfig, sessionLabel } from '../../state/sessionStore.js';
import { copySurvey, createSurvey, listSurveys, removeSurvey } from '../../state/surveyStore.js';
import { escapeHtml, formatDateTime } from '../../ui/dom.js';
import { breadcrumb, notice } from '../../ui/components.js';

export function renderSurveyList(root) {
  const draw = (status = '') => {
    const usedBy = (id) => getSessions().sessions.filter((s) => sessionConfig(s).surveyId === id);
    const rows = listSurveys().map((s) => {
      const used = usedBy(s.id);
      return `<li class="session-row">
        <div class="session-row__main">
          <strong>${escapeHtml(s.title)}</strong>${s.lockedAt ? ' <span class="tag">잠김</span>' : ''}${s.example ? ' <span class="tag tag--proto">추천 초안</span>' : ''}
          <span class="session-row__meta">문항 ${s.questions.length}개${s.instrument?.name ? `, 평가도구: ${escapeHtml(s.instrument.name)}` : ""}${used.length ? `, 쓰는 세션: ${escapeHtml(used.map(sessionLabel).join(', '))}` : ', 쓰는 세션 없음'}${s.lockedAt ? `, ${escapeHtml(formatDateTime(s.lockedAt))}에 학생 응답이 시작되어 잠김` : ''}</span>
        </div>
        <div class="session-actions">
          <a class="button button--secondary button--small" href="#/teacher/surveys/${s.id}">${s.lockedAt ? '문항 보기' : '문항 고치기'}</a>
          <button type="button" class="button button--ghost button--small" data-survey-action="copy" data-id="${s.id}">복사</button>
          ${!s.lockedAt && !used.length ? `<button type="button" class="button button--ghost button--small" data-survey-action="remove" data-id="${s.id}">지우기</button>` : ''}
        </div>
      </li>`;
    }).join('');
    root.innerHTML = `<div class="page page--teacher">
      ${breadcrumb([{ label: '관리자 설정', href: '#/admin/tools' }, { label: '설문 문항' }])}
      <header class="page-intro">
        <h1>설문 문항</h1>
        <p class="lead">사전·사후 설문은 같은 문항 세트를 씁니다. 세션마다 쓸 설문은 교사가 "교사 설정 > 탐구 진행"에서 고릅니다.</p>
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
      <p class="meta">학생 연구 동의서는 <a href="#/admin/ethics">관리자 설정 &gt; 연구 윤리</a>에서 고칩니다.</p>
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

  draw();
  root.addEventListener('click', onClick);
  return () => {
    root.removeEventListener('click', onClick);
  };
}
