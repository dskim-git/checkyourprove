// 설정 화면 위쪽 탭 (설정 정리 작업): 탭마다 주소가 있어 바로 열 수 있다(링크 탭, 지금 탭은 aria-current="page").
// 폰에서는 가로로 밀어 넘긴다. tabs: [{ id, label, href, badge? }]

import { escapeHtml } from './dom.js';

export function settingsTabs(tabs, current, label) {
  return `<nav class="settings-tabs" aria-label="${escapeHtml(label)} 묶음">
    <ul class="settings-tabs__list">${tabs.map((t) => `<li><a class="settings-tab${t.id === current ? ' is-on' : ''}" href="${t.href}"${t.id === current ? ' aria-current="page"' : ''}>${escapeHtml(t.label)}${t.badge ? ` <span class="settings-tab__badge num">${escapeHtml(String(t.badge))}</span>` : ''}</a></li>`).join('')}</ul>
  </nav>`;
}
