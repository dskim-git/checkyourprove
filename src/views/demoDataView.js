// 시연 데이터 (#/demo-data, 2026-11-27 사용자 결정): 이 브라우저의 앱 기록을 JSON 파일로 내보내고 불러오기
//   본 앱(브라우저 저장일 때)에서 내보내고, 시연 모드(demo.html)에서 불러와 발표·시연에 쓴다.
//   파일은 _local_archive/demo/에 보관한다(공개 저장소에 올리지 않음). 서버(Firebase)와는 상관없다.

import {
  checkBrowserData, clearBrowserData, copyPrototypeData, currentSummary, exportBrowserData, exportFileName,
  importBrowserData, prototypeSummary,
} from '../state/browserData.js';
import { isBrowserOnly, isDemo } from '../state/appMode.js';
import { breadcrumb, notice } from '../ui/components.js';
import { escapeHtml } from '../ui/dom.js';
import { formatSize } from '../state/recordingStore.js';

const summaryList = (s) => `<dl class="read-list">
    <div><dt>저장 항목</dt><dd>${s.keys}개</dd></div>
    <div><dt>계정</dt><dd>${s.users}명</dd></div>
    <div><dt>세션(학급 × 회차)</dt><dd>${s.sessions}개</dd></div>
    <div><dt>탐구 기록이 있는 세션</dt><dd>${s.researchSessions}개</dd></div>
    <div><dt>면담 녹음</dt><dd>${s.recordings}개${s.recordings ? ` (${formatSize(s.recordingBytes)})` : ''}</dd></div>
  </dl>`;

export function renderDemoData(root) {
  let status = '';
  let pending = null; // 고른 파일 { data, summary, name }
  let alive = true;

  const draw = async (focus = null) => {
    const mine = await currentSummary();
    if (!alive) return;
    const proto = isDemo ? prototypeSummary() : null;
    const where = isDemo ? '시연 모드' : '이 브라우저';
    root.innerHTML = `<div class="page">
      ${breadcrumb([{ label: '홈', href: '#/' }, { label: '시연 데이터' }])}
      <header class="page-intro"><h1>시연 데이터</h1>
        <p>${isDemo
          ? '시연 모드는 이 브라우저에만 저장하고 서버와 실제 학생 기록에는 닿지 않아요. 내보낸 파일을 불러와 발표·시연에 쓰세요.'
          : '이 브라우저에 쌓인 앱 기록(계정, 세션, 탐구·연습 기록, 채점, 면담, 녹음)을 파일 하나로 내보내요. 시연 모드(demo.html)에서 이 파일을 불러올 수 있어요.'}</p>
      </header>
      ${isBrowserOnly ? '' : notice('warn', '서버에 연결된 앱이에요', '시연 데이터는 시연 모드(demo.html)에서만 다룹니다.')}
      <section class="panel" aria-labelledby="dd-now">
        <h2 id="dd-now" class="section-title">${where}의 기록</h2>
        ${summaryList(mine)}
        <div class="actions actions--start">
          <button type="button" class="button button--primary" data-action="export"${mine.keys ? '' : ' disabled'}>파일로 내보내기</button>
          ${isDemo ? `<button type="button" class="button button--ghost" data-action="clear"${mine.keys || mine.recordings ? '' : ' disabled'}>비우기</button>` : ''}
        </div>
        <p class="field__help">내보낸 파일에는 시연 계정 이메일과 녹음이 들어 있어요. 공개된 곳(GitHub 저장소 등)에 올리지 마세요.</p>
      </section>
      <section class="panel" aria-labelledby="dd-load">
        <h2 id="dd-load" class="section-title">파일 불러오기</h2>
        <p class="meta">불러오면 ${where}의 기록을 모두 지우고 파일 내용으로 바꿔요.</p>
        <div class="field"><label class="field__label" for="dd-file">기록 파일 (.json)</label>
          <input type="file" class="field__input" id="dd-file" accept="application/json,.json" data-file></div>
        ${pending ? `<div class="notice notice--info" role="note"><div class="notice__body"><p class="notice__title">${escapeHtml(pending.name)}</p>${summaryList(pending.summary)}</div></div>
          <div class="actions actions--start"><button type="button" class="button button--primary" data-action="import">이 파일로 바꾸기</button>
          <button type="button" class="button button--ghost" data-action="cancel">취소</button></div>` : ''}
      </section>
      ${proto ? `<section class="panel" aria-labelledby="dd-proto">
        <h2 id="dd-proto" class="section-title">같은 주소의 프로토타입 기록</h2>
        <p class="meta">이 브라우저로 본 앱을 쓸 때 쌓인 기록이 있어요(계정 ${proto.users}명, 세션 ${proto.sessions}개). 녹음은 따로 보관돼 함께 오지 않아요.</p>
        <div class="actions actions--start"><button type="button" class="button button--secondary" data-action="copy">시연 모드로 복사하기</button></div>
      </section>` : ''}
      <p class="save-status" role="status" data-dd-status>${escapeHtml(status)}</p>
      ${isDemo ? '<p><a class="button button--secondary" href="#/">시연 시작하기</a></p>' : ''}
    </div>`;
    if (focus) root.querySelector(focus)?.focus();
  };

  const setStatus = (text) => {
    status = text;
    const el = root.querySelector('[data-dd-status]');
    if (el) el.textContent = text;
  };

  const onClick = async (event) => {
    const a = event.target.closest('[data-action]')?.dataset.action;
    if (!a) return;
    if (a === 'export') {
      setStatus('파일을 만드는 중…');
      const data = await exportBrowserData();
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = exportFileName();
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      setStatus(`내보냈어요: ${link.download}`);
    } else if (a === 'import' && pending) {
      setStatus('불러오는 중…');
      try {
        await importBrowserData(pending.data);
        const name = pending.name;
        pending = null;
        status = `불러왔어요: ${name}. 화면을 새로 고쳐요.`;
        window.location.hash = '#/demo-data';
        window.location.reload();
      } catch (error) {
        setStatus(`불러오지 못했어요: ${error.message}`);
      }
    } else if (a === 'cancel') {
      pending = null;
      status = '';
      draw('[data-file]');
    } else if (a === 'clear') {
      if (!window.confirm('시연 모드의 기록을 모두 지울까요? 내보낸 파일이 있으면 다시 불러올 수 있어요.')) return;
      await clearBrowserData();
      window.location.reload();
    } else if (a === 'copy') {
      await copyPrototypeData();
      window.location.reload();
    }
  };

  const onChange = async (event) => {
    const input = event.target.closest('[data-file]');
    const file = input?.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      pending = { data, summary: checkBrowserData(data), name: file.name };
      status = '';
    } catch (error) {
      pending = null;
      status = error instanceof SyntaxError ? 'JSON 파일을 읽지 못했어요.' : error.message;
    }
    draw(pending ? '[data-action="import"]' : '[data-file]');
  };

  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  draw();
  return () => {
    alive = false;
    root.removeEventListener('click', onClick);
    root.removeEventListener('change', onChange);
  };
}
