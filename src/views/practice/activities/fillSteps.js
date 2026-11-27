// 활동 4: 빠진 단계 채우기 (AI 점검 · 현재는 더미)

import { practiceSettings } from '../../../state/practiceSettings.js';
import { stepText } from '../../../data/proofModel.js';
import { buildStepCheckRequest } from '../../../services/aiRequests.js';
import { requestStepCheck } from '../../../services/mockProofChecker.js';
import { saveAttempt } from '../../../state/attemptStore.js';
import { escapeHtml } from '../../../ui/dom.js';
import { mathText } from '../../../ui/mathText.js';
import { mockAiNote, proofText } from '../../../ui/components.js';
import { bindFields, handleSymbolInsert, textArea, validateRequired } from '../../../ui/forms.js';
import { aiFeedback, pickMiddleSteps, setBusy, triesNote } from './kit.js';

export default {
  createData: (problem) => ({
    missing: pickMiddleSteps(problem.steps.length, 2),
    answers: {},
    feedback: {},
    tries: 0,
    revealed: false,
  }),

  mount(el, ctx) {
    const { problem } = ctx;
    const attempt = ctx.attempt;
    const data = attempt.data;
    const done = attempt.status !== 'in-progress';
    let fields = null;
    let pending = false;

    function stepItem(step, index) {
      if (!data.missing.includes(index)) {
        return `<li class="proof-steps__item"><span class="proof-steps__num" aria-hidden="true">${index + 1}</span><p class="proof-steps__text">${mathText(stepText(step))}</p></li>`;
      }
      const body = done
        ? `${proofText(data.answers[index], { emptyText: '쓰지 않았습니다.' })}
           <p class="model-step"><span class="model-step__label">예시 단계</span> ${mathText(stepText(step))}</p>`
        : textArea({
            id: `missing-${index}`,
            field: `data.answers.${index}`,
            label: `${index + 1}번째 단계 (빠진 단계)`,
            value: data.answers[index] ?? '',
            rows: 3,
            required: true,
            symbols: true,
          });
      return `<li class="proof-steps__item is-missing">
        <span class="proof-steps__num" aria-hidden="true">${index + 1}</span>
        <div class="proof-steps__text">${body}${aiFeedback(data.feedback[index])}</div>
      </li>`;
    }

    function render() {
      fields?.dispose();
      el.innerHTML = `${done ? '' : '<p class="step-desc">증명 중간의 두 단계가 비어 있습니다. 앞뒤 단계의 흐름을 보고 빈 단계를 직접 쓴 뒤 AI에게 점검받으세요.</p>'}
        ${mockAiNote()}
        <ol class="proof-steps" aria-label="증명">${problem.steps.map(stepItem).join('')}</ol>
        ${done ? '' : `<div class="actions">
          <p class="save-status" data-save-status aria-live="polite"></p>
          ${triesNote(data.tries)}
          ${data.tries >= practiceSettings().revealAfterTries ? '<button type="button" class="button button--ghost" data-action="reveal">예시 단계 보기</button>' : ''}
          <button type="button" class="button button--primary" data-action="check">AI에게 점검받기</button>
        </div>`}`;
      if (!done) fields = bindFields(el, attempt, saveAttempt);
    }

    async function check(button) {
      if (pending) return;
      fields.flush();
      const ok = validateRequired(el, data.missing.map((index) => ({
        field: `data.answers.${index}`,
        message: '빈 단계를 써 주세요.',
      })));
      if (!ok) return;

      pending = true;
      setBusy(button, true, 'AI가 점검하고 있습니다…');
      for (const index of data.missing) {
        const previousSteps = problem.steps.slice(0, index).map((step, i) => (data.missing.includes(i) ? data.answers[i] : stepText(step)));
        const request = buildStepCheckRequest({ problem, levelId: 'fill-steps', stepIndex: index, studentStep: data.answers[index], previousSteps, tries: data.tries });
        ctx.logRequest(request);
        data.feedback[index] = await requestStepCheck(request);
      }
      data.tries += 1;
      pending = false;
      ctx.save();
      if (!el.isConnected) return;

      if (data.missing.every((index) => data.feedback[index].passed)) {
        ctx.finish({ passed: !data.revealed });
        return;
      }
      render();
      const firstFail = data.missing.find((index) => !data.feedback[index].passed);
      el.querySelector(`#missing-${firstFail}`)?.focus();
    }

    function reveal() {
      if (!window.confirm('예시 단계를 보면 이 명제는 이번에 통과로 인정되지 않습니다. 예시를 볼까요?')) return;
      fields?.flush();
      data.revealed = true;
      ctx.save();
      ctx.finish({ passed: false });
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
