// 교사 화면: 증명 하나 채점하기
// 왼쪽(넓은 화면) 읽을 것: 채점할 증명(글·필기와 작성 과정 다시 보기), 2단계면 대화창의 원래 AI 답 — 화면에 고정
// 오른쪽 고를 것: 루브릭 점수, 단계별 추가 확인 — 이쪽만 내려간다.
// 블라인드 채점에서는 학생 이름과 단계를 가린다. 단계가 드러나는 추가 확인
// (2단계: 대화의 원래 AI 답과 비교해 옮겨 적기 확인, 4단계: 3단계에서 체크한 보완할 점의 보완 여부와 1단계 막힌 점 극복)은
// 점수를 저장한 뒤에 연다.
// AI 채점 도우미: "AI로 채점해 보기"를 누르면 AI가 루브릭 기준마다 점수와 근거를 제안한다(참고용, 점수는 채점자가 고른다).
// AI 결과는 누른 채점자에게만 보이고, AI를 본 상태에서 저장했는지(aiSeen)와 AI를 보기 전 점수(criteriaBeforeAi)를 남긴다.

import { methodOptionLabel } from '../../data/research.js';
import {
  ACTUAL_METHOD_OPTIONS, COMPLETENESS_OPTIONS, REVISION_OPTIONS, RUBRIC_TOTAL, STUCK_OVERCOME_OPTIONS, TRANSCRIPT_OPTIONS,
} from '../../data/rubric.js';
import { buildGradeAssistRequest } from '../../services/aiRequests.js';
import { requestGradeAssist } from '../../services/mockGradeAssist.js';
import { PROOF_HELP_MIN } from '../../services/proofHelp.js';
import { activeRubric, aiGradeOf, clearReadingEdit, currentRater, getGrading, saveAiGrade, saveReadingEdit, saveScore, scoreOf, updateScore } from '../../state/gradingStore.js';
import { inkStats } from '../../state/inkModel.js';
import { itemAt, readingFor } from '../../state/researchRoster.js';
import { escapeHtml, formatDateTime } from '../../ui/dom.js';
import { breadcrumb, chatMessages, mockAiNote, notice, renderNotFound } from '../../ui/components.js';
import { inkViewHtml, mountInkViews } from '../../ui/inkCanvas.js';
import { statementHtml } from '../../ui/mathText.js';
import { checkedRevisions, gradingQueue, groupPosition, hasExtras, pendingChecks, radioLines, revisionLabel } from './gradingParts.js';

const methodText = (id, other) => (id === 'other' ? `기타: ${other || '쓰지 않음'}` : methodOptionLabel(id) || '고르지 않음');

