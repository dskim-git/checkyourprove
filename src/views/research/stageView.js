// AI와 탐구하기: 단계 화면 (1 나의 증명, 2 AI 증명, 3 비교 분석, 4 최종 증명)
// 명제마다 한 화면씩 다루고, 마지막 명제에서 단계를 제출한다. 제출한 단계는 읽기 전용이다.
// 작업 시간, 화면 이탈, 첫 입력, 입력·지우기 횟수, 증명 중간 저장본, 증명법 변경을 기록한다.

import { getProblem } from '../../data/problems/index.js';
import { getStage, RESEARCH_STAGES } from '../../data/research.js';
import { buildResearchRequest } from '../../services/aiRequests.js';
import { requestResearchChat } from '../../services/mockAiService.js';
import { getClassroom } from '../../state/classroomStore.js';
import {
  canEnterStage, ensureStage, findStage, isItemComplete, missingFields, noteInput, noteMethodChange,
  propositionIdsFor, saveResearch, snapshot, stageStatus, submitStage,
} from '../../state/researchStore.js';
import { escapeHtml, formatDateTime, nowIso } from '../../ui/dom.js';
import { icons } from '../../ui/icons.js';
import { breadcrumb, chatMessages, mockAiNote, notice, renderNotFound } from '../../ui/components.js';
import { bindFields, handleChatShortcut, handleSymbolInsert } from '../../ui/forms.js';
import { statementHtml } from '../../ui/mathText.js';
import {
  checklistField, checklistText, methodField, methodText, noteField, proofField, ratioField, readList, readProof,
  showErrors, starField, starsText, syncRatio, syncStars,
} from './researchParts.js';

const TICK_MS = 5000;
const SNAPSHOT_MS = 30000;
const PROOF_FIELDS = { 1: ['proof'], 2: ['aiProof'], 3: [], 4: ['proof'] };

