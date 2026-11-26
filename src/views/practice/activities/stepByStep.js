// 활동 5: AI와 한 단계씩 증명하기 (AI 점검 · 현재는 더미)
// 학생이 한 단계를 쓰면 AI가 점검한다. 통과하면 증명에 차곡차곡 쌓이고, 아니면 고칠 방향을 안내한다.

import { REVEAL_AFTER_TRIES } from '../../../data/levels.js';
import { stepText } from '../../../data/proofModel.js';
import { buildStepCheckRequest } from '../../../services/aiRequests.js';
import { requestStepCheck } from '../../../services/mockProofChecker.js';
import { saveAttempt } from '../../../state/attemptStore.js';
import { escapeHtml, nowIso } from '../../../ui/dom.js';
import { icons } from '../../../ui/icons.js';
import { mockAiNote } from '../../../ui/components.js';
import { bindFields, handleSymbolInsert, textArea, validateRequired } from '../../../ui/forms.js';
import { aiFeedback, setBusy, triesNote } from './kit.js';

export default {
  createData: () => ({ done: [], draft: '', tries: 0, feedback: null, revealed: false }),

  mount(el, ctx) {
    const { problem } = ctx;
    const attempt = ctx.attempt;
    const data = attempt.data;
    const total = problem.steps.length;
    const finished = attempt.status !== 'in-progress';
    let fields = null;
    let pending = false;

    function stack() {
      if (!data.done.length) {
        return '<p class="empty-text">아직 쌓인 단계가 없습니다. 증명의 첫 단계부터 써 보세요.</p>';
      }
      const items = data.done.map((item, index) => `<li class="stack__item${item.assisted ? ' is-assisted' : ''}">
          <span class="stack__num" aria-hidden="true">${index + 1}</span>
          <p class="stack__text">${escapeHtml(item.text)}</p>
          <span class="stack__mark">${item.assisted ? `${icons.info}<span>예시 참고</span>` : `${icons.check}<span>점검 통과</span>`}</span>
        </li>`).join('');
      return `<ol class="stack" aria-label="쌓인 증명">${items}</ol>`;
    }

    function currentStep() {
      const current = data.done.length;
      if (finished || current >= total) return '';
      return `<div class="current-step">
        ${textArea({
          id: 'current-step',
          field: 'data.draft',
          label: `${current + 1}번째 단계 쓰기`,
          help: current === 0
            ? '한 번에 한 단계(한두 문장)만 씁니다. 증명을 어떻게 시작할지 먼저 써 보세요.'
            : '앞 단계에 이어지는 다음 단계를 한두 문장으로 쓰세요.',
          value: data.draft,
          rows: 3,
          required: true,
          symbols: true,
        })}
        <div class="actions">
          <p class="save-status" data-save-status aria-live="polite"></p>
          ${triesNote(data.tries)}
          ${data.tries >= REVEAL_AFTER_TRIES ? '<button type="button" class="button button--ghost" data-action="reveal">이 단계 예시 보기</button>' : ''}
          <button type="button" class="button button--primary" data-action="check">AI에게 점검받기</button>
        </div>
      </div>`;
    }

    function render() {
      fields?.dispose();
      el.innerHTML = `${finished ? '' : `<p class="step-desc">증명을 한 단계씩 쓰고 AI에게 점검받으세요. 통과한 단계는 아래에 차곡차곡 쌓입니다. 이 명제의 예시 증명은 ${total}단계입니다.</p>`}
        ${mockAiNote()}
        <section class="stack-section" aria-labelledby="stack-heading">
          <h2 id="stack-heading" class="section-title">쌓인 증명 <span class="meta">${data.done.length} / ${total}단계</span></h2>
          ${stack()}
        </section>
        <div aria-live="polite">${finished ? '' : aiFeedback(data.feedback)}</div>
        ${currentStep()}`;
      if (!finished) fields = bindFields(el, attempt, saveAttempt);
    }

    function afterStackChange() {
      if (data.done.length === total) {
        data.revealed = data.done.some((item) => item.assisted);
        ctx.save();
        ctx.finish({ passed: !data.revealed });
        return;
      }
      ctx.save();
      render();
      el.querySelector('#current-step')?.focus();
    }

    async function check(button) {
      if (pending) return;
      fields.flush();
      if (!validateRequired(el, [{ field: 'data.draft', message: '이 단계에 들어갈 내용을 써 주세요.' }])) return;

      pending = true;
      setBusy(button, true, 'AI가 점검하고 있습니다…');
      const stepIndex = data.done.length;
      const request = buildStepCheckRequest({
        problem,
        levelId: 'step-by-step',
        stepIndex,
        studentStep: data.draft,
        previousSteps: data.done.map((item) => item.text),
        tries: data.tries,
      });
      ctx.logRequest(request);
      const result = await requestStepCheck(request);
      pending = false;

      if (result.passed) {
        data.done.push({ text: data.draft, assisted: false, verdict: result.verdict, at: nowIso() });
        data.draft = '';
        data.tries = 0;
        const more = data.done.length < total ? ' 다음 단계를 이어서 써 보세요.' : '';
        data.feedback = { ...result, message: `${result.message}${more}` };
      } else {
        data.tries += 1;
        data.feedback = result;
      }
      if (!el.isConnected) {
        ctx.save();
        return;
      }
      afterStackChange();
    }

    function reveal() {
      if (!window.confirm('예시 단계를 보면 이번 시도는 통과로 인정되지 않습니다. 예시 단계를 쌓을까요?')) return;
      fields?.flush();
      const step = problem.steps[data.done.length];
      data.done.push({ text: stepText(step), assisted: true, at: nowIso() });
      data.draft = '';
      data.tries = 0;
      data.feedback = { verdict: 'info', message: '예시 단계를 쌓았습니다. 이 단계가 왜 필요한지 읽어 보고 다음 단계를 써 보세요.' };
      afterStackChange();
    }

    const onClick = (event) => {
      if (handleSymbolInsert(event, el)) return;
      const button = event.target.closest('[data-action]');
      if (button?.dataset.action === 'check') check(button);
      if (button?.dataset.action === 'reveal') reveal();
    };

    render();
    el.addEventListener('click', onClick);
    return () => fields?.dispose();
  },
};
