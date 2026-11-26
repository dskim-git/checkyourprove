// 활동 1·2: 빈칸 고르기(객관식) / 빈칸 채우기(직접 쓰기) — AI 없이 자동 채점
// 두 활동은 화면 구조가 같고, 빈칸이 보기 고르기(select)인지 직접 쓰기(input)인지만 다르다.

import { REVEAL_AFTER_TRIES } from '../../../data/levels.js';
import { blanksOf, parseStep } from '../../../data/proofModel.js';
import { isSameAnswer, isSameShape } from '../../../services/textMatch.js';
import { escapeHtml } from '../../../ui/dom.js';
import { icons } from '../../../ui/icons.js';
import { triesNote } from './kit.js';
import { choicesForProblem } from './blankChoices.js';

export function blankActivity({ choices = false } = {}) {
  return {
    createData: (problem) => ({
      ...(choices ? { options: choicesForProblem(problem) } : {}),
      answers: {},
      results: null,
      tries: 0,
      revealed: false,
    }),

    mount(el, ctx) {
      const { problem } = ctx;
      const attempt = ctx.attempt;
      const data = attempt.data;
      const blanks = blanksOf(problem);
      const done = attempt.status !== 'in-progress';
      let message = '';
      let tips = [];
      let timer = null;

      function blankInput(blank, number) {
        const result = data.results?.[blank.id];
        const state = result === true ? 'correct' : result === false ? 'wrong' : '';
        const size = Math.max(4, Math.min(24, blank.answers[0].length + 2));
        const mark = state === 'correct'
          ? `<span class="blank__mark is-correct">${icons.check}<span>맞음</span></span>`
          : state === 'wrong'
            ? `<span class="blank__mark is-wrong">${icons.x}<span>다시</span></span>`
            : '';
        const srState = state === 'correct' ? ' (맞음)' : state === 'wrong' ? ' (틀림)' : '';
        if (choices) {
          const value = data.answers[blank.id] ?? '';
          const options = (data.options?.[blank.id] ?? blank.answers.slice(0, 1))
            .map((option) => `<option value="${escapeHtml(option)}"${option === value ? ' selected' : ''}>${escapeHtml(option)}</option>`)
            .join('');
          return `<span class="blank blank--choice${state ? ` is-${state}` : ''}"><select class="blank__select" id="blank-${blank.id}" data-blank="${blank.id}" aria-label="빈칸 ${number}${srState}"${done ? ' disabled' : ''}><option value=""${value ? '' : ' selected'}>고르기</option>${options}</select>${mark}</span>`;
        }
        return `<span class="blank${state ? ` is-${state}` : ''}"><input type="text" class="blank__input" id="blank-${blank.id}" data-blank="${blank.id}" value="${escapeHtml(data.answers[blank.id] ?? '')}" size="${size}" aria-label="빈칸 ${number}${srState}" autocomplete="off" autocapitalize="off" spellcheck="false"${done ? ' readonly' : ''}>${mark}</span>`;
      }

      function render() {
        let counter = 0;
        const steps = problem.steps.map((step, index) => {
          const html = parseStep(step.text)
            .map((segment) => {
              if (segment.type === 'text') return escapeHtml(segment.value);
              const blank = blanks[counter];
              counter += 1;
              return blankInput(blank, counter);
            })
            .join('');
          return `<li class="proof-steps__item"><span class="proof-steps__num" aria-hidden="true">${index + 1}</span><p class="proof-steps__text">${html}</p></li>`;
        }).join('');

        const desc = choices
          ? `빈칸 ${blanks.length}개마다 알맞은 식이나 말을 보기에서 고르고 "정답 확인"을 누르세요. 틀린 칸만 다시 골라 확인할 수 있습니다.`
          : `빈칸 ${blanks.length}개에 들어갈 식이나 말을 쓰고 "정답 확인"을 누르세요. 틀린 칸만 고쳐 다시 확인할 수 있습니다. 기호는 ², ≥처럼 입력해도 되고 ^2, &gt;=처럼 써도 됩니다.`;
        el.innerHTML = `${done ? '' : `<p class="step-desc">${desc}</p>`}
          <ol class="proof-steps" aria-label="증명">${steps}</ol>
          <div class="feedback" data-feedback aria-live="polite">${message ? `<p>${escapeHtml(message)}</p>` : ''}${tips.length ? `<ul class="feedback__tips">${tips.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ul>` : ''}</div>
          ${done ? '' : `<div class="actions">
            ${triesNote(data.tries)}
            ${data.tries >= REVEAL_AFTER_TRIES ? '<button type="button" class="button button--ghost" data-action="reveal">정답 보기</button>' : ''}
            <button type="button" class="button button--primary" data-action="check">정답 확인</button>
          </div>`}`;
      }

      function check() {
        clearTimeout(timer);
        data.results = Object.fromEntries(blanks.map((b) => [b.id, isSameAnswer(data.answers[b.id] ?? '', b.answers)]));
        data.tries += 1;
        const correct = Object.values(data.results).filter(Boolean).length;
        if (correct === blanks.length) {
          ctx.save();
          ctx.finish({ passed: !data.revealed });
          return;
        }
        message = `빈칸 ${blanks.length}개 중 ${correct}개를 맞혔습니다. "다시" 표시가 있는 칸을 아래 안내를 참고해 고쳐 보세요.`;
        tips = blanks.flatMap((b, i) => {
          if (data.results[b.id]) return [];
          const value = (data.answers[b.id] ?? '').trim();
          const where = `빈칸 ${i + 1} (${b.stepIndex + 1}번째 줄)`;
          if (!value) return [`${where}: 아직 비어 있어요.`];
          if (isSameShape(value, b.answers)) return [`${where}: 식의 모양은 맞아요. 이 증명에서 앞서 정한 문자를 그대로 썼는지 확인하세요.`];
          return [`${where}: ${problem.steps[b.stepIndex].hint}`];
        });
        ctx.save();
        render();
        el.querySelector('.blank.is-wrong input')?.focus();
      }

      function reveal() {
        if (!window.confirm('정답을 보면 이 명제는 이번에 통과로 인정되지 않습니다. 정답을 볼까요?')) return;
        data.revealed = true;
        blanks.forEach((b) => {
          data.answers[b.id] = b.answers[0];
        });
        data.results = Object.fromEntries(blanks.map((b) => [b.id, true]));
        ctx.save();
        ctx.finish({ passed: false });
      }

      const onInput = (event) => {
        const input = event.target.closest('[data-blank]');
        if (!input) return;
        data.answers[input.dataset.blank] = input.value;
        if (data.results) delete data.results[input.dataset.blank];
        const wrapper = input.closest('.blank');
        wrapper.className = choices ? 'blank blank--choice' : 'blank';
        wrapper.querySelector('.blank__mark')?.remove();
        clearTimeout(timer);
        timer = setTimeout(ctx.save, 400);
      };
      const onClick = (event) => {
        const action = event.target.closest('[data-action]')?.dataset.action;
        if (action === 'check') check();
        if (action === 'reveal') reveal();
      };
      const onKeydown = (event) => {
        if (event.key === 'Enter' && event.target.matches('[data-blank]') && !done) {
          event.preventDefault();
          check();
        }
      };

      render();
      el.addEventListener('input', onInput);
      el.addEventListener('change', onInput);
      el.addEventListener('click', onClick);
      el.addEventListener('keydown', onKeydown);
      return () => {
        if (timer) {
          clearTimeout(timer);
          ctx.save();
        }
      };
    },
  };
}

export default blankActivity();
