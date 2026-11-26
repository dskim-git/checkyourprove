// 교사 화면: 대화 하나에 태그 붙이기 (구현 3-2)
// 왼쪽: 대화 기록. 학생 질문과 AI 답마다 그 자리에 맞는 태그 칩(여러 개 고를 수 있음)과 AI 제안이 보인다.
// 오른쪽: AI 태그 제안 버튼, 대화 전체 태그, 메모, 참고 기록, "태그 마침(다음 대화)".
// 태그는 고르는 즉시 저장한다. AI 제안은 누른 채점자에게만 보이고, AI를 본 뒤 붙인 태그인지(aiSeen)와 AI를 보기 전 태그(beforeAi)를 남긴다.

import { methodOptionLabel, MORE_ACCURATE_OPTIONS, optionLabel } from '../../data/research.js';
import { buildChatTagAssistRequest } from '../../services/aiRequests.js';
import { requestChatTagAssist } from '../../services/mockChatTagAssist.js';
import { CATEGORY_LABELS } from '../../services/researchGuardrails.js';
import {
  activeChatTags, chatTagAiOf, chatTagRecord, currentRater, markChatTagged, saveChatTagAi, saveChatTagNote, toggleChatTag,
} from '../../state/gradingStore.js';
import { itemAt } from '../../state/researchRoster.js';
import { escapeHtml, formatTime } from '../../ui/dom.js';
import { breadcrumb, mockAiNote, renderNotFound } from '../../ui/components.js';
import { statementHtml } from '../../ui/mathText.js';
import { chatQueue } from './chatTagParts.js';

