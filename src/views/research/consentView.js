// AI와 탐구하기: 연구 참여 동의 (구현 4)
// 동의하면 사전·사후 설문을 하고 기록이 연구에 쓰인다. 동의하지 않아도 1~4단계 활동은 똑같이 하고, 기록은 연구에서 빠진다.
// 언제든 이 화면에서 마음을 바꿀 수 있고, 바꾼 기록이 남는다.
// TODO: 보호자 동의, 동의서 판(version) 관리, 서면 동의와의 연결은 데이터 수집 명세(로드맵 3단계)에서 정한다.

import { getClassroom } from '../../state/classroomStore.js';
import { answerConsent, getConsent } from '../../state/researchStore.js';
import { consentDoc } from '../../state/surveyStore.js';
import { escapeHtml, formatDateTime } from '../../ui/dom.js';
import { breadcrumb, notice } from '../../ui/components.js';

export function renderConsent(root) {
  const crumbs = [{ label: '홈', href: '#/' }, { label: 'AI와 탐구하기', href: '#/research' }, { label: '연구 참여 동의' }];
  const draw = (status = '') => {
    const classroom = getClassroom();
    const doc = consentDoc();
    const consent = getConsent();
    const current = consent.agreed === true ? '연구 참여에 동의했습니다' : consent.agreed === false ? '연구에 참여하지 않기로 했습니다' : '';
    root.innerHTML = `<div class="page page--consent">
      ${breadcrumb(crumbs)}
      <header class="page-intro">
        <h1>${escapeHtml(doc.title)}</h1>
        <p class="grade-who"><span class="tag">${escapeHtml(classroom.sessionLabel)}</span></p>
      </header>
      <section class="consent-doc" aria-label="동의서 내용">
        ${doc.body.split('\n').filter(Boolean).map((line) => `<p>${escapeHtml(line)}</p>`).join('')}
      </section>
      ${current ? notice(consent.agreed ? 'success' : 'eye', current, `${formatDateTime(consent.at)}에 답했습니다. 아래에서 언제든 바꿀 수 있어요.`) : ''}
      <div class="consent-actions">
        <button type="button" class="button button--primary" data-consent="yes"${consent.agreed === true ? ' aria-pressed="true"' : ''}>연구 참여에 동의합니다</button>
        <button type="button" class="button button--secondary" data-consent="no"${consent.agreed === false ? ' aria-pressed="true"' : ''}>참여하지 않겠습니다</button>
      </div>
      <p class="save-status" role="status">${escapeHtml(status)}</p>
      <p><a class="button button--ghost" href="#/research">탐구 단계 목록으로</a></p>
    </div>`;
  };

  const onClick = (event) => {
    const btn = event.target.closest('[data-consent]');
    if (!btn) return;
    const agreed = btn.dataset.consent === 'yes';
    const was = getConsent().agreed;
    if (was === true && !agreed && !window.confirm('연구 참여를 그만둘까요? 활동은 그대로 할 수 있고, 내 기록은 연구에서 빠집니다.')) return;
    answerConsent(agreed, consentDoc().version);
    window.location.hash = '#/research';
  };

  draw();
  root.addEventListener('click', onClick);
  return () => root.removeEventListener('click', onClick);
}
