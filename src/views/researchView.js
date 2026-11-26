// 연구 모드: 초안 확정 → AI 탐구(명제만) → AI 증명 → 비교·평가 → 최종 증명 → 반영 성찰 → 완료
//
// 이 화면은 학생 초안(session.draft)을 AI 요청에 전달하지 않는다.
// AI 요청은 buildResearchRequest({ problem, messages })로만 만들며, 이 함수는 초안을 받지 않는다.

import { getProblem } from '../data/problems/index.js';
import { getMethod } from '../data/methods.js';
import { MODES } from '../data/modes.js';
import { getOrCreateSession, saveSession, resetSession } from '../state/sessionStore.js';
import { buildResearchRequest, MODEL_PLACEHOLDER, PROMPT_VERSIONS } from '../services/aiRequests.js';
import { requestResearchProof, requestResearchReply } from '../services/mockAiService.js';
import { escapeHtml, formatDateTime, newId, nowIso } from '../ui/dom.js';
import { icons } from '../ui/icons.js';
import {
  chatMessages,
  chatPanel,
  notice,
  propositionBlock,
  proofText,
  renderNotFound,
  requestPreview,
  breadcrumb,
  stepHeading,
  stepIndicator,
} from '../ui/components.js';
import {
  bindFields,
  handleChatShortcut,
  handleSymbolInsert,
  saveStatusText,
  scaleField,
  textArea,
  validateRequired,
} from '../ui/forms.js';

const MODE = MODES.research;
const STEP = { DRAFT: 0, DIALOGUE: 1, AI_PROOF: 2, COMPARE: 3, FINAL: 4, REFLECT: 5, DONE: 6 };

const LEVEL_OPTIONS = ['거의 반영하지 않음', '조금 반영함', '절반 정도 반영함', '대부분 반영함', '거의 그대로 반영함'];

