// 면담 화면의 녹음 (구현 7): 녹음 시작·일시정지·이어서·끝내고 저장, 이 학생의 녹음 목록(듣기·내려받기·지우기)
// 면담 화면은 입력할 때마다 다시 그려지므로, 녹음기는 화면 밖(이 객체)에 두고 그릴 때마다 attach로 붙인다.
// 녹음 조건(사용자 결정): 학생·보호자·녹음 동의를 모두 표시해야 녹음할 수 있다. 화면을 떠나면 녹음 중이던 것을 저장한다.

import { deleteRecording, formatDuration, formatSize, listRecordings, recordingFileName, recordingsInMemory, saveRecording } from '../../state/recordingStore.js';
import { escapeHtml, formatDateTime, newId } from '../../ui/dom.js';
import { audioPlayerHtml, bindPlayers, handleAudioSkip } from '../../ui/audioPlayer.js';

const PREFERRED_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

export const canRecord = () => typeof window !== 'undefined' && typeof window.MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);

/** student: { id, pseudonym, sample }, sessionLabel: 문자열, allowed(): 녹음 동의 확인 여부, onChange(): 녹음 목록이 바뀐 뒤 */
export function createRecorder({ student, sessionLabel, allowed, onChange = () => {} }) {
  let el = null;
  let state = 'idle'; // idle | starting | recording | paused | saving
  let media = null;
  let stream = null;
  let chunks = [];
  let startedAt = null;
  let elapsed = 0; // 일시정지 전까지 쌓인 시간
  let resumedAt = 0;
  let timer = null;
  let message = '';
  let list = [];
  let urls = [];
  let inMemory = false;

  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const runningMs = () => elapsed + (state === 'recording' ? now() - resumedAt : 0);

  function revoke() {
    urls.forEach((u) => URL.revokeObjectURL(u));
    urls = [];
  }

  async function refresh() {
    list = await listRecordings({ studentId: student.id });
    inMemory = await recordingsInMemory();
    render();
  }

  function controls() {
    if (!allowed()) return '<p class="meta" data-rec-locked>학생 면담 동의, 보호자 동의, 녹음 동의를 모두 표시하면 녹음할 수 있습니다.</p>';
    if (!canRecord()) return '<p class="meta">이 브라우저에서는 녹음할 수 없습니다. 최신 크롬·엣지·사파리에서 열어 주세요.</p>';
    const time = `<span class="rec__time num" data-rec-time>${formatDuration(runningMs())}</span>`;
    if (state === 'idle') return `<div class="actions actions--start"><button type="button" class="button button--primary" data-rec="start">녹음 시작</button></div>`;
    if (state === 'starting') return '<p class="meta">마이크를 여는 중입니다. 브라우저가 묻으면 마이크 사용을 허락해 주세요.</p>';
    if (state === 'saving') return '<p class="meta">녹음을 저장하는 중입니다.</p>';
    return `<div class="rec__live${state === 'recording' ? ' is-on' : ''}" role="group" aria-label="녹음 중">
      <span class="rec__dot" aria-hidden="true"></span><strong>${state === 'recording' ? '녹음 중' : '일시정지'}</strong>${time}
      <div class="actions actions--start">
        ${state === 'recording' ? '<button type="button" class="button button--secondary button--small" data-rec="pause">일시정지</button>' : '<button type="button" class="button button--secondary button--small" data-rec="resume">이어서 녹음</button>'}
        <button type="button" class="button button--primary button--small" data-rec="stop">끝내고 저장</button>
      </div>
    </div>`;
  }

  function listHtml() {
    revoke();
    if (!list.length) return '<p class="empty-text">이 학생의 녹음이 없습니다.</p>';
    // 녹음은 학생마다 여러 개를 따로 저장한다. 오래된 것부터 녹음 1, 2, …
    return `<ul class="rec__list">${list.map((r, i) => {
      const url = r.blob ? URL.createObjectURL(r.blob) : '';
      if (url) urls.push(url);
      const n = list.length - i;
      return `<li class="rec__item" data-rec-id="${escapeHtml(r.id)}">
        <p class="rec__meta"><strong>녹음 ${n}</strong><span>${escapeHtml(formatDateTime(r.createdAt))}</span><span class="meta">${formatDuration(r.durationMs)}, ${formatSize(r.size)}</span></p>
        ${url ? audioPlayerHtml({ url, label: `녹음 ${n} 듣기`, durationMs: r.durationMs }) : ''}
        <div class="actions actions--start">
          ${url ? `<a class="button button--ghost button--small" href="${url}" download="${escapeHtml(recordingFileName(r))}">내려받기</a>` : ''}
          <button type="button" class="button button--ghost button--small" data-rec="delete">지우기</button>
        </div>
      </li>`;
    }).join('')}</ul>`;
  }

  function render() {
    if (!el?.isConnected) return;
    el.innerHTML = `${message ? `<p class="field__error" role="alert">${escapeHtml(message)}</p>` : ''}
      ${controls()}
      ${inMemory ? '<p class="meta">이 브라우저는 녹음 파일을 오래 저장할 수 없어 이 탭에만 둡니다. 새로 고치기 전에 내려받으세요.</p>' : ''}
      <h3 class="an-sub">이 학생의 녹음 (${list.length}${list.length > 1 ? `, 모두 ${formatDuration(list.reduce((s, r) => s + (r.durationMs ?? 0), 0))}` : ''})</h3>
      ${list.length ? '<p class="meta">녹음할 때마다 따로 저장되어 이 학생에게 모두 모입니다. 면담을 나누어 녹음해도 됩니다.</p>' : ''}
      ${listHtml()}
      <p class="meta">음성을 글로 옮기는 전사는 서버를 연결한 뒤에 제공합니다. 모든 녹음은 <a href="#/teacher/recordings">녹음 관리</a>에서 볼 수 있습니다.</p>`;
    bindPlayers(el);
  }

  function tick() {
    const t = el?.querySelector('[data-rec-time]');
    if (t) t.textContent = formatDuration(runningMs());
  }

  async function start() {
    message = '';
    state = 'starting';
    render();
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      state = 'idle';
      message = '마이크를 쓸 수 없습니다. 브라우저 주소창의 마이크 권한을 확인해 주세요.';
      render();
      return;
    }
    const mimeType = PREFERRED_TYPES.find((t) => window.MediaRecorder.isTypeSupported?.(t)) ?? '';
    media = new window.MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    chunks = [];
    media.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
    media.start(1000);
    startedAt = new Date().toISOString();
    elapsed = 0;
    resumedAt = now();
    state = 'recording';
    timer = window.setInterval(tick, 500);
    render();
  }

  function pause() {
    if (state !== 'recording') return;
    media.pause();
    elapsed += now() - resumedAt;
    state = 'paused';
    render();
  }

  function resume() {
    if (state !== 'paused') return;
    media.resume();
    resumedAt = now();
    state = 'recording';
    render();
  }

  /** 녹음을 끝내고 저장한다 (화면을 떠날 때도 부른다) */
  function stop() {
    if (!media || (state !== 'recording' && state !== 'paused')) return Promise.resolve();
    const durationMs = runningMs();
    state = 'saving';
    render();
    window.clearInterval(timer);
    return new Promise((resolve) => {
      media.onstop = async () => {
        stream?.getTracks().forEach((t) => t.stop());
        const type = media.mimeType || chunks[0]?.type || 'audio/webm';
        const blob = new Blob(chunks, { type });
        await saveRecording({
          id: newId('rec'), studentId: student.id, pseudonym: student.pseudonym, sessionLabel, sample: Boolean(student.sample),
          createdAt: startedAt, durationMs, mimeType: type, size: blob.size, blob,
        });
        media = null;
        stream = null;
        chunks = [];
        state = 'idle';
        message = '';
        await refresh();
        onChange();
        resolve();
      };
      media.stop();
    });
  }

  async function onClick(event) {
    if (handleAudioSkip(event)) return;
    const b = event.target.closest('[data-rec]');
    if (!b) return;
    const act = b.dataset.rec;
    if (act === 'start') return start();
    if (act === 'pause') return pause();
    if (act === 'resume') return resume();
    if (act === 'stop') return stop();
    if (act === 'delete') {
      if (!window.confirm('이 녹음 파일을 지울까요? 지우면 되살릴 수 없습니다.')) return;
      await deleteRecording(b.closest('[data-rec-id]').dataset.recId);
      await refresh();
      onChange();
    }
  }

  return {
    /** 다시 그린 화면의 녹음 칸에 붙인다 */
    attach(container) {
      el?.removeEventListener('click', onClick);
      el = container;
      if (!el) return;
      el.addEventListener('click', onClick);
      render();
      refresh();
    },
    get state() { return state; },
    stop,
    dispose() {
      if (state === 'recording' || state === 'paused') stop();
      else stream?.getTracks().forEach((t) => t.stop());
      window.clearInterval(timer);
      el?.removeEventListener('click', onClick);
      revoke();
    },
  };
}