export function renderChatTag(root, [key]) {
  const rater = currentRater();
  const { convs, blind } = chatQueue(rater.id);
  const index = convs.findIndex((c) => c.key === key);
  const conv = convs[index];
  if (!conv) {
    renderNotFound(root);
    return null;
  }
  let aiPending = false;
  let aiError = '';
  let status = '';

  /** 태그 칩: index가 null이면 대화 전체 */
  function chips(scope, idx, record, ai) {
    const tags = activeChatTags().filter((t) => t.scope === scope);
    const chosen = idx == null ? record?.conversation ?? [] : record?.messages?.[idx] ?? [];
    const suggested = new Set((ai ?? []).map((s) => s.tag));
    if (!tags.length) return '';
    return `<div class="tag-chips" role="group" aria-label="${idx == null ? '대화 전체 태그' : `${idx + 1}번 메시지 태그`}">
      ${tags.map((t) => `<label class="pick pick--tag${suggested.has(t.id) ? ' is-ai' : ''}" title="${escapeHtml(t.desc)}">
        <input type="checkbox" data-tag-at="${idx ?? 'conv'}" value="${escapeHtml(t.id)}"${chosen.includes(t.id) ? ' checked' : ''}>
        <span>${escapeHtml(t.label)}${suggested.has(t.id) ? ' <span class="tag tag--ai" aria-label="AI가 제안한 태그">AI</span>' : ''}</span>
      </label>`).join('')}
    </div>`;
  }

  const suggestionLine = (list) => (list?.length
    ? `<p class="ai-suggest">${list.map((s) => `<span class="tag tag--ai">AI: ${escapeHtml(activeChatTags().find((t) => t.id === s.tag)?.label ?? s.tag)}</span><span>${escapeHtml(s.reason)}</span>`).join('')}</p>`
    : '');

  function messageList(record, ai) {
    return conv.messages.map((m, i) => {
      const who = m.role === 'student' ? (blind ? '학생' : conv.student.pseudonym) : 'AI 도우미';
      const topic = m.role === 'student' && m.topic && m.topic !== 'proof' ? `<span class="tag">${escapeHtml(CATEGORY_LABELS[m.topic] ?? m.topic)}</span>` : '';
      const guard = m.role === 'ai' && m.guard ? '<span class="tag">가드레일 안내</span>' : '';
      const help = m.role === 'ai' && (m.coverage ?? 0) >= 0.6 ? '<span class="tag tag--mint">증명 도움</span>' : '';
      return `<li class="chat__msg chat__msg--${m.role} tag-msg" id="msg-${i}">
        <p class="chat__who"><span class="num">${i + 1}.</span> ${escapeHtml(who)} <time datetime="${escapeHtml(m.at)}">${formatTime(m.at)}</time> ${topic}${guard}${help}</p>
        <div class="chat__body">${escapeHtml(m.text)}</div>
        ${suggestionLine(ai?.messages?.[i])}
        ${chips(m.role, i, record, ai?.messages?.[i])}
      </li>`;
    }).join('');
  }

  function aiPanel(ai) {
    return `<section class="ai-assist" aria-labelledby="ai-tag-heading">
      <div class="section-head">
        <h2 id="ai-tag-heading" class="section-title">AI 태그 제안</h2>
        <button type="button" class="button button--secondary button--small" data-action="ai-tags"${aiPending ? ' disabled' : ''}>${aiPending ? 'AI가 읽는 중…' : ai ? 'AI로 다시 제안받기' : 'AI로 태그 제안받기'}</button>
      </div>
      ${ai
        ? `<p>${escapeHtml(ai.summary)}</p><p class="meta">제안한 태그는 칩에 "AI" 표시와 근거로 보입니다. 참고용이며, 태그는 직접 골라 주세요.</p>`
        : '<p class="meta">누르면 AI가 대화를 읽고 질문마다, 그리고 대화 전체에 알맞은 태그와 근거를 제안합니다. AI를 본 뒤 붙인 태그는 따로 표시됩니다.</p>'}
      ${aiError ? `<p class="field__error" role="alert">${escapeHtml(aiError)}</p>` : ''}
      ${mockAiNote('프로토타입: 실제 AI가 아니라 예시 규칙(질문 표현, 가드레일 분류)으로 제안합니다. 교사가 추가한 태그는 제안하지 않습니다.')}
    </section>`;
  }

  function contextBlock() {
    const s3 = itemAt(conv.student, 3, conv.problemId);
    const s4 = itemAt(conv.student, 4, conv.problemId);
    const s1 = itemAt(conv.student, 1, conv.problemId);
    const rows = [
      ['2단계 옮겨 적기', conv.item.transcriptCheck === 'teacher' ? '펜으로 옮겨 적음' : conv.item.aiProof ? '글로 옮겨 적음' : '아직'],
      ['1단계 → 4단계 증명법', s1 && s4 ? `${methodOptionLabel(s1.method) || '–'} → ${methodOptionLabel(s4.method) || '–'}` : '–'],
      ['3단계 더 정확한 증명', s3 ? optionLabel(MORE_ACCURATE_OPTIONS, s3.moreAccurate) || '–' : '–'],
      ['3단계 AI에 대한 의견', s3?.aiOpinion || '–'],
      ['4단계 반영 비율', s4?.ratioMine == null ? '–' : `나 ${s4.ratioMine * 10}% / AI ${100 - s4.ratioMine * 10}%`],
    ];
    return `<details class="ref-card">
      <summary>참고 기록 (대화 전체 태그 판단용)</summary>
      <dl class="read-list">${rows.map(([dt, dd]) => `<div><dt>${escapeHtml(dt)}</dt><dd>${escapeHtml(dd)}</dd></div>`).join('')}</dl>
    </details>`;
  }

  function draw() {
    const record = chatTagRecord(rater.id, conv.key);
    const ai = chatTagAiOf(rater.id, conv.key);
    const prev = convs[index - 1];
    root.innerHTML = `<div class="page page--teacher page--grade">
      ${breadcrumb([{ label: '교사 화면', href: '#/teacher' }, { label: 'AI 대화 태그', href: '#/teacher/chats' }, { label: `대화 ${index + 1}` }])}
      <header class="page-intro">
        <h1>대화 ${index + 1} <span class="grade-count">/ ${convs.length}</span></h1>
        <p class="grade-who">${blind ? '<span class="tag">블라인드</span>' : `<span class="tag tag--strong">${escapeHtml(conv.student.pseudonym)}</span>${conv.student.sample ? '<span class="tag tag--proto">예시</span>' : ''}`}<span class="tag">채점자: ${escapeHtml(rater.name)}</span>${record?.doneAt ? '<span class="tag tag--mint">마침</span>' : ''}</p>
      </header>
      <section class="proposition grade-prop" aria-label="명제">
        <p class="meta">명제 ${conv.propIndex + 1}</p>
        <p class="proposition__statement">${statementHtml(conv.problem?.statement ?? '')}</p>
      </section>
      <div class="split grade-layout">
        <div class="split__main">
          <section aria-labelledby="conv-heading" class="tag-conv">
            <h2 id="conv-heading" class="section-title">AI와 나눈 대화 (${conv.messages.length})</h2>
            <p class="meta">메시지마다 알맞은 태그를 모두 고르세요. 고르는 즉시 저장됩니다. 태그에 마우스를 올리면 설명이 보입니다.</p>
            <ol class="chat__log chat__log--compact tag-log">${messageList(record, ai)}</ol>
          </section>
        </div>
        <div class="split__side tag-side">
          ${aiPanel(ai)}
          <section class="grade-sub" aria-labelledby="conv-tag-heading">
            <h2 id="conv-tag-heading" class="section-title">대화 전체 태그</h2>
            ${suggestionLine(ai?.conversation)}
            ${chips('conversation', null, record, ai?.conversation) || '<p class="meta">대화 전체에 붙이는 태그가 없습니다.</p>'}
          </section>
          <div class="field">
            <label class="field__label" for="tag-note">메모 <span class="field__req">(선택)</span></label>
            <textarea id="tag-note" class="field__input" rows="3" data-tag-note>${escapeHtml(record?.note ?? '')}</textarea>
          </div>
          ${contextBlock()}
        </div>
      </div>
      <div class="actions grade-actions">
        <p class="save-status" data-tag-status aria-live="polite">${escapeHtml(status)}</p>
        ${prev ? `<a class="button button--ghost" href="#/teacher/chats/${prev.key}">이전 대화</a>` : ''}
        <a class="button button--secondary" href="#/teacher/chats">대화 목록</a>
        <button type="button" class="button button--primary" data-action="done">태그 마침<span class="visually-hidden">, 다음 대화로</span></button>
      </div>
    </div>`;
  }

  async function runAi() {
    if (aiPending) return;
    aiPending = true;
    aiError = '';
    draw();
    const request = buildChatTagAssistRequest({ problem: conv.problem, messages: conv.messages, tags: activeChatTags() });
    try {
      const result = await requestChatTagAssist(request);
      saveChatTagAi(rater.id, conv.key, { ...result, requestId: request.requestId, model: request.model, promptVersion: request.promptVersion, at: new Date().toISOString() });
    } catch {
      aiError = 'AI 제안을 받지 못했습니다. 잠시 뒤 다시 눌러 주세요.';
    }
    aiPending = false;
    if (root.isConnected) draw();
  }

  const setStatus = (text) => {
    status = text;
    const el = root.querySelector('[data-tag-status]');
    if (el) el.textContent = text;
  };

  const onChange = (event) => {
    const box = event.target.closest('[data-tag-at]');
    if (box) {
      const at = box.dataset.tagAt;
      const ok = toggleChatTag(rater.id, conv.key, at === 'conv' ? null : Number(at), box.value, box.checked);
      setStatus(ok ? '태그를 저장했습니다.' : '이 브라우저에 저장하지 못했습니다.');
    }
  };
  let noteTimer = 0;
  let pendingNote = null;
  const flushNote = () => {
    window.clearTimeout(noteTimer);
    if (pendingNote == null) return;
    saveChatTagNote(rater.id, conv.key, pendingNote);
    pendingNote = null;
  };
  const onInput = (event) => {
    if (!event.target.matches('[data-tag-note]')) return;
    pendingNote = event.target.value;
    window.clearTimeout(noteTimer);
    noteTimer = window.setTimeout(() => {
      flushNote();
      setStatus('메모를 저장했습니다.');
    }, 400);
  };
  const onClick = (event) => {
    if (event.target.closest('[data-action="ai-tags"]')) {
      runAi();
      return;
    }
    if (event.target.closest('[data-action="done"]')) {
      flushNote();
      markChatTagged(rater.id, conv.key);
      const after = [...convs.slice(index + 1), ...convs.slice(0, index)];
      const next = after.find((c) => !chatTagRecord(rater.id, c.key)?.doneAt);
      window.location.hash = next ? `#/teacher/chats/${next.key}` : '#/teacher/chats';
    }
  };

  draw();
  root.addEventListener('change', onChange);
  root.addEventListener('input', onInput);
  root.addEventListener('click', onClick);
  return () => {
    flushNote();
    root.removeEventListener('change', onChange);
    root.removeEventListener('input', onInput);
    root.removeEventListener('click', onClick);
  };
}

