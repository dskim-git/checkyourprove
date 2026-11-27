// 활동 7: 나 혼자 증명하기 (AI 채점 · 현재는 더미)
// 힌트 없이 증명을 써서 제출하면 점수로 알려 준다. 스스로 보는 시험이다.

import { practiceSettings } from '../../../state/practiceSettings.js';

const passScore = () => practiceSettings().soloPassScore;
import { stepText } from '../../../data/proofModel.js';
import { buildGradeRequest } from '../../../services/aiRequests.js';
import { requestGrade } from '../../../services/mockProofChecker.js';
import { saveAttempt } from '../../../state/attemptStore.js';
import { escapeHtml, nowIso } from '../../../ui/dom.js';
import { mathText } from '../../../ui/mathText.js';
import { icons } from '../../../ui/icons.js';
import { mockAiNote, notice, proofText } from '../../../ui/components.js';
import { bindFields, handleSymbolInsert, textArea, validateRequired } from '../../../ui/forms.js';
import { feedbackDetails, setBusy } from './kit.js';

const VERDICT = {
  pass: { icon: icons.check, text: '충분' },
  partial: { icon: icons.progress, text: '부분' },
  fail: { icon: icons.x, text: '부족' },
};

export default {
  createData: () => ({ draft: '', result: null, submittedAt: null }),

  mount(el, ctx) {
    const { problem } = ctx;
    const attempt = ctx.attempt;
    const data = attempt.data;
    const finished = attempt.status !== 'in-progress';
    let fields = null;
    let pending = false;

    function resultView() {
      const { score, breakdown, comment } = data.result;
      const passed = score >= passScore();
      const rows = breakdown.map((item) => {
        const v = VERDICT[item.verdict];
        return `<tr>
          <th scope="row">${item.stepIndex + 1}</th>
          <td class="wrap">${mathText(stepText(problem.steps[item.stepIndex]))}</td>
          <td><span class="verdict is-${item.verdict}">${v.icon}<span>${v.text}</span></span></td>
          <td class="wrap">${item.verdict === 'pass' ? '—' : feedbackDetails({ where: item.where, fixes: item.fixes ?? [], how: item.how ?? problem.steps[item.stepIndex].hint })}</td>
        </tr>`;
      }).join('');
      return `<div class="score-card${passed ? ' is-passed' : ''}">
          <p class="score-card__score"><strong>${score}</strong><span> / 100점</span></p>
          <p class="score-card__meta">통과 기준 ${passScore()}점, ${passed ? '통과' : '미통과'}</p>
          <p>${escapeHtml(comment)}</p>
        </div>
        <section aria-labelledby="my-proof-heading" class="stack-section">
          <h2 id="my-proof-heading" class="section-title">제출한 증명</h2>
          ${proofText(data.draft)}
        </section>
        <section aria-labelledby="rubric-heading" class="stack-section">
          <h2 id="rubric-heading" class="section-title">채점 결과</h2>
          <p class="meta">예시 증명의 각 단계가 내 증명에 얼마나 드러났는지 평가했습니다. 표현이 달라도 같은 내용이면 인정합니다(충분 1점, 부분 0.75점).</p>
          <div class="table-wrap" role="region" aria-labelledby="rubric-heading" tabindex="0">
            <table class="data-table">
              <thead><tr><th scope="col">단계</th><th scope="col">예시 증명의 단계</th><th scope="col">평가</th><th scope="col">고칠 점</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </section>`;
    }

    function render() {
      fields?.dispose();
      if (finished && data.result) {
        el.innerHTML = `${mockAiNote()}${resultView()}`;
        return;
      }
      el.innerHTML = `${notice('info', '스스로 보는 시험입니다', `힌트 없이 증명을 끝까지 쓰고 제출하세요. 제출하면 고칠 수 없고, AI가 채점해 점수로 알려 줍니다. ${passScore()}점 이상이면 통과입니다.`)}
        ${mockAiNote()}
        ${textArea({ id: 'solo-proof', field: 'data.draft', label: '나의 증명', value: data.draft, rows: 14, required: true, symbols: true })}
        <div class="actions">
          <p class="save-status" data-save-status aria-live="polite"></p>
          <button type="button" class="button button--primary" data-action="submit">제출하고 채점받기</button>
        </div>`;
      fields = bindFields(el, attempt, saveAttempt);
    }

    async function submit(button) {
      if (pending) return;
      fields.flush();
      if (!validateRequired(el, [{ field: 'data.draft', min: 10, message: '증명을 10자 이상 써 주세요.' }])) return;
      if (!window.confirm('제출하면 증명을 고칠 수 없습니다. 제출할까요?')) return;

      pending = true;
      setBusy(button, true, 'AI가 채점하고 있습니다…');
      el.querySelector('#solo-proof').readOnly = true;
      const request = buildGradeRequest({ problem, studentProof: data.draft });
      ctx.logRequest(request);
      data.result = await requestGrade(request);
      data.submittedAt = nowIso();
      pending = false;
      ctx.save();
      ctx.finish({ passed: data.result.score >= passScore(), score: data.result.score });
    }

    const onClick = (event) => {
      if (handleSymbolInsert(event, el)) return;
      const button = event.target.closest('[data-action="submit"]');
      if (button) submit(button);
    };

    render();
    el.addEventListener('click', onClick);
    return () => fields?.dispose();
  },
};
