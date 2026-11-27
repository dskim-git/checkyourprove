// 교사 화면: 녹음 관리 (구현 7)
// 보관 기한(연구 종료일) 정하기와 알림, 모든 면담 녹음의 목록(학생·세션·녹음 시각·길이·크기), 듣기·내려받기·지우기,
// 모두 내려받기, 기한이 지나면 모두 지우기. 자동으로 지우지 않는다(사용자 결정 2026-11-27: 기한 알림 + 교사가 직접 삭제).

import { retentionUntil } from '../../state/interviewStore.js';
import { logAction } from '../../state/adminStore.js';
import { currentUser, displayName } from '../../state/accountStore.js';
import {
  deleteAllRecordings, deleteRecording, formatDuration, formatSize, listRecordings, recordingFileName, recordingsInMemory, retentionState,
} from '../../state/recordingStore.js';
import { breadcrumb, notice } from '../../ui/components.js';
import { escapeHtml, formatDateTime } from '../../ui/dom.js';
import { audioPlayerHtml, bindPlayers, handleAudioSkip } from '../../ui/audioPlayer.js';

/** 보관 기한 알림 (교사 첫 화면·면담 화면 위에 붙인다). 녹음이 있고 기한이 14일 안이거나 지났을 때만. */
export async function retentionAlertHtml() {
  const st = retentionState(retentionUntil());
  if (st.state !== 'soon' && st.state !== 'over') return '';
  const n = (await listRecordings()).length;
  if (!n) return '';
  const box = st.state === 'over'
    ? notice('warn', `녹음 보관 기한(${retentionUntil()})이 지났습니다`, `녹음 ${n}개가 남아 있습니다. 녹음 관리에서 내려받아 연구 계획대로 보관한 뒤 지우세요.`)
    : notice('eye', `녹음 보관 기한이 ${st.days}일 남았습니다`, `기한(${retentionUntil()})이 지나면 녹음 ${n}개를 지워야 합니다.`);
  return `<div class="rec-alert">${box}<a class="button button--secondary button--small" href="#/teacher/recordings">녹음 관리 열기</a></div>`;
}

/** 화면의 [data-retention-alert] 칸에 보관 기한 알림을 채운다 */
export function fillRetentionAlert(root) {
  retentionAlertHtml().then((html) => {
    const el = root.querySelector('[data-retention-alert]');
    if (el) el.innerHTML = html;
  });
}