export function renderResearch(root, [problemId]) {
  const problem = getProblem(problemId);
  if (!problem) {
    renderNotFound(root);
    return null;
  }
  const method = getMethod(problem.method);

  let session = getOrCreateSession('research', problem.id);
  let fields = null;
  let pending = false;
  let disposed = false;

  // ── 그리기 ──────────────────────────────────

  function draw({ focusStep = false } = {}) {
    fields?.dispose();
    root.innerHTML = `<div class="page page--solve">
      ${breadcrumb([{ label: '홈', href: '#/' }, { label: 'AI와 탐구하기' }])}
      <header class="solve-header">
        <p class="eyebrow">AI와 탐구하기 · ${escapeHtml(method.label)}</p>
        <h1 class="solve-title">${escapeHtml(problem.title)}</h1>
        <p class="meta">연구 모드의 화면 흐름은 다음 단계에서 다시 설계할 예정입니다.</p>
      </header>
      ${stepIndicator(MODE.steps, session.step)}
      ${propositionBlock(problem)}
      <section class="step-panel" aria-labelledby="step-heading">${stepContent()}</section>
    </div>`;
    fields = bindFields(root, session);

    if (session.step === STEP.DIALOGUE) {
      scrollChatToEnd();
      const last = session.aiDialogue.messages.at(-1);
      if (!pending && (!last || last.role === 'student')) askAi();
    }
    if (focusStep) {
      window.scrollTo(0, 0);
      root.querySelector('#step-heading')?.focus({ preventScroll: true });
    }
  }

  function stepContent() {
    switch (session.step) {
      case STEP.DRAFT: return draftStep();
      case STEP.DIALOGUE: return dialogueStep();
      case STEP.AI_PROOF: return aiProofStep();
      case STEP.COMPARE: return compareStep();
      case STEP.FINAL: return finalStep();
      case STEP.REFLECT: return reflectStep();
      default: return doneStep();
    }
  }

  function saveStatus() {
    return `<p class="save-status" data-save-status aria-live="polite">${escapeHtml(saveStatusText(session))}</p>`;
  }

  function draftStep() {
    return `${stepHeading(1, '나의 증명 쓰고 확정하기', 'AI와 대화하기 전에 먼저 스스로 증명해 보세요. 완벽하지 않아도 괜찮습니다. 확정한 초안은 이후 비교 단계에서 AI의 증명과 나란히 놓고 살펴봅니다.')}
      ${notice('lock', '확정한 초안은 AI에게 전달되지 않습니다', '연구 모드의 AI 탐구는 초안과 별개로 명제만 가지고 진행합니다. 초안을 확정하면 더 이상 고칠 수 없습니다.')}
      ${textArea({ id: 'draft', field: 'draft.text', label: '나의 증명 (초안)', help: method.writingTip, value: session.draft.text, rows: 12, required: true, symbols: true })}
      <div class="actions">
        ${saveStatus()}
        <button type="button" class="button button--ghost" data-action="clear-draft">내용 지우기</button>
        <button type="button" class="button button--primary" data-action="confirm-draft">초안 확정하기</button>
      </div>`;
  }

  function dialogueStep() {
    const lastRequest = session.aiDialogue.requestLog.at(-1) ?? null;
    const messageCount = session.aiDialogue.messages.length;
    return `${stepHeading(2, 'AI와 명제 탐구하기', '명제의 뜻, 사용할 증명법, 막히는 지점에 대해 AI와 이야기해 보세요. 충분히 탐구했다면 AI에게 증명을 요청합니다.')}
      <div class="boundary" role="note">
        <span class="boundary__icon">${icons.eyeOff}</span>
        <div>
          <p class="boundary__title">이 대화에서 AI는 여러분의 초안을 볼 수 없습니다</p>
          <p>AI에게는 명제와 이 대화창에 입력한 내용만 전달됩니다. 초안을 그대로 붙여 넣지 말고, 명제 자체에 대해 묻고 탐구해 보세요.</p>
        </div>
      </div>
      <div class="split">
        <div class="split__main">
          ${chatPanel({
            messages: session.aiDialogue.messages,
            pending,
            label: 'AI에게 질문하기',
            help: '명제에 대해 궁금한 점이나 막히는 지점을 물어보세요.',
          })}
        </div>
        <aside class="split__side" aria-labelledby="ai-input-heading">
          <div class="side-box side-box--research">
            <h3 id="ai-input-heading" class="side-title">AI에게 전달되는 정보</h3>
            <ul class="io-list">
              <li class="io-list__item is-included">${icons.check}<span>명제 문장</span></li>
              <li class="io-list__item is-included">${icons.check}<span>이 대화의 메시지 (<span data-message-count>${messageCount}</span>개)</span></li>
              <li class="io-list__item is-excluded">${icons.x}<span>확정한 내 초안: 전달하지 않음</span></li>
              <li class="io-list__item is-excluded">${icons.x}<span>초안에 대한 평가·분석: 전달하지 않음</span></li>
            </ul>
            <p class="meta">${icons.lock} 내 초안은 ${escapeHtml(formatDateTime(session.draft.confirmedAt))}에 확정되어 보관 중입니다. 비교 단계에서 다시 볼 수 있습니다.</p>
          </div>
          <div data-request-preview>${requestPreview(lastRequest)}</div>
        </aside>
      </div>
      <div class="actions">
        <p class="actions__note">AI 증명을 요청하면 다음 단계로 넘어가며, 대화로 돌아올 수 없습니다.</p>
        <button type="button" class="button button--primary" data-action="request-proof"${pending ? ' disabled' : ''}>AI에게 증명 요청하기</button>
      </div>`;
  }

  function aiProofStep() {
    return `${stepHeading(3, 'AI가 제시한 증명 읽기', '각 줄의 근거가 타당한지, 빠진 경우나 설명이 부족한 곳은 없는지 직접 확인하며 읽으세요.')}
      ${notice('warn', 'AI의 증명이 항상 옳지는 않습니다', '정답으로 받아들이지 말고 비판적으로 검토하세요. 다음 단계에서 내 증명과 비교하며 평가합니다.')}
      ${aiProofArticle()}
      <div class="actions">
        <button type="button" class="button button--primary" data-action="to-compare">내 증명과 비교하기</button>
      </div>`;
  }

  function aiProofArticle(headingLevel = 3) {
    return `<article class="proof-article" aria-labelledby="ai-proof-title">
      <header class="proof-article__head">
        <h${headingLevel} id="ai-proof-title" class="side-title">AI의 증명</h${headingLevel}>
        <p class="meta">생성 ${escapeHtml(formatDateTime(session.aiProof.generatedAt))} · 모델 ${escapeHtml(MODEL_PLACEHOLDER)} · 프롬프트 ${escapeHtml(PROMPT_VERSIONS.research)}</p>
      </header>
      ${proofText(session.aiProof.text)}
    </article>`;
  }

  function compareStep() {
    const c = 'comparison';
    return `${stepHeading(4, '두 증명 비교·평가하기', '내 증명과 AI 증명을 나란히 놓고 각각의 잘한 점과 부족한 점을 구체적으로 적어 보세요.')}
      <div class="compare">
        <section class="compare__col" aria-labelledby="cmp-own">
          <h3 id="cmp-own" class="side-title">내 증명 (확정한 초안)</h3>
          ${proofText(session.draft.text)}
        </section>
        <section class="compare__col compare__col--ai" aria-labelledby="cmp-ai">
          <h3 id="cmp-ai" class="side-title">AI의 증명</h3>
          ${proofText(session.aiProof.text)}
        </section>
      </div>
      <div class="eval-grid">
        <fieldset class="eval-group">
          <legend class="eval-group__legend">내 증명 평가</legend>
          ${textArea({ id: 'own-strengths', field: `${c}.ownStrengths`, label: '잘한 점', value: session.comparison.ownStrengths, rows: 3, required: true })}
          ${textArea({ id: 'own-weaknesses', field: `${c}.ownWeaknesses`, label: '부족한 점', value: session.comparison.ownWeaknesses, rows: 3, required: true })}
        </fieldset>
        <fieldset class="eval-group">
          <legend class="eval-group__legend">AI 증명 평가</legend>
          ${textArea({ id: 'ai-strengths', field: `${c}.aiStrengths`, label: '잘한 점', value: session.comparison.aiStrengths, rows: 3, required: true })}
          ${textArea({ id: 'ai-weaknesses', field: `${c}.aiWeaknesses`, label: '부족한 점', value: session.comparison.aiWeaknesses, rows: 3, required: true })}
          ${textArea({ id: 'ai-regrets', field: `${c}.aiRegrets`, label: 'AI 증명에서 아쉬운 점', help: '근거 설명, 표현, 빠진 경우, 이해하기 어려운 부분 등', value: session.comparison.aiRegrets, rows: 3, required: true })}
        </fieldset>
      </div>
      <details class="disclosure">
        <summary>AI 대화 기록 보기 (${session.aiDialogue.messages.length})</summary>
        <ol class="chat__log chat__log--compact">${chatMessages(session.aiDialogue.messages)}</ol>
      </details>
      <div class="actions">
        ${saveStatus()}
        <button type="button" class="button button--primary" data-action="to-final">최종 증명 쓰기</button>
      </div>`;
  }

  function finalStep() {
    return `${stepHeading(5, '최종 증명 쓰기', '두 증명과 앞에서 쓴 평가를 참고해, 내가 옳다고 판단한 방식으로 최종 증명을 씁니다.')}
      <div class="split">
        <div class="split__main">
          ${textArea({ id: 'final-proof', field: 'finalProof.text', label: '최종 증명', value: session.finalProof.text, rows: 14, required: true, symbols: true })}
        </div>
        <aside class="split__side" aria-label="참고 자료">
          <details class="disclosure" open>
            <summary>내 증명 (확정한 초안)</summary>
            ${proofText(session.draft.text)}
          </details>
          <details class="disclosure" open>
            <summary>AI의 증명</summary>
            ${proofText(session.aiProof.text)}
          </details>
        </aside>
      </div>
      <div class="actions">
        ${saveStatus()}
        <button type="button" class="button button--ghost" data-action="back-to-compare">비교·평가로 돌아가기</button>
        <button type="button" class="button button--primary" data-action="to-reflect">반영 성찰 쓰기</button>
      </div>`;
  }

  function reflectStep() {
    const r = session.reflection;
    return `${stepHeading(6, '반영 정도 돌아보기', '최종 증명에 내 초안과 AI 증명을 각각 얼마나 반영했는지 고르고, 그 이유를 설명하세요.')}
      ${scaleField({ id: 'own-level', field: 'reflection.ownReflectedLevel', legend: '내 초안을 얼마나 반영했나요?', value: r.ownReflectedLevel, options: LEVEL_OPTIONS })}
      ${scaleField({ id: 'ai-level', field: 'reflection.aiReflectedLevel', legend: 'AI 증명을 얼마나 반영했나요?', value: r.aiReflectedLevel, options: LEVEL_OPTIONS })}
      ${textArea({ id: 'reflection-text', field: 'reflection.explanation', label: '어떤 부분을 어디에서 가져왔고, 왜 그렇게 판단했나요?', help: '예: "가정을 세우는 부분은 내 초안을, 모순을 이끌어 내는 과정은 AI 증명을 참고했다. 그 이유는 …"', value: r.explanation, rows: 6, required: true })}
      <div class="actions">
        ${saveStatus()}
        <button type="button" class="button button--ghost" data-action="back-to-final">최종 증명으로 돌아가기</button>
        <button type="button" class="button button--primary" data-action="submit">제출하기</button>
      </div>`;
  }

  function doneStep() {
    const c = session.comparison;
    const r = session.reflection;
    const level = (value) => (value ? `${value} · ${LEVEL_OPTIONS[value - 1]}` : '선택하지 않음');
    return `<h2 id="step-heading" class="step-title" tabindex="-1">활동 완료</h2>
      ${notice('success', '연구 활동 기록을 제출했습니다', '이 기록은 현재 이 브라우저에만 임시로 보관됩니다. 서버 저장은 아직 연결되지 않았습니다.')}
      <ol class="timeline">
        <li class="timeline__item">
          <h3 class="timeline__title">1. 확정한 초안 <span class="meta">${escapeHtml(formatDateTime(session.draft.confirmedAt))}</span></h3>
          ${proofText(session.draft.text)}
        </li>
        <li class="timeline__item">
          <h3 class="timeline__title">2. AI 탐구 <span class="meta">메시지 ${session.aiDialogue.messages.length}개 · AI 요청 ${session.aiDialogue.requestLog.length}회</span></h3>
          <details class="disclosure">
            <summary>대화 기록 보기</summary>
            <ol class="chat__log chat__log--compact">${chatMessages(session.aiDialogue.messages)}</ol>
          </details>
        </li>
        <li class="timeline__item">
          <h3 class="timeline__title">3. AI의 증명 <span class="meta">${escapeHtml(formatDateTime(session.aiProof.generatedAt))}</span></h3>
          ${proofText(session.aiProof.text)}
        </li>
        <li class="timeline__item">
          <h3 class="timeline__title">4. 비교·평가</h3>
          <dl class="record-list">
            <div><dt>내 증명 · 잘한 점</dt><dd>${proofText(c.ownStrengths)}</dd></div>
            <div><dt>내 증명 · 부족한 점</dt><dd>${proofText(c.ownWeaknesses)}</dd></div>
            <div><dt>AI 증명 · 잘한 점</dt><dd>${proofText(c.aiStrengths)}</dd></div>
            <div><dt>AI 증명 · 부족한 점</dt><dd>${proofText(c.aiWeaknesses)}</dd></div>
            <div><dt>AI 증명에서 아쉬운 점</dt><dd>${proofText(c.aiRegrets)}</dd></div>
          </dl>
        </li>
        <li class="timeline__item">
          <h3 class="timeline__title">5. 최종 증명 <span class="meta">${escapeHtml(formatDateTime(session.finalProof.savedAt))}</span></h3>
          ${proofText(session.finalProof.text)}
        </li>
        <li class="timeline__item">
          <h3 class="timeline__title">6. 반영 성찰 <span class="meta">${escapeHtml(formatDateTime(r.submittedAt))}</span></h3>
          <dl class="record-list">
            <div><dt>내 초안 반영</dt><dd>${escapeHtml(level(r.ownReflectedLevel))}</dd></div>
            <div><dt>AI 증명 반영</dt><dd>${escapeHtml(level(r.aiReflectedLevel))}</dd></div>
            <div><dt>설명</dt><dd>${proofText(r.explanation)}</dd></div>
          </dl>
        </li>
      </ol>
      <details class="disclosure">
        <summary>기록 구조 보기 (개발·연구 확인용)</summary>
        <p class="disclosure__note">초안(draft)과 AI 대화 입력(aiDialogue.requestLog[].input)이 별도 필드로 저장됩니다. AI 요청 입력에는 초안 필드가 없습니다.</p>
        <pre class="code-block"><code>${escapeHtml(JSON.stringify(session, null, 2))}</code></pre>
      </details>
      <div class="actions">
        <button type="button" class="button button--ghost" data-action="restart">기록 지우고 다시 하기</button>
        <a class="button button--primary" href="#/">명제 목록으로</a>
      </div>`;
  }

  // ── 동작 ──────────────────────────────────

  function goTo(step) {
    session.step = step;
    saveSession(session);
    draw({ focusStep: true });
  }

  async function askAi(studentText) {
    if (pending) return;
    const dialogue = session.aiDialogue;
    if (studentText) dialogue.messages.push({ id: newId('msg'), role: 'student', text: studentText, at: nowIso() });

    // 연구 모드: 명제와 이 대화만 입력으로 사용한다. 초안은 넘기지 않는다.
    const request = buildResearchRequest({ problem, messages: dialogue.messages, purpose: 'dialogue' });
    dialogue.requestLog.push(request);
    saveSession(session);

    pending = true;
    refreshChat();
    const reply = await requestResearchReply(request);
    dialogue.messages.push({ id: newId('msg'), role: 'ai', text: reply.text, at: nowIso(), requestId: request.requestId });
    saveSession(session);
    pending = false;
    if (!disposed && session.step === STEP.DIALOGUE) refreshChat();
  }

  async function requestProof(button) {
    if (pending) return;
    const dialogue = session.aiDialogue;
    const request = buildResearchRequest({ problem, messages: dialogue.messages, purpose: 'proof' });
    dialogue.requestLog.push(request);
    saveSession(session);

    pending = true;
    button.disabled = true;
    button.textContent = 'AI가 증명을 작성하고 있습니다…';
    const send = root.querySelector('[data-chat-send]');
    if (send) send.disabled = true;

    const reply = await requestResearchProof(request);
    session.aiProof = { text: reply.text, generatedAt: nowIso(), requestId: request.requestId };
    pending = false;
    if (disposed) {
      // 화면을 떠났더라도 결과는 보존하고 다음 단계로 넘긴다.
      session.step = STEP.AI_PROOF;
      saveSession(session);
      return;
    }
    goTo(STEP.AI_PROOF);
  }

  function refreshChat() {
    const log = root.querySelector('[data-chat-log]');
    if (!log) return;
    log.innerHTML = chatMessages(session.aiDialogue.messages, { pending });
    const preview = root.querySelector('[data-request-preview]');
    if (preview) preview.innerHTML = requestPreview(session.aiDialogue.requestLog.at(-1));
    const count = root.querySelector('[data-message-count]');
    if (count) count.textContent = String(session.aiDialogue.messages.length);
    root.querySelectorAll('[data-chat-send], [data-action="request-proof"]').forEach((el) => {
      el.disabled = pending;
    });
    scrollChatToEnd();
  }

  function scrollChatToEnd() {
    const log = root.querySelector('[data-chat-log]');
    if (log) log.scrollTop = log.scrollHeight;
  }

  const actions = {
    'clear-draft'() {
      if (session.draft.text.trim() && !window.confirm('작성한 초안을 모두 지울까요? 지운 내용은 되돌릴 수 없습니다.')) return;
      session.draft.text = '';
      saveSession(session);
      draw();
      root.querySelector('#draft')?.focus();
    },
    'confirm-draft'() {
      fields.flush();
      const ok = validateRequired(root, [
        { field: 'draft.text', min: 10, message: '초안을 10자 이상 써 주세요. 막힌 지점까지만 써도 괜찮습니다.' },
      ]);
      if (!ok) return;
      if (!window.confirm('초안을 확정할까요? 확정한 뒤에는 초안을 고칠 수 없습니다.')) return;
      session.draft.confirmedAt = nowIso();
      goTo(STEP.DIALOGUE);
    },
    'request-proof'(button) {
      requestProof(button);
    },
    'to-compare'() {
      goTo(STEP.COMPARE);
    },
    'to-final'() {
      fields.flush();
      const ok = validateRequired(root, [
        { field: 'comparison.ownStrengths', message: '내 증명의 잘한 점을 써 주세요.' },
        { field: 'comparison.ownWeaknesses', message: '내 증명의 부족한 점을 써 주세요.' },
        { field: 'comparison.aiStrengths', message: 'AI 증명의 잘한 점을 써 주세요.' },
        { field: 'comparison.aiWeaknesses', message: 'AI 증명의 부족한 점을 써 주세요.' },
        { field: 'comparison.aiRegrets', message: 'AI 증명에서 아쉬운 점을 써 주세요.' },
      ]);
      if (ok) goTo(STEP.FINAL);
    },
    'back-to-compare'() {
      fields.flush();
      goTo(STEP.COMPARE);
    },
    'to-reflect'() {
      fields.flush();
      const ok = validateRequired(root, [{ field: 'finalProof.text', message: '최종 증명을 써 주세요.' }]);
      if (!ok) return;
      session.finalProof.savedAt = nowIso();
      goTo(STEP.REFLECT);
    },
    'back-to-final'() {
      fields.flush();
      goTo(STEP.FINAL);
    },
    submit() {
      fields.flush();
      const ok = validateRequired(root, [
        { field: 'reflection.ownReflectedLevel', group: 'own-level', message: '내 초안을 반영한 정도를 골라 주세요.' },
        { field: 'reflection.aiReflectedLevel', group: 'ai-level', message: 'AI 증명을 반영한 정도를 골라 주세요.' },
        { field: 'reflection.explanation', message: '반영한 내용과 이유를 설명해 주세요.' },
      ]);
      if (!ok) return;
      session.reflection.submittedAt = nowIso();
      session.completedAt = nowIso();
      goTo(STEP.DONE);
    },
    restart() {
      if (!window.confirm('이 명제의 연구 활동 기록을 지우고 처음부터 다시 할까요? 지운 내용은 되돌릴 수 없습니다.')) return;
      resetSession('research', problem.id);
      session = getOrCreateSession('research', problem.id);
      draw({ focusStep: true });
    },
  };

  const onClick = (event) => {
    if (handleSymbolInsert(event, root)) return;
    const button = event.target.closest('[data-action]');
    if (button && root.contains(button) && !button.disabled) actions[button.dataset.action]?.(button);
  };

  const onSubmit = (event) => {
    if (!event.target.matches('[data-chat-form]')) return;
    event.preventDefault();
    const input = event.target.querySelector('#chat-input');
    const text = input.value.trim();
    if (!text || pending) return;
    input.value = '';
    askAi(text);
  };

  draw();
  root.addEventListener('click', onClick);
  root.addEventListener('submit', onSubmit);
  root.addEventListener('keydown', handleChatShortcut);

  return () => {
    disposed = true;
    fields?.dispose();
    root.removeEventListener('click', onClick);
    root.removeEventListener('submit', onSubmit);
    root.removeEventListener('keydown', handleChatShortcut);
  };
}