export function renderResearchStage(root, [stageParam, indexParam = '0']) {
  const n = Number(stageParam);
  const stageDef = getStage(n);
  const classroom = getClassroom();
  if (!stageDef) {
    renderNotFound(root);
    return null;
  }
  const crumbs = [{ label: '홈', href: '#/' }, { label: 'AI와 탐구하기', href: '#/research' }, { label: `${n}단계 ${stageDef.title}` }];

  if (!classroom.researchOpen || !canEnterStage(n, classroom)) {
    const status = stageStatus(n, classroom);
    root.innerHTML = `<div class="page">
      ${breadcrumb(crumbs)}
      <h1>${n}단계 ${escapeHtml(stageDef.title)}</h1>
      ${notice('lock', '아직 할 수 없는 단계입니다', classroom.researchOpen ? status.label : '선생님이 아직 AI와 탐구하기를 열지 않았습니다.')}
      <p><a class="button button--secondary" href="#/research">탐구 단계 목록으로</a></p>
    </div>`;
    return null;
  }

  const ids = propositionIdsFor(classroom);
  const index = Math.min(Math.max(Number(indexParam) || 0, 0), ids.length - 1);
  const problemId = ids[index];
  const problem = getProblem(problemId);
  const stage = findStage(n)?.submittedAt ? findStage(n) : ensureStage(n, classroom);
  const item = stage.items[problemId];
  const locked = Boolean(stage.submittedAt);
  if (!problem || !item) {
    renderNotFound(root);
    return null;
  }

  let fields = null;
  let chatTab = item.chat?.messages.length ? 'record' : 'chat';
  let pending = false;
  const save = () => saveResearch();
  const hrefFor = (i) => `#/research/${n}/${i}`;

  // ── 머리말과 명제 탭 ─────────────────────
  function propTabs() {
    const tabs = ids.map((id, i) => {
      const done = isItemComplete(n, stage.items[id]);
      const label = `명제 ${i + 1}`;
      const mark = done ? `<span class="prop-tabs__mark">${icons.check}<span class="visually-hidden">(작성 완료)</span></span>` : '';
      return i === index
        ? `<li><span class="prop-tabs__item is-current" aria-current="page">${label}${mark}</span></li>`
        : `<li><a class="prop-tabs__item${done ? ' is-done' : ''}" href="${hrefFor(i)}">${label}${mark}</a></li>`;
    }).join('');
    return `<nav class="prop-tabs" aria-label="명제 선택"><ul>${tabs}</ul></nav>`;
  }

  function header() {
    return `<div class="lesson-top">
        ${breadcrumb(crumbs)}
        ${propTabs()}
      </div>
      <header class="solve-header">
        <p class="stage-badge"><span class="stage-badge__num num" aria-hidden="true">${n}</span><span>${n}단계 ${escapeHtml(stageDef.title)}</span></p>
        <h1 class="solve-title">명제 ${index + 1}</h1>
      </header>
      <div class="proposition-wrap"><section class="proposition" aria-label="명제">
        <p class="proposition__statement">${statementHtml(problem.statement)}</p>
      </section></div>`;
  }

  // ── 단계별 입력 ─────────────────────────
  const prior = (k) => findStage(k)?.items?.[problemId];

  function myProofCard(k = 1, open = true) {
    const it = prior(k);
    if (!it) return '';
    return `<details class="ref-card"${open ? ' open' : ''}>
      <summary>나의 증명 (${k}단계)</summary>
      ${readList([['증명 방법', escapeHtml(methodText(it.method, it.methodOther))], ['확신 정도', starsText(it.confidence)]])}
      ${readProof(it.proof)}
      ${k === 1 && it.stuck?.trim() ? readList([['어려웠던 점·막힌 점', escapeHtml(it.stuck)]]) : ''}
    </details>`;
  }

  function aiProofCard(open = true) {
    const it = prior(2);
    if (!it) return '';
    return `<details class="ref-card ref-card--ai"${open ? ' open' : ''}>
      <summary>AI의 증명 (2단계에 옮겨 적은 것)</summary>
      ${readList([['AI가 쓴 증명 방법', escapeHtml(methodText(it.aiMethod, it.aiMethodOther))], ['AI 증명 확신 정도', starsText(it.confidence)]])}
      ${readProof(it.aiProof)}
      ${it.notable?.trim() ? readList([['AI 답변에서 특징적인 점', escapeHtml(it.notable)]]) : ''}
    </details>`;
  }

  function editBody() {
    if (n === 1) {
      return `${methodField({ field: 'method', otherField: 'methodOther', legend: '사용할 증명 방법', value: item.method, otherValue: item.methodOther })}
        ${proofField({ field: 'proof', label: '나의 증명', help: '내 힘으로 증명을 쓰세요. 끝까지 못 했다면 쓴 데까지 적으세요.', value: item.proof })}
        ${starField({ field: 'confidence', legend: '나의 증명이 옳다고 확신하는 정도', value: item.confidence })}
        ${noteField({ field: 'stuck', label: '증명에서 어려웠던 점이나 막힌 점', help: '없으면 비워 두어도 됩니다.', value: item.stuck })}`;
    }
    if (n === 2) {
      const chatPane = `<section class="chat-pane" aria-label="AI와 대화">
          ${mockAiNote('프로토타입: AI 응답은 미리 준비한 예시이며 실제 AI가 아닙니다. AI는 1단계에서 쓴 나의 증명을 볼 수 없습니다.')}
          <ol class="chat__log" data-chat-log aria-label="AI 대화 기록" aria-live="polite">${chatMessages(item.chat.messages, { pending })}</ol>
          <form class="chat__form" data-chat-form novalidate>
            <label class="field__label" for="chat-input">AI에게 보낼 메시지</label>
            <p class="field__help" id="chat-input-help">자유롭게 물어보세요. 예: "이 명제를 증명해 줘", "2번째 줄은 왜 그렇게 되나요?" Ctrl + Enter로 보낼 수 있습니다.</p>
            <textarea id="chat-input" class="field__input" rows="2" aria-describedby="chat-input-help"></textarea>
            <div class="chat__form-actions">
              <button type="button" class="button button--secondary" data-action="to-record">기록하기로</button>
              <button type="submit" class="button button--primary" data-chat-send${pending ? ' disabled' : ''}>${pending ? 'AI가 답하는 중…' : '보내기'}</button>
            </div>
          </form>
        </section>`;
      const recordPane = `<section class="record-pane" aria-label="AI의 증명 기록하기">
          ${methodField({ field: 'aiMethod', otherField: 'aiMethodOther', legend: 'AI가 사용한 증명 방법', value: item.aiMethod, otherValue: item.aiMethodOther })}
          ${proofField({ field: 'aiProof', label: 'AI의 증명 옮겨 적기', help: 'AI가 알려 준 증명을 고치거나 요약하지 말고 그대로 직접 옮겨 적으세요. 붙여넣기는 할 수 없습니다.', value: item.aiProof })}
          <p class="paste-note" data-paste-note role="status" hidden>AI의 증명은 직접 옮겨 적어 주세요. 붙여넣기는 할 수 없습니다.</p>
          ${starField({ field: 'confidence', legend: 'AI의 증명이 옳다고 확신하는 정도', value: item.confidence })}
          ${noteField({ field: 'notable', label: 'AI 답변에서 특징적인 점', help: '잘한 점, 생략, 오류, 표현 등 눈에 띈 점을 쓰세요.', value: item.notable, rows: 4 })}
        </section>`;
      return `<div class="seg" role="tablist" aria-label="2단계 화면">
          <button type="button" role="tab" class="seg__item${chatTab === 'chat' ? ' is-on' : ''}" aria-selected="${chatTab === 'chat'}" data-tab-to="chat">${icons.chat}<span>AI와 대화</span><span class="seg__count num">${item.chat.messages.length}</span></button>
          <button type="button" role="tab" class="seg__item${chatTab === 'record' ? ' is-on' : ''}" aria-selected="${chatTab === 'record'}" data-tab-to="record">${icons.pencil}<span>기록하기</span></button>
        </div>
        ${chatTab === 'chat' ? chatPane : recordPane}`;
    }
    if (n === 3) {
      return `<div class="compare-cards">${myProofCard(1)}${aiProofCard()}</div>
        ${checklistField({ field: 'myChecklist', legend: '내 증명에서 보완할 점', values: item.myChecklist })}
        ${checklistField({ field: 'aiChecklist', legend: 'AI 증명에서 보완할 점', values: item.aiChecklist })}
        ${noteField({ field: 'aiIssues', label: 'AI 증명에서 보완할 부분과 이유', help: '설명이 부족하거나 잘못된 부분이 어디인지, 왜 그런지 짧게 쓰세요. 찾지 못했다면 "찾지 못함"이라고 쓰세요.', value: item.aiIssues, required: true })}
        ${noteField({ field: 'aiHelpful', label: 'AI의 답변 중 도움이 된 점', help: '최종 증명을 쓰는 데 도움이 될 풀이 방법, 식, 설명을 구체적으로 쓰세요.', value: item.aiHelpful })}
        ${noteField({ field: 'aiOpinion', label: 'AI에 대한 나의 의견', help: '이 명제를 AI와 함께 탐구하며 AI에 대해 느낀 점을 쓰세요.', value: item.aiOpinion })}`;
    }
    const analysis = prior(3);
    return `<div class="compare-cards" aria-label="앞 단계 기록">
          ${myProofCard(1, false)}${aiProofCard(false)}
          ${analysis ? `<details class="ref-card"><summary>비교 분석 (3단계)</summary>${readList([
            ['내 증명에서 보완할 점', checklistText(analysis.myChecklist)],
            ['AI 증명에서 보완할 점', checklistText(analysis.aiChecklist)],
            ['AI 증명에서 보완할 부분과 이유', escapeHtml(analysis.aiIssues)],
            ['AI의 답변 중 도움이 된 점', escapeHtml(analysis.aiHelpful || '쓰지 않음')],
          ])}</details>` : ''}
      </div>
      ${methodField({ field: 'method', otherField: 'methodOther', legend: '최종 증명에 사용할 증명 방법', value: item.method, otherValue: item.methodOther })}
      ${proofField({ field: 'proof', label: '최종 증명', help: '나의 증명과 AI의 증명을 비교한 결과를 바탕으로 최종 증명을 쓰세요.', value: item.proof, rows: 10 })}
      ${noteField({ field: 'usedFromMine', label: '나의 증명에서 가져온 부분', help: '1단계 나의 증명에서 그대로 쓰거나 고쳐 쓴 부분을 적으세요.', value: item.usedFromMine })}
      ${noteField({ field: 'usedFromAi', label: 'AI의 증명에서 가져온 부분', help: '2단계 AI의 증명에서 참고한 부분을 적으세요.', value: item.usedFromAi })}
      ${ratioField({ field: 'ratioMine', value: item.ratioMine })}
      ${starField({ field: 'confidence', legend: '최종 증명이 옳다고 확신하는 정도', value: item.confidence })}`;
  }

  function readBody() {
    if (n === 1) {
      return readList([
        ['증명 방법', escapeHtml(methodText(item.method, item.methodOther))],
        ['나의 증명', readProof(item.proof)],
        ['확신 정도', starsText(item.confidence)],
        ['어려웠던 점·막힌 점', escapeHtml(item.stuck || '쓰지 않음')],
      ]);
    }
    if (n === 2) {
      return `${readList([
        ['AI가 사용한 증명 방법', escapeHtml(methodText(item.aiMethod, item.aiMethodOther))],
        ['AI의 증명 (옮겨 적은 것)', readProof(item.aiProof)],
        ['AI 증명 확신 정도', starsText(item.confidence)],
        ['AI 답변에서 특징적인 점', escapeHtml(item.notable || '쓰지 않음')],
      ])}
      <details class="ref-card"><summary>AI와 나눈 대화 (${item.chat.messages.length})</summary><ol class="chat__log chat__log--compact">${chatMessages(item.chat.messages)}</ol></details>`;
    }
    if (n === 3) {
      return readList([
        ['내 증명에서 보완할 점', checklistText(item.myChecklist)],
        ['AI 증명에서 보완할 점', checklistText(item.aiChecklist)],
        ['AI 증명에서 보완할 부분과 이유', escapeHtml(item.aiIssues)],
        ['AI의 답변 중 도움이 된 점', escapeHtml(item.aiHelpful || '쓰지 않음')],
        ['AI에 대한 나의 의견', escapeHtml(item.aiOpinion || '쓰지 않음')],
      ]);
    }
    return readList([
      ['증명 방법', escapeHtml(methodText(item.method, item.methodOther))],
      ['최종 증명', readProof(item.proof)],
      ['나의 증명에서 가져온 부분', escapeHtml(item.usedFromMine || '쓰지 않음')],
      ['AI의 증명에서 가져온 부분', escapeHtml(item.usedFromAi || '쓰지 않음')],
      ['반영 비율', item.ratioMine == null ? '표시하지 않음' : `나의 답변 ${item.ratioMine * 10}%, AI의 답변 ${100 - item.ratioMine * 10}%`],
      ['확신 정도', starsText(item.confidence)],
    ]);
  }

  function actions() {
    if (locked) {
      const next = RESEARCH_STAGES.find((s) => s.n === n + 1);
      return `<div class="actions actions--start">
        ${index < ids.length - 1 ? `<a class="button button--secondary" href="${hrefFor(index + 1)}">다음 명제 보기</a>` : ''}
        <a class="button ${next ? 'button--secondary' : 'button--primary'}" href="#/research">탐구 단계 목록으로</a>
      </div>`;
    }
    const last = index === ids.length - 1;
    return `<div class="actions">
      <p class="save-status" data-save-status aria-live="polite"></p>
      ${index > 0 ? `<a class="button button--ghost" href="${hrefFor(index - 1)}">이전 명제</a>` : ''}
      ${last
        ? `<button type="button" class="button button--primary" data-action="submit">${n}단계 제출하기</button>`
        : `<a class="button button--primary" href="${hrefFor(index + 1)}">다음 명제</a>`}
    </div>`;
  }

  function draw({ focus = null } = {}) {
    fields?.dispose();
    root.innerHTML = `<div class="page page--solve page--research">
      ${header()}
      ${locked ? notice('success', `${n}단계를 제출했습니다`, `${formatDateTime(stage.submittedAt)}에 제출했습니다. 제출한 내용은 고칠 수 없습니다.`) : ''}
      <section class="step-panel" data-stage-body>
        ${locked ? readBody() : editBody()}
        <div class="submit-errors" data-submit-errors aria-live="assertive"></div>
        ${actions()}
      </section>
    </div>`;
    if (!locked) fields = bindFields(root.querySelector('[data-stage-body]'), item, save);
    if (focus) root.querySelector(focus)?.focus();
    const log = root.querySelector('[data-chat-log]');
    if (log) log.scrollTop = log.scrollHeight;
  }

  // ── 작업 시간·화면 이탈 기록 ─────────────
  let lastTick = Date.now();
  const tick = () => {
    const t = Date.now();
    if (!locked && document.visibilityState !== 'hidden') {
      const delta = Math.min(t - lastTick, TICK_MS * 3);
      stage.activeMs += delta;
      item.track.activeMs += delta;
    }
    lastTick = t;
  };
  const tickTimer = window.setInterval(() => {
    tick();
    if (!locked) save();
  }, TICK_MS);
  const snapTimer = window.setInterval(() => {
    if (locked) return;
    PROOF_FIELDS[n].forEach((field) => snapshot(item, field));
    save();
  }, SNAPSHOT_MS);
  const onVisibility = () => {
    tick();
    if (document.visibilityState === 'hidden' && !locked) {
      stage.leaves += 1;
      save();
    }
  };

  // ── 입력 처리 ───────────────────────────
  const onInputCapture = (event) => {
    if (locked) return;
    const el = event.target;
    if (el.matches?.('textarea[data-field], input[type="text"][data-field]')) noteInput(item, event.inputType ?? '');
    if (el.matches?.('.ratio__range')) syncRatio(root, Number(el.value));
  };
  const onChangeCapture = (event) => {
    if (locked) return;
    const el = event.target;
    // 증명법 변경 기록 (bindFields가 값을 바꾸기 전에 이전 값을 읽는다)
    if (el.type === 'radio' && (el.dataset.field === 'method' || el.dataset.field === 'aiMethod')) {
      noteMethodChange(item, el.dataset.field, item[el.dataset.field], el.value);
      const other = root.querySelector(`[data-other-for="${el.dataset.field}"]`);
      if (other) other.hidden = el.value !== 'other';
    }
    if (el.type === 'radio' && el.dataset.field === 'confidence') window.setTimeout(() => syncStars(root));
    if (el.matches('[data-check]')) {
      const list = item[el.dataset.check];
      const group = root.querySelector(`#f-${el.dataset.check}`);
      if (el.value === 'none' && el.checked) {
        list.splice(0, list.length, 'none');
        group.querySelectorAll('[data-check]').forEach((box) => { box.checked = box.value === 'none'; });
      } else {
        const next = [...group.querySelectorAll('[data-check]:checked')].map((box) => box.value).filter((v) => v !== 'none');
        group.querySelector('[data-check][value="none"]').checked = false;
        list.splice(0, list.length, ...next);
      }
      save();
    }
  };
  const onPaste = (event) => {
    if (n !== 2 || !event.target.matches?.('[data-field="aiProof"]')) return;
    event.preventDefault();
    item.pasteAttempts += 1;
    save();
    const note = root.querySelector('[data-paste-note]');
    if (note) note.hidden = false;
  };

  async function sendChat(form) {
    if (pending) return;
    const input = form.querySelector('#chat-input');
    const text = input.value.trim();
    if (!text) {
      input.focus();
      return;
    }
    item.chat.messages.push({ role: 'student', text, at: nowIso() });
    noteInput(item, 'chat');
    pending = true;
    save();
    draw({ focus: '#chat-input' });
    const request = buildResearchRequest({ problem, messages: item.chat.messages });
    item.chat.requestLog.push({
      requestId: request.requestId,
      sentAt: request.sentAt,
      model: request.model,
      promptVersion: request.promptVersion,
      inputKeys: Object.keys(request.input),
      messageCount: request.input.messages.length,
    });
    const reply = await requestResearchChat(request);
    item.chat.messages.push({ role: 'ai', text: reply.text, at: nowIso(), requestId: request.requestId });
    pending = false;
    save();
    if (root.isConnected && chatTab === 'chat') draw({ focus: '#chat-input' });
  }

  function trySubmit() {
    fields?.flush();
    PROOF_FIELDS[n].forEach((field) => snapshot(item, field));
    const firstIncomplete = ids.findIndex((id) => !isItemComplete(n, stage.items[id]));
    if (firstIncomplete !== -1) {
      const box = root.querySelector('[data-submit-errors]');
      if (firstIncomplete !== index) {
        box.innerHTML = notice('warn', `명제 ${firstIncomplete + 1}에 아직 채우지 않은 항목이 있습니다`, '그 명제로 가서 표시된 항목을 채운 뒤 제출하세요.')
          + `<p><a class="button button--secondary" href="${hrefFor(firstIncomplete)}">명제 ${firstIncomplete + 1}로 가기</a></p>`;
        box.querySelector('a')?.focus();
        return;
      }
      box.innerHTML = '';
      showErrors(root, missingFields(n, item));
      return;
    }
    if (!window.confirm(`${n}단계를 제출할까요? 제출하면 이 단계의 내용은 다시 고칠 수 없습니다.`)) return;
    tick();
    submitStage(n);
    window.location.hash = '#/research';
  }

  const onClick = (event) => {
    if (handleSymbolInsert(event, root)) return;
    const tab = event.target.closest('[data-tab-to]');
    if (tab && tab.dataset.tabTo !== chatTab) {
      fields?.flush();
      chatTab = tab.dataset.tabTo;
      item.tabSwitches += 1;
      save();
      draw({ focus: `[data-tab-to="${chatTab}"]` });
      return;
    }
    if (event.target.closest('[data-action="to-record"]')) {
      chatTab = 'record';
      item.tabSwitches += 1;
      save();
      draw({ focus: '[data-tab-to="record"]' });
      return;
    }
    const cell = event.target.closest('[data-ratio]');
    if (cell && !locked) {
      const range = root.querySelector('.ratio__range');
      range.value = cell.dataset.ratio;
      range.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    if (event.target.closest('[data-action="submit"]')) trySubmit();
  };
  const onSubmitForm = (event) => {
    const form = event.target.closest('[data-chat-form]');
    if (!form) return;
    event.preventDefault();
    sendChat(form);
  };

  draw();
  root.addEventListener('input', onInputCapture, true);
  root.addEventListener('change', onChangeCapture, true);
  root.addEventListener('paste', onPaste, true);
  root.addEventListener('drop', onPaste, true);
  root.addEventListener('click', onClick);
  root.addEventListener('submit', onSubmitForm);
  root.addEventListener('keydown', handleChatShortcut);
  document.addEventListener('visibilitychange', onVisibility);

  return () => {
    tick();
    if (!locked) {
      fields?.flush();
      PROOF_FIELDS[n].forEach((field) => snapshot(item, field));
      save();
    }
    fields?.dispose();
    window.clearInterval(tickTimer);
    window.clearInterval(snapTimer);
    root.removeEventListener('input', onInputCapture, true);
    root.removeEventListener('change', onChangeCapture, true);
    root.removeEventListener('paste', onPaste, true);
    root.removeEventListener('drop', onPaste, true);
    root.removeEventListener('click', onClick);
    root.removeEventListener('submit', onSubmitForm);
    root.removeEventListener('keydown', handleChatShortcut);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}

export const formatActive = (ms) => {
  const minutes = Math.round((ms ?? 0) / 60000);
  return minutes < 1 ? '1분 미만' : `${minutes}분`;
};
