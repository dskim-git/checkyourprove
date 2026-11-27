// 연구 분석·채점·태그 화면이 함께 쓰는 "포함할 세션" 고르기 (학급별로 묶은 체크 목록)
// 고른 세션의 학생만 모아 합쳐 본다. 모두 고르면 null(전체)로 저장한다.

import { getGrading, updateGradingSettings } from '../../state/gradingStore.js';
import { sessionLabel, sessionsByClass } from '../../state/sessionStore.js';
import { escapeHtml } from '../../ui/dom.js';

/** 지금 포함한 세션 설명 (예: "1반 1회차, 2반 1회차" 또는 "모든 세션") */
export function scopeText(g = getGrading()) {
  const all = sessionsByClass({ includeSamples: g.includeSamples }).flatMap((c) => c.sessions);
  const ids = g.scopeSessionIds;
  if (!ids) return `모든 세션 (${all.length}개)`;
  const chosen = all.filter((s) => ids.includes(s.id));
  return chosen.length ? chosen.map((s) => sessionLabel(s)).join(', ') : '고른 세션 없음';
}

export function scopePicker(g = getGrading()) {
  const groups = sessionsByClass({ includeSamples: g.includeSamples }).filter((c) => c.sessions.length);
  const on = (id) => !g.scopeSessionIds || g.scopeSessionIds.includes(id);
  return `<fieldset class="choice-group scope-pick" data-scope-pick>
    <legend>포함할 세션 (학급 × 회차)</legend>
    <p class="field__help">고른 세션의 학생을 합쳐서 봅니다. 지금: ${escapeHtml(scopeText(g))}</p>
    <div class="scope-pick__groups">
      ${groups.map((c) => `<div class="scope-pick__group" role="group" aria-label="${escapeHtml(c.name)}">
        <span class="scope-pick__class">${escapeHtml(c.name)}${c.sample ? ' <span class="tag tag--proto">예시</span>' : ''}</span>
        <div class="pick-group__options">${c.sessions.map((s) => `<label class="pick pick--tag"><input type="checkbox" name="scopeSession" value="${s.id}"${on(s.id) ? ' checked' : ''}><span>${s.round}회차</span></label>`).join('')}</div>
      </div>`).join('')}
    </div>
    <div class="actions actions--start"><button type="button" class="button button--ghost button--small" data-action="scope-all">모두 고르기</button></div>
  </fieldset>`;
}

/**
 * 고르기 변경을 처리한다. 처리했으면 true(화면을 다시 그려야 함).
 * event: change 또는 click 이벤트
 */
export function handleScopeEvent(event, root) {
  if (event.type === 'click' && event.target.closest('[data-action="scope-all"]')) {
    updateGradingSettings({ scopeSessionIds: null });
    return true;
  }
  if (event.type !== 'change' || event.target.name !== 'scopeSession') return false;
  const boxes = [...root.querySelectorAll('input[name="scopeSession"]')];
  const ids = boxes.filter((b) => b.checked).map((b) => b.value);
  updateGradingSettings({ scopeSessionIds: ids.length === boxes.length ? null : ids });
  return true;
}
