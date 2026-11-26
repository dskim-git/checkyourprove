// 활동 6: AI 코치 (AI 검토 · 현재는 더미)
// 학생이 증명을 끝까지 쓰면 AI 코치가 보완할 점을 알려 주고, 학생이 고쳐 다시 보여 주기를 반복한다.

import { buildCoachRequest } from '../../../services/aiRequests.js';
import { requestCoachReview } from '../../../services/mockProofChecker.js';
import { saveAttempt } from '../../../state/attemptStore.js';
import { escapeHtml, formatDateTime, nowIso } from '../../../ui/dom.js';
import { icons } from '../../../ui/icons.js';
import { mockAiNote, proofText } from '../../../ui/components.js';
import { bindFields, handleSymbolInsert, textArea, validateRequired } from '../../../ui/forms.js';
import { feedbackDetails, setBusy } from './kit.js';

export default {
  createData: () => ({ draft: '', rounds: [] }),

  mount(el, ctx) {
    const { problem } = ctx;
    const attempt = ctx.attempt;
    const data = attempt.data;
    const finished = attempt.status !== 'in-progress';
    let fields = null;
    let pending = false;

    function reviewBox(round, number) {
      const { review } = round;
      const list = review.suggestions?.length
        ? `<ul class="suggestions">${review.suggestions.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ul>`
        : '';
      const strengths = review.strengths?.length ? feedbackDetails({ good: review.strengths }) : '';
      const items = (review.items ?? []).map((item) => `<li class="coach-item is-${item.verdict}">
          <p class="coach-item__head">${item.verdict === 'fail' ? icons.alert : icons.progress}<span>${item.stepNumber}번째 흐름: ${item.verdict === 'fail' ? '보완 필요' : '더 다듬으면 좋아요'}</span></p>
          ${feedbackDetails(item)}
        </li>`).join('');
      return `<div class="coach-review${review.complete ? ' is-complete' : ''}">
        <p class="coach-review__head">${review.complete ? icons.check : icons.info}<span>AI 코치 피드백 (${number}번째 검토)</span></p>
        <p>${escapeHtml(review.summary)}</p>
        ${strengths}
        ${items ? `<ol class="coach-items suggestions" aria-label="고칠 곳">${items}</ol>` : ''}
        ${list}
        <p class="meta">${escapeHtml(formatDateTime(round.at))}</p>
      </div>`;
    }

    function history() {
      const past = finished ? data.rounds : data.rounds.slice(0, -1);
      if (!past.length) return '';
      const items = past.map((round, index) => `<li class="history__item">
          ${reviewBox(round, index + 1)}
          <details class="disclosure"><summary>이때 보여 준 증명</summary>${proofText(round.proof)}</details>
        </li>`).join('');
      return `<details class="disclosure"${finished ? ' open' : ''}>
        <summary>${finished ? '검토 과정' : '지난 검토'} (${past.length})</summary>
        <ol class="history">${items}</ol>
      </details>`;
    }

    function render() {
      fields?.dispose();
      if (finished) {
        el.innerHTML = `<h2 class="section-title">완성한 증명</h2>
          ${proofText(data.rounds.at(-1)?.proof)}
          <p class="meta">AI 코치 검토 ${data.rounds.length}회</p>
          ${history()}`;
        return;
      }
      const latest = data.rounds.at(-1);
      el.innerHTML = `<p class="step-desc">먼저 증명을 끝까지 써 보세요. 완성했다고 생각하면 AI 코치에게 보여 주고, 피드백을 참고해 고치기를 반복합니다.</p>
        ${mockAiNote()}
        <div class="split">
          <div class="split__main">
            ${textArea({ id: 'coach-proof', field: 'data.draft', label: '나의 증명', value: data.draft, rows: 12, required: true, symbols: true })}
            <div class="actions">
              <p class="save-status" data-save-status aria-live="polite"></p>
              <button type="button" class="button button--primary" data-action="review">${data.rounds.length ? '고친 증명 다시 보여 주기' : 'AI 코치에게 보여 주기'}</button>
            </div>
          </div>
          <aside class="split__side" aria-labelledby="coach-heading">
            <h2 id="coach-heading" class="side-title" tabindex="-1">AI 코치</h2>
            <div aria-live="polite">${latest ? reviewBox(latest, data.rounds.length) : '<p class="empty-text">아직 검토를 받지 않았습니다.</p>'}</div>
            ${history()}
          </aside>
        </div>`;
      fields = bindFields(el, attempt, saveAttempt);
    }

    async function review(button) {
      if (pending) return;
      fields.flush();
      if (!validateRequired(el, [{ field: 'data.draft', min: 10, message: '증명을 10자 이상 써 주세요.' }])) return;

      pending = true;
      setBusy(button, true, 'AI 코치가 읽고 있습니다…');
      const request = buildCoachRequest({ problem, round: data.rounds.length + 1, studentProof: data.draft });
      ctx.logRequest(request);
      const result = await requestCoachReview(request);
      pending = false;
      data.rounds.push({ proof: data.draft, review: result, at: nowIso(), requestId: request.requestId });
      ctx.save();
      if (!el.isConnected) return;

      if (result.complete) {
        ctx.finish({ passed: true });
        return;
      }
      render();
      el.querySelector('#coach-heading')?.focus();
    }

    const onClick = (event) => {
      if (handleSymbolInsert(event, el)) return;
      const button = event.target.closest('[data-action="review"]');
      if (button) review(button);
    };

    render();
    el.addEventListener('click', onClick);
    return () => fields?.dispose();
  },
};
