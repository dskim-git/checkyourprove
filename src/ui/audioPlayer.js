// 녹음 듣기: 기본 재생 막대 + 5초 뒤로·5초 앞으로 (면담 녹음을 돌려 가며 듣기 위해, 구현 7 이후 사용자 요청)
// 화면은 audioPlayerHtml로 그리고, 버튼은 handleAudioSkip을 화면의 click 처리에서 불러 처리한다(위임).
// MediaRecorder로 만든 webm은 브라우저가 길이를 모를 수 있어(Infinity) 저장해 둔 길이(durationMs)로 끝을 정한다.

import { escapeHtml } from './dom.js';

export const SKIP_SECONDS = 5;

/** url: 재생할 주소, label: 화면 읽기용 이름, durationMs: 녹음 길이 */
export function audioPlayerHtml({ url, label, durationMs = null, compact = false }) {
  return `<div class="player${compact ? ' player--compact' : ''}" data-player${durationMs ? ` data-duration="${Math.round(durationMs)}"` : ''}>
    <audio class="player__audio" controls preload="metadata" src="${url}" aria-label="${escapeHtml(label)}"></audio>
    <div class="player__skip" role="group" aria-label="${escapeHtml(label)} 이동">
      <button type="button" class="button button--ghost button--small" data-skip="-${SKIP_SECONDS}" aria-label="${SKIP_SECONDS}초 뒤로">« ${SKIP_SECONDS}초</button>
      <button type="button" class="button button--ghost button--small" data-skip="${SKIP_SECONDS}" aria-label="${SKIP_SECONDS}초 앞으로">${SKIP_SECONDS}초 »</button>
    </div>
  </div>`;
}

/** click 이벤트가 건너뛰기 버튼이면 처리하고 true */
export function handleAudioSkip(event) {
  const b = event.target.closest('[data-skip]');
  const player = b?.closest('[data-player]');
  const audio = player?.querySelector('audio');
  if (!audio) return false;
  const known = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : Number(player.dataset.duration ?? 0) / 1000 || Infinity;
  audio.currentTime = Math.min(Math.max(0, (audio.currentTime || 0) + Number(b.dataset.skip)), known);
  return true;
}

/**
 * 길이를 모르는(Infinity) 녹음은 끝으로 한 번 이동시켜 브라우저가 길이를 읽게 한 뒤 처음으로 돌린다.
 * 그래야 재생 막대를 끌어서 옮길 수 있다. 그린 뒤 그 칸에 대고 부른다.
 */
export function bindPlayers(container) {
  container?.querySelectorAll('[data-player] audio').forEach((audio) => {
    if (audio.dataset.bound) return;
    audio.dataset.bound = '1';
    audio.addEventListener('loadedmetadata', () => {
      if (Number.isFinite(audio.duration)) return;
      const back = () => {
        audio.removeEventListener('timeupdate', back);
        audio.currentTime = 0;
      };
      audio.addEventListener('timeupdate', back);
      audio.currentTime = 1e7;
    });
  });
}
