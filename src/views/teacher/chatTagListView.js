// 교사 화면: AI 대화 태그 목록 보기·고치기
// 태그 이름·설명을 고치고, 새 태그를 추가하거나 지울 수 있다. 기본 태그는 붙이는 곳(학생 질문/AI 답/대화 전체)을 바꾸지 않는다.
// 지운 태그를 이미 붙인 기록은 그대로 남고 목록에는 "(지운 태그)"로 보인다.

import { DEFAULT_CHAT_TAGS, TAG_SCOPES } from '../../data/chatTags.js';
import { activeChatTags, getGrading, resetChatTags, saveChatTags } from '../../state/gradingStore.js';
import { escapeHtml } from '../../ui/dom.js';
import { breadcrumb } from '../../ui/components.js';
import { allTagIds } from './chatTagParts.js';

const isDefault = (id) => DEFAULT_CHAT_TAGS.some((t) => t.id === id);

export function renderChatTagList(root) {
  const usage = (id) => Object.values(getGrading().chatTagging ?? {}).flatMap((byConv) => Object.values(byConv)).reduce((n, rec) => n + allTagIds(rec).filter((x) => x === id).length, 0);

  const draw = (status = '') => {
    const tags = activeChatTags();
    const scopeSelect = (name, value, disabled = false) => `<select class="field__select" name="${name}"${disabled ? ' disabled' : ''}>${TAG_SCOPES.map((s) => `<option value="${s.id}"${s.id === value ? ' selected' : ''}>${escapeHtml(s.label)}</option>`).join('')}</select>`;
    const rows = tags.map((t, i) => `<fieldset class="choice-group rubric-edit" data-tag-row="${escapeHtml(t.id)}">
        <legend>${i + 1}. ${escapeHtml(t.label)} <span class="meta">${escapeHtml(TAG_SCOPES.find((s) => s.id === t.scope)?.label ?? '')}${isDefault(t.id) ? ', 기본 태그' : ''}, 붙인 수 ${usage(t.id)}</span></legend>
        <div class="field"><label class="field__label" for="tag-${i}-label">태그 이름</label><input type="text" class="field__input" id="tag-${i}-label" name="label" value="${escapeHtml(t.label)}"></div>
        <div class="field"><label class="field__label" for="tag-${i}-desc">설명</label><textarea class="field__input" id="tag-${i}-desc" name="desc" rows="2">${escapeHtml(t.desc)}</textarea></div>
        <div class="field field--inline"><label class="field__label">붙이는 곳</label>${scopeSelect('scope', t.scope, isDefault(t.id))}</div>
        <label class="check"><input type="checkbox" name="remove"><span>이 태그 지우기 <span class="meta">이미 붙인 기록은 남습니다.</span></span></label>
      </fieldset>`).join('');
    root.innerHTML = `<div class="page page--teacher">
      ${breadcrumb([{ label: '교사 화면', href: '#/teacher' }, { label: 'AI 대화 태그', href: '#/teacher/chats' }, { label: '태그 목록' }])}
      <header class="page-intro">
        <h1>대화 태그 목록</h1>
        <p class="lead">2단계 AI 대화에 붙이는 태그입니다. 이름과 설명을 고치고, 연구에 필요한 태그를 추가할 수 있습니다. 설명은 태그를 붙이는 화면에서 태그에 마우스를 올리면 보입니다.</p>
      </header>
      <form class="settings-form rubric-form" data-tag-form novalidate>
        ${rows}
        <fieldset class="choice-group rubric-edit" data-tag-new>
          <legend>새 태그 추가</legend>
          <div class="field"><label class="field__label" for="tag-new-label">태그 이름</label><input type="text" class="field__input" id="tag-new-label" name="label" placeholder="예: 개념을 묻는 질문"></div>
          <div class="field"><label class="field__label" for="tag-new-desc">설명</label><textarea class="field__input" id="tag-new-desc" name="desc" rows="2"></textarea></div>
          <div class="field field--inline"><label class="field__label">붙이는 곳</label>${scopeSelect('scope', 'student')}</div>
        </fieldset>
        <div class="actions">
          <p class="save-status" data-tag-list-status aria-live="polite">${escapeHtml(status)}</p>
          <button type="button" class="button button--ghost" data-action="reset">기본 태그로 되돌리기</button>
          <button type="submit" class="button button--primary">태그 목록 저장</button>
        </div>
      </form>
    </div>`;
  };

  const onSubmit = (event) => {
    if (!event.target.matches('[data-tag-form]')) return;
    event.preventDefault();
    const current = activeChatTags();
    const next = [];
    root.querySelectorAll('[data-tag-row]').forEach((row) => {
      const old = current.find((t) => t.id === row.dataset.tagRow);
      if (!old || row.querySelector('[name="remove"]').checked) return;
      const label = row.querySelector('[name="label"]').value.trim() || old.label;
      const desc = row.querySelector('[name="desc"]').value.trim();
      const scope = isDefault(old.id) ? old.scope : row.querySelector('[name="scope"]').value;
      next.push({ ...old, label, desc, scope });
    });
    const add = root.querySelector('[data-tag-new]');
    const newLabel = add.querySelector('[name="label"]').value.trim();
    if (newLabel) {
      next.push({ id: `custom-${Date.now().toString(36)}`, scope: add.querySelector('[name="scope"]').value, label: newLabel, desc: add.querySelector('[name="desc"]').value.trim(), custom: true });
    }
    const ok = saveChatTags(next);
    draw(ok ? '태그 목록을 저장했습니다.' : '이 브라우저에 저장하지 못했습니다.');
  };
  const onClick = (event) => {
    if (!event.target.closest('[data-action="reset"]')) return;
    if (!window.confirm('고친 내용과 추가한 태그를 지우고 기본 태그로 되돌릴까요? 이미 붙인 기록은 남습니다.')) return;
    resetChatTags();
    draw('기본 태그로 되돌렸습니다.');
  };

  draw();
  root.addEventListener('submit', onSubmit);
  root.addEventListener('click', onClick);
  return () => {
    root.removeEventListener('submit', onSubmit);
    root.removeEventListener('click', onClick);
  };
}
