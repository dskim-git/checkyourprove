// 증명 연습 화면들이 함께 쓰는 조각

import { escapeHtml } from '../../ui/dom.js';
import { icons } from '../../ui/icons.js';

const LEVEL_STATE_TEXT = { certified: '인증 완료', open: '열림', locked: '잠김' };

/** 활동 단계의 인증 상태를 작은 칸으로 보여 준다(텍스트 대체 포함). */
export function levelMeter(states) {
  const cells = states
    .map((s) => `<span class="level-meter__cell is-${s.state}" aria-hidden="true">${s.state === 'certified' ? icons.check : s.index + 1}</span>`)
    .join('');
  const text = states.map((s) => `${s.index + 1}단계 ${LEVEL_STATE_TEXT[s.state]}`).join(', ');
  return `<span class="level-meter">${cells}<span class="visually-hidden">${escapeHtml(text)}</span></span>`;
}

const STATUS_ICONS = { new: icons.circle, progress: icons.progress, passed: icons.done, ended: icons.alert };

export function statusBadge(status) {
  return `<span class="status status--${status.state}">${STATUS_ICONS[status.state]}<span>${escapeHtml(status.label)}</span></span>`;
}

export const practiceHref = (...parts) => `#/practice/${parts.join('/')}`;