export function renderGrade(root, [key]) {
  const rater = currentRater();
  const { targets, blind, byProposition, byStage } = gradingQueue(rater.id);
  const index = targets.findIndex((t) => t.key === key);
  const target = targets[index];
  if (!target) {
    renderNotFound(root);
    return null;
  }
  const rubric = activeRubric();
  let disposeInk = () => {};
  let aiPending = false;
  let aiError = '';
  let editingReading = false;

  /** AI가 채점할 글: 키보드로 쓴 글 + (필기면) AI가 읽은 글 */
  const aiInput = () => {
    const parts = [];
    if (String(target.text).trim()) parts.push(['text', target.text]);
    if (inkStats(target.ink).strokes && target.reading?.text) parts.push(['inkReading', target.reading.text]);
    return { text: parts.map(([, t]) => t).join('\n'), source: parts.map(([s]) => s).join('+') };
  };

  const nextKey = () => {
    const after = [...targets.slice(index + 1), ...targets.slice(0, index)];
    return after.find((t) => !scoreOf(rater.id, t.key) || pendingChecks(t, scoreOf(rater.id, t.key)).length)?.key ?? null;
  };

  function proofBlock() {
    const { item, stageDef } = target;
    const hasText = String(target.text).trim().length > 0;
    const strokes = inkStats(target.ink).strokes;
    const chosen = methodText(item[stageDef.methodField], item[stageDef.otherField]);
    const reading = target.reading;
    const edited = reading?.edited;
    const readBlock = reading
      ? `<div class="grade-sub grade-reading" data-reading>
          <h3 class="grade-sub__title">AI가 읽은 글${reading.source === 'sample' ? ' <span class="tag tag--proto">예시</span>' : ''}${edited ? ' <span class="tag tag--mint">교사가 고침</span>' : ''}</h3>
          <p class="meta">필기를 글자로만 옮긴 것입니다. 증명 내용은 고치지 않으며, 잘못 읽을 수 있으니 위의 필기와 비교해 보세요.${reading.source === 'sample' ? ' 실제 AI가 아니라 미리 만든 예시입니다.' : ''} 학생에게는 보이지 않습니다.</p>
          ${editingReading
            ? `<div class="field"><label class="field__label" for="reading-edit">읽은 글 고치기 <span class="field__req">필기에 쓴 그대로 옮기세요. 증명을 고치지 않습니다.</span></label><textarea class="field__input" id="reading-edit" name="readingEdit" rows="6">${escapeHtml(reading.text)}</textarea></div>
              <div class="actions actions--start"><button type="button" class="button button--secondary button--small" data-action="reading-save">고친 글 저장</button><button type="button" class="button button--ghost button--small" data-action="reading-cancel">취소</button></div>`
            : `<div class="proof-text">${escapeHtml(reading.text)}</div>
              ${edited ? `<p class="meta">${escapeHtml(edited.by)}이(가) ${escapeHtml(formatDateTime(edited.at))}에 고침. 채점 도우미와 분석은 고친 글을 씁니다.</p><details class="ref-card"><summary>AI가 처음 읽은 글</summary><div class="proof-text">${escapeHtml(edited.original ?? '')}</div></details>` : ''}
              <div class="actions actions--start"><button type="button" class="button button--ghost button--small" data-action="reading-edit">읽은 글 고치기</button>${edited ? '<button type="button" class="button button--ghost button--small" data-action="reading-reset">AI가 읽은 글로 되돌리기</button>' : ''}</div>`}
        </div>`
      : `<div class="grade-sub grade-reading">
          <h3 class="grade-sub__title">AI가 읽은 글</h3>
          <p class="meta">필기를 글자로 옮기는 AI는 실제 AI를 연결한 뒤에 제공합니다.</p>
        </div>`;
    const body = [
      strokes ? `<div class="grade-sub"><h3 class="grade-sub__title">펜으로 쓴 필기</h3>${inkViewHtml(target.key, target.ink)}</div>${readBlock}` : '',
      hasText ? `<div class="grade-sub">${strokes ? '<h3 class="grade-sub__title">키보드로 쓴 글</h3>' : ''}<div class="proof-text">${escapeHtml(target.text)}</div></div>` : '',
    ].join('') || '<p class="empty-text">쓴 내용이 없습니다.</p>';
    return `<section class="grade-proof" aria-labelledby="proof-heading">
      <h2 id="proof-heading" class="section-title">채점할 증명</h2>
      <p class="meta">${target.stage === 2 ? '학생이 기록한 AI의 증명법' : '학생이 고른 증명법'}: <strong>${escapeHtml(chosen)}</strong></p>
      ${body}
    </section>`;
  }

  function rubricForm(score) {
    const criteria = rubric.map((c) => radioLines({
      name: `c-${c.id}`,
      legend: `${c.title} (0~${c.max}점)`,
      help: c.desc,
      required: true,
      value: score?.criteria?.[c.id],
      aiSlot: true,
      options: Object.keys(c.levels).map(Number).sort((a, b) => b - a).map((n) => ({ id: n, html: `<strong class="num">${n}점</strong> ${escapeHtml(c.levels[n])}` })),
    })).join('');
    const total = score ? totalOf(score) : null;
    return `<form class="grade-form" data-grade-form novalidate aria-labelledby="rubric-heading">
      <div class="section-head">
        <h2 id="rubric-heading" class="section-title">루브릭 점수</h2>
        <p class="grade-total" data-grade-total aria-live="polite">합계 <strong class="num">${total ?? '–'}</strong> / ${RUBRIC_TOTAL}</p>
      </div>
      ${criteria}
      ${radioLines({ name: 'completeness', legend: '완성도 (점수에 넣지 않음)', required: true, value: score?.completeness, options: COMPLETENESS_OPTIONS, aiSlot: true })}
      ${radioLines({ name: 'actualMethod', legend: '실제로 쓴 증명법', help: '증명법 일치(3번 기준)를 판단한 근거로 남깁니다.', required: true, value: score?.actualMethod, options: ACTUAL_METHOD_OPTIONS, aiSlot: true })}
      <div class="field">
        <label class="field__label" for="grade-note">채점 메모 <span class="field__req">(선택)</span></label>
        <textarea id="grade-note" class="field__input" name="note" rows="3">${escapeHtml(score?.note ?? '')}</textarea>
      </div>
      <div class="submit-errors" data-grade-errors aria-live="assertive"></div>
    </form>`;
  }

  /** 왼쪽(읽을 것): 2단계면 대화창의 원래 AI 답. 블라인드에서는 점수 저장 뒤에 보여 준다(단계가 드러남). */
  function extrasRead(score) {
    if (target.stage !== 2 || (blind && !score)) return '';
    const help = target.item.chat?.messages.filter((m) => m.role === 'ai' && (m.coverage ?? 0) >= PROOF_HELP_MIN) ?? [];
    const byPen = target.item.transcriptCheck === 'teacher';
    return `<section class="grade-extras grade-extras--read" aria-labelledby="ai-answer-heading">
      <h2 id="ai-answer-heading" class="section-title">대화창의 원래 AI 답</h2>
      ${byPen ? notice('eye', '필기로 옮겨 적은 증명입니다', '글자 비교를 할 수 없어 학생 화면에서는 필기 양만 확인했습니다. 아래 대화의 AI 답과 비교해 확인해 주세요.') : `<p class="meta">학생 화면의 글자 비교 일치도: ${target.item.transcriptMatch == null ? '–' : `${Math.round(target.item.transcriptMatch * 100)}%`}</p>`}
      <div class="chat-ref">
        <p class="chat-ref__head">증명 도움으로 인정된 답 ${help.length}개</p>
        <ol class="chat__log chat__log--ref">${chatMessages(help)}</ol>
      </div>
    </section>`;
  }

  /** 오른쪽(고를 것): 단계별 추가 확인 */
  function extrasBlock(score) {
    if (!hasExtras(target)) return '';
    if (blind && !score) {
      return `<section class="grade-extras" aria-labelledby="extras-heading">
        <h2 id="extras-heading" class="section-title">추가 확인</h2>
        <p class="meta">블라인드 채점이라 단계가 드러나는 확인은 점수를 저장한 뒤에 열립니다.</p>
      </section>`;
    }
    if (target.stage === 2) {
      return `<section class="grade-extras" aria-labelledby="extras-heading">
        <h2 id="extras-heading" class="section-title">옮겨 적기 확인 (2단계)</h2>
        ${radioLines({ name: 'transcript', legend: '옮겨 적은 증명이 왼쪽의 원래 AI 답과 같은가요?', value: score?.transcript, options: TRANSCRIPT_OPTIONS })}
      </section>`;
    }
    const revisions = checkedRevisions(target);
    const stuck = itemAt(target.student, 1, target.problemId)?.stuck ?? '';
    return `<section class="grade-extras" aria-labelledby="extras-heading">
      <h2 id="extras-heading" class="section-title">보완 확인 (4단계)</h2>
      ${revisions.length
        ? revisions.map((id) => radioLines({ name: `rev-${id}`, legend: `3단계에 체크한 보완할 점: ${revisionLabel(id)}`, value: score?.revisions?.[id], options: REVISION_OPTIONS })).join('')
        : '<p class="meta">3단계에서 내 증명의 보완할 점을 체크하지 않았습니다("찾지 못했다").</p>'}
      ${radioLines({ name: 'stuckOvercome', legend: '1단계에서 막힌 점을 최종 증명에서 극복했나요?', help: `1단계에 쓴 막힌 점: ${stuck || '쓰지 않음'}`, value: score?.stuckOvercome, options: STUCK_OVERCOME_OPTIONS })}
    </section>`;
  }

  function draw({ focus = null } = {}) {
    disposeInk();
    const score = scoreOf(rater.id, target.key);
    const prev = targets[index - 1];
    const who = blind
      ? '<span class="tag">블라인드</span>'
      : `<span class="tag tag--strong">${escapeHtml(target.student.pseudonym)}</span><span class="tag">${escapeHtml(target.stageDef.label)}</span>${target.student.sample ? '<span class="tag tag--proto">예시</span>' : ''}`;
    const extrasOpen = hasExtras(target) && (!blind || score);
    root.innerHTML = `<div class="page page--teacher page--grade">
      ${breadcrumb([{ label: '교사 화면', href: '#/teacher' }, { label: '증명 채점', href: '#/teacher/grading' }, { label: `증명 ${index + 1}` }])}
      <header class="page-intro">
        <h1>증명 ${index + 1} <span class="grade-count">/ ${targets.length}</span></h1>
        <p class="grade-who">${who}${byProposition ? (() => { const g = groupPosition(targets, target, byStage); return `<span class="tag tag--strong">명제 ${target.propIndex + 1}${byStage ? ` ${target.stage}단계` : ''} 묶음 ${g.n} / ${g.total}</span>`; })() : ''}<span class="tag">채점자: ${escapeHtml(rater.name)}</span></p>
      </header>
      <section class="proposition grade-prop" aria-label="명제">
        <p class="meta">명제 ${target.propIndex + 1}</p>
        <p class="proposition__statement">${statementHtml(target.problem?.statement ?? '')}</p>
      </section>
      <div class="split grade-layout">
        <div class="split__main grade-read" data-grade-read>${proofBlock()}${extrasRead(score)}</div>
        <div class="split__side">
          ${score ? notice('success', '채점함', `합계 ${totalOf(score)}점을 저장했습니다. 고친 뒤 다시 저장하면 바뀝니다.${pendingChecks(target, score).length ? ` 남은 추가 확인: ${pendingChecks(target, score).join(', ')}` : ''}`) : ''}
          <section class="ai-assist" data-ai-panel aria-labelledby="ai-assist-heading"></section>
          ${rubricForm(score)}${extrasBlock(score)}
        </div>
      </div>
      <div class="actions grade-actions">
        <p class="save-status" data-grade-status aria-live="polite"></p>
        ${prev ? `<a class="button button--ghost" href="#/teacher/grading/${prev.key}">이전 증명</a>` : ''}
        <a class="button button--secondary" href="#/teacher/grading">채점 목록</a>
        <button type="button" class="button button--primary" data-action="save">${extrasOpen && score ? '확인 저장하고 다음' : '저장하고 다음'}</button>
      </div>
    </div>`;
    disposeInk = mountInkViews(root, () => target.ink);
    renderAi();
    if (focus) root.querySelector(focus)?.focus();
  }

  // ── AI 채점 도우미 ─────────────────────
  const optionLabel = (options, id) => options.find((o) => o.id === id)?.label ?? id;

  /** AI 패널과 기준별 제안(점수·근거, AI가 고른 줄 표시)을 그린다. 채점자가 고른 점수는 건드리지 않는다. */
  function renderAi() {
    const panel = root.querySelector('[data-ai-panel]');
    if (!panel) return;
    const ai = aiGradeOf(rater.id, target.key);
    const input = aiInput();
    const canGrade = input.text.trim().length > 0;
    const stale = ai && ai.rubricEditedAt !== getGrading().rubricEditedAt;
    panel.innerHTML = `<div class="section-head">
        <h2 id="ai-assist-heading" class="section-title">AI 채점 도우미</h2>
        <button type="button" class="button button--secondary button--small" data-action="ai-grade"${aiPending || !canGrade ? ' disabled' : ''}>${aiPending ? 'AI가 채점하는 중…' : ai ? 'AI로 다시 채점해 보기' : 'AI로 채점해 보기'}</button>
      </div>
      ${!canGrade ? `<p class="meta">${inkStats(target.ink).strokes ? '필기만 있고 AI가 읽은 글이 없어 AI가 채점할 수 없습니다.' : '쓴 내용이 없어 AI가 채점할 수 없습니다.'}</p>` : ''}
      ${ai
        ? `<p class="ai-assist__total">AI 제안 합계 <strong class="num">${ai.total}</strong> / ${RUBRIC_TOTAL}</p>
           <p>${escapeHtml(ai.summary)}</p>
           <p class="meta">기준마다 아래에 AI가 고른 점수와 근거가 보입니다. 참고용이며, 점수는 직접 골라 주세요.${ai.source.includes('inkReading') ? ' 필기는 AI가 읽은 글로 채점했으니 읽기 오류가 있을 수 있습니다.' : ''}</p>
           ${stale ? '<p class="meta">AI로 채점한 뒤 루브릭을 고쳤습니다. 다시 채점해 보세요.</p>' : ''}`
        : canGrade ? '<p class="meta">누르면 AI가 이 증명을 루브릭 기준마다 판단해 점수와 근거를 보여 줍니다. 참고용이며 점수는 직접 골라 주세요. AI를 본 뒤 저장한 점수는 따로 표시됩니다.</p>' : ''}
      ${aiError ? `<p class="field__error" role="alert">${escapeHtml(aiError)}</p>` : ''}
      ${mockAiNote('프로토타입: 실제 AI가 아니라 예시 규칙으로 판단합니다. 명제의 예시 증명 단계와 핵심 표현에 비추어 보므로, 예시와 아주 다른 방식의 올바른 증명은 낮게 판단할 수 있습니다.')}`;

    const marks = ai ? {
      ...Object.fromEntries(rubric.map((c) => [`c-${c.id}`, { value: ai.criteria[c.id], text: `AI ${ai.criteria[c.id]}점`, reason: ai.reasons[c.id] }])),
      completeness: { value: ai.completeness, text: `AI: ${optionLabel(COMPLETENESS_OPTIONS, ai.completeness)}`, reason: '' },
      actualMethod: { value: ai.actualMethod, text: `AI: ${optionLabel(ACTUAL_METHOD_OPTIONS, ai.actualMethod)}`, reason: '' },
    } : {};
    root.querySelectorAll('[data-ai-for]').forEach((slot) => {
      const name = slot.dataset.aiFor;
      const mark = marks[name];
      const group = root.querySelector(`#g-${name}`);
      group?.querySelectorAll('.tag--ai').forEach((tag) => tag.remove());
      slot.hidden = !mark;
      slot.innerHTML = mark ? `<span class="tag tag--ai">${escapeHtml(mark.text)}</span>${mark.reason ? `<span>${escapeHtml(mark.reason)}</span>` : ''}` : '';
      if (mark) {
        const label = group?.querySelector(`input[value="${mark.value}"]`)?.closest('label')?.querySelector('span');
        label?.insertAdjacentHTML('beforeend', ' <span class="tag tag--ai" aria-label="AI가 고른 점수">AI</span>');
      }
    });
  }

  async function runAi() {
    const input = aiInput();
    if (!input.text.trim() || aiPending) return;
    aiPending = true;
    aiError = '';
    renderAi();
    const { item, stageDef } = target;
    const request = buildGradeAssistRequest({ problem: target.problem, proofText: input.text, chosenMethod: item[stageDef.methodField], rubric, source: input.source });
    try {
      const result = await requestGradeAssist(request);
      const total = Object.values(result.criteria).reduce((s, v) => s + v, 0);
      saveAiGrade(rater.id, target.key, {
        ...result, total, source: input.source, requestId: request.requestId, model: request.model, promptVersion: request.promptVersion, at: new Date().toISOString(),
      });
    } catch {
      aiError = 'AI 채점을 받지 못했습니다. 잠시 뒤 다시 눌러 주세요.';
    }
    aiPending = false;
    if (root.isConnected) renderAi();
  }

  function totalOf(score) {
    return Object.values(score.criteria ?? {}).reduce((s, v) => s + Number(v), 0);
  }

  function readForm() {
    const data = new FormData(root.querySelector('[data-grade-form]'));
    const criteria = {};
    rubric.forEach((c) => {
      const v = data.get(`c-${c.id}`);
      if (v != null) criteria[c.id] = Number(v);
    });
    return { criteria, completeness: data.get('completeness'), actualMethod: data.get('actualMethod'), note: String(data.get('note') ?? '').trim() };
  }

  function readExtras() {
    const pick = (name) => root.querySelector(`input[name="${name}"]:checked`)?.value ?? null;
    const patch = {};
    if (target.stage === 2) patch.transcript = pick('transcript');
    if (target.stage === 4) {
      patch.revisions = Object.fromEntries(checkedRevisions(target).map((id) => [id, pick(`rev-${id}`)]).filter(([, v]) => v));
      patch.stuckOvercome = pick('stuckOvercome');
    }
    return patch;
  }

  function showMissing(missing) {
    root.querySelectorAll('[data-error-for]').forEach((el) => { el.hidden = true; el.textContent = ''; });
    missing.forEach((name) => {
      const slot = root.querySelector(`[data-error-for="${name}"]`);
      if (slot) {
        slot.hidden = false;
        slot.textContent = '고르세요.';
      }
    });
    root.querySelector('[data-grade-errors]').innerHTML = notice('warn', `고르지 않은 항목이 ${missing.length}개 있습니다`, '모든 기준의 점수, 완성도, 실제로 쓴 증명법을 골라야 저장할 수 있습니다.');
    const first = root.querySelector(`#g-${missing[0]}`);
    first?.scrollIntoView({ block: 'center' });
    first?.querySelector('input')?.focus();
  }

  function save() {
    const form = readForm();
    const missing = [
      ...rubric.filter((c) => form.criteria[c.id] == null).map((c) => `c-${c.id}`),
      ...(form.completeness ? [] : ['completeness']),
      ...(form.actualMethod ? [] : ['actualMethod']),
    ];
    if (missing.length) {
      showMissing(missing);
      return;
    }
    const before = scoreOf(rater.id, target.key);
    const extras = hasExtras(target) && (!blind || before) ? readExtras() : {};
    // AI 제안을 본 상태에서 저장하면 표시하고, AI를 보기 전에 저장했던 점수는 따로 남긴다.
    const ai = aiGradeOf(rater.id, target.key);
    const aiFields = ai ? { aiSeen: true, ...(before && !before.aiSeen ? { criteriaBeforeAi: before.criteria } : {}) } : { aiSeen: before?.aiSeen ?? false };
    const ok = saveScore(rater.id, target.key, { ...(before ?? {}), ...form, ...extras, ...aiFields });
    if (!ok) {
      root.querySelector('[data-grade-status]').textContent = '이 브라우저에 저장하지 못했습니다.';
      return;
    }
    // 블라인드: 처음 저장한 뒤 단계별 추가 확인이 있으면 이 화면에서 연다.
    if (blind && !before && hasExtras(target)) {
      draw({ focus: '#extras-heading' });
      root.querySelector('#extras-heading')?.setAttribute('tabindex', '-1');
      root.querySelector('#extras-heading')?.focus();
      return;
    }
    const next = nextKey();
    window.location.hash = next ? `#/teacher/grading/${next}` : '#/teacher/grading';
  }

  const onChange = (event) => {
    if (!event.target.matches('[data-grade-form] input[type="radio"]')) return;
    const form = readForm();
    const total = root.querySelector('[data-grade-total] strong');
    if (total) total.textContent = Object.keys(form.criteria).length ? String(Object.values(form.criteria).reduce((s, v) => s + v, 0)) : '–';
    const slot = root.querySelector(`[data-error-for="${event.target.name}"]`);
    if (slot) slot.hidden = true;
  };
  // 점수를 저장한 뒤에는 추가 확인을 고르는 즉시 저장한다.
  const onExtrasChange = (event) => {
    if (!event.target.closest('.grade-extras') || !scoreOf(rater.id, target.key)) return;
    updateScore(rater.id, target.key, readExtras());
    root.querySelector('[data-grade-status]').textContent = '추가 확인을 저장했습니다.';
  };
  const readingAction = (action) => {
    const item = target.item;
    const field = target.stageDef.field;
    const original = item.inkReading?.[field]?.text ?? '';
    if (action === 'reading-edit') editingReading = true;
    if (action === 'reading-cancel') editingReading = false;
    if (action === 'reading-save') {
      const text = root.querySelector('[name="readingEdit"]').value.trim();
      if (!text) return;
      if (text === original) clearReadingEdit(target.key);
      else saveReadingEdit(target.key, text, original);
      editingReading = false;
    }
    if (action === 'reading-reset') clearReadingEdit(target.key);
    target.reading = readingFor(target.student.id, target.stage, target.problemId, item, field);
    const y = window.scrollY;
    draw({ focus: action === 'reading-edit' ? '#reading-edit' : '[data-action="reading-edit"]' });
    window.scrollTo(0, y);
  };

  const onClick = (event) => {
    const rAct = event.target.closest('[data-action^="reading-"]');
    if (rAct) {
      readingAction(rAct.dataset.action);
      return;
    }
    if (event.target.closest('[data-action="ai-grade"]')) {
      runAi();
      return;
    }
    if (event.target.closest('[data-action="save"]')) save();
  };

  draw();
  root.addEventListener('change', onChange);
  root.addEventListener('change', onExtrasChange);
  root.addEventListener('click', onClick);
  return () => {
    disposeInk();
    root.removeEventListener('change', onChange);
    root.removeEventListener('change', onExtrasChange);
    root.removeEventListener('click', onClick);
  };
}