export function renderRecordings(root) {
  let list = [];
  let urls = [];
  let inMemory = false;
  let status = '';
  let alive = true;

  const revoke = () => {
    urls.forEach((u) => URL.revokeObjectURL(u));
    urls = [];
  };

  function draw(focus = null) {
    if (!alive) return;
    revoke();
    const until = retentionUntil();
    const st = retentionState(until);
    const total = list.reduce((s, r) => s + (r.size ?? 0), 0);
    const totalMs = list.reduce((s, r) => s + (r.durationMs ?? 0), 0);
    // 학생별로 묶고, 학생 안에서는 오래된 것부터 녹음 1, 2, …
    const groups = new Map();
    [...list].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))).forEach((r) => {
      if (!groups.has(r.studentId)) groups.set(r.studentId, []);
      groups.get(r.studentId).push(r);
    });
    const rows = [...groups.values()].map((recs) => {
      const first = recs[0];
      const head = `<tr class="grade-group"><th scope="rowgroup" colspan="8"><a href="#/teacher/interviews/${escapeHtml(first.studentId)}">${escapeHtml(first.pseudonym ?? first.studentId)}</a>${first.sample ? ' <span class="tag tag--proto">예시</span>' : ''}<span class="meta">${escapeHtml(first.sessionLabel ?? '')}, 녹음 ${recs.length}개, 모두 ${formatDuration(recs.reduce((s, r) => s + (r.durationMs ?? 0), 0))}</span></th></tr>`;
      return head + recs.map((r, k) => {
      const url = r.blob ? URL.createObjectURL(r.blob) : '';
      if (url) urls.push(url);
      return `<tr data-rec-id="${escapeHtml(r.id)}">
        <th scope="row">녹음 ${k + 1}</th>
        <td>${escapeHtml(r.sessionLabel ?? '')}</td>
        <td>${escapeHtml(formatDateTime(r.createdAt))}</td>
        <td class="num">${formatDuration(r.durationMs)}</td>
        <td class="num">${formatSize(r.size)}</td>
        <td>${url ? audioPlayerHtml({ url, label: `${r.pseudonym ?? ''} 녹음 ${k + 1} 듣기`, durationMs: r.durationMs, compact: true }) : '–'}</td>
        <td>${r.transcript ? '있음' : '<span class="meta">서버 연결 뒤</span>'}</td>
        <td><span class="rec__row-actions">${url ? `<a class="button button--ghost button--small" href="${url}" download="${escapeHtml(recordingFileName(r))}">내려받기</a>` : ''}<button type="button" class="button button--ghost button--small" data-action="delete">지우기</button></span></td>
      </tr>`;
      }).join('');
    }).join('');
    root.innerHTML = `<div class="page page--teacher page--recordings">
      ${breadcrumb([{ label: '교사 화면', href: '#/teacher' }, { label: '면담', href: '#/teacher/interviews' }, { label: '녹음 관리' }])}
      <header class="page-intro">
        <h1>녹음 관리</h1>
        <p class="lead">면담 녹음 파일을 연구 기간 동안 보관하고, 듣고, 내려받고, 지웁니다. 학생 음성은 민감한 개인정보이므로 보관 기한이 지나면 지워 주세요.</p>
      </header>
      ${notice('warn', '프로토타입 상태입니다', `녹음 파일은 이 브라우저(이 기기)에만 저장됩니다. 다른 기기에서는 보이지 않고, 브라우저 데이터를 지우면 함께 사라집니다. 서버를 연결하면 교사만 볼 수 있는 저장소로 옮깁니다.${inMemory ? ' 지금 이 브라우저는 파일을 오래 저장할 수 없어 이 탭에만 두고 있습니다. 새로 고치기 전에 내려받으세요.' : ''}`)}
      <section class="panel" aria-labelledby="rec-retention">
        <h2 id="rec-retention" class="section-title">보관 기한</h2>
        <p class="rec-until">보관 기한: <strong data-rec-until>${until ? escapeHtml(until) : '정하지 않음'}</strong> <span class="meta">· <a href="#/admin/ethics">관리자 설정 &gt; 연구 윤리</a>에서 정합니다.</span></p>
        ${st.state === 'none' ? '<p class="meta">관리자가 보관 기한을 정하면 14일 전부터 교사 화면에 알림이 나옵니다. 자동으로 지우지는 않습니다.</p>'
          : st.state === 'over' ? notice('warn', '보관 기한이 지났습니다', list.length ? `녹음 ${list.length}개가 남아 있습니다. 필요한 파일을 내려받은 뒤 지우세요.` : '남은 녹음이 없습니다.')
            : st.state === 'soon' ? notice('eye', `보관 기한이 ${st.days}일 남았습니다`, '기한이 지나기 전에 필요한 파일을 내려받아 두세요.')
              : `<p class="meta">보관 기한까지 ${st.days}일 남았습니다. 14일 전부터 교사 화면에 알림이 나옵니다.</p>`}
      </section>
      <section class="panel" aria-labelledby="rec-list">
        <div class="section-head">
          <h2 id="rec-list" class="section-title">녹음 ${list.length}개</h2>
          <span class="actions">
            <button type="button" class="button button--secondary button--small" data-action="download-all"${list.length ? '' : ' disabled'}>모두 내려받기</button>
            ${st.state === 'over' && list.length ? '<button type="button" class="button button--primary button--small" data-action="delete-all">기한 지난 녹음 모두 지우기</button>' : ''}
          </span>
        </div>
        <p class="meta">모두 ${formatDuration(totalMs)}, ${formatSize(total)}. 학생별로 묶어 녹음한 순서대로 번호를 붙입니다. 학생 이름을 누르면 면담 화면이 열립니다. 녹음은 면담 화면에서 합니다(학생·보호자·녹음 동의를 표시한 뒤).</p>
        ${list.length ? `<div class="table-wrap" role="region" aria-labelledby="rec-list" tabindex="0">
          <table class="data-table grade-table" data-rec-table>
            <thead><tr><th scope="col">녹음</th><th scope="col">세션</th><th scope="col">녹음 시각</th><th scope="col">길이</th><th scope="col">크기</th><th scope="col">듣기</th><th scope="col">전사</th><th scope="col">파일</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>` : '<p class="empty-text">저장된 녹음이 없습니다.</p>'}
        <p class="save-status" role="status" data-rec-status>${escapeHtml(status)}</p>
      </section>
    </div>`;
    bindPlayers(root);
    if (focus) root.querySelector(focus)?.focus();
  }

  async function load(focus) {
    list = await listRecordings();
    inMemory = await recordingsInMemory();
    draw(focus);
  }


  const onClick = async (event) => {
    if (handleAudioSkip(event)) return;
    const b = event.target.closest('[data-action]');
    if (!b) return;
    const act = b.dataset.action;
    if (act === 'delete') {
      if (!window.confirm('이 녹음 파일을 지울까요? 지우면 되살릴 수 없습니다.')) return;
      await deleteRecording(b.closest('[data-rec-id]').dataset.recId);
      status = '녹음을 지웠습니다.';
      return load('#rec-list');
    }
    if (act === 'delete-all') {
      if (!window.confirm(`녹음 ${list.length}개를 모두 지울까요? 내려받지 않은 파일은 되살릴 수 없습니다.`)) return;
      await deleteAllRecordings();
      logAction('녹음 모두 지움', `${list.length}개`, currentUser() ? displayName(currentUser()) : '미리보기');
      status = '녹음을 모두 지웠습니다.';
      return load('#rec-list');
    }
    if (act === 'download-all') {
      // 묶음 파일 없이 하나씩 내려받는다(브라우저가 여러 파일 내려받기를 물을 수 있음)
      [...root.querySelectorAll('a[download]')].forEach((a, i) => window.setTimeout(() => a.click(), i * 400));
      status = `녹음 ${list.length}개를 내려받습니다. 브라우저가 여러 파일 내려받기를 물으면 허용해 주세요.`;
      const el = root.querySelector('[data-rec-status]');
      if (el) el.textContent = status;
    }
  };

  draw();
  load();
  root.addEventListener('click', onClick);
  return () => {
    alive = false;
    revoke();
    root.removeEventListener('click', onClick);
  };
}
