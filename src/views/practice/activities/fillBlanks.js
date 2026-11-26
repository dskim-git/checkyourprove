// 활동 1·2: 빈칸 고르기(객관식) / 빈칸 채우기(직접 쓰기) — AI 없이 자동 채점
// 두 활동은 화면 구조가 같다.
// - 고르기: 빈칸(칸 버튼)을 누르면 그 단계 아래에 보기 칩이 열리고, 고르면 칸에 내용이 그대로 들어간다.
// - 채우기: 빈칸에 직접 쓴다.

import { REVEAL_AFTER_TRIES } from '../../../data/levels.js';
import { blanksOf, parseStep } from '../../../data/proofModel.js';
import { isSameAnswer, isSameShape } from '../../../services/textMatch.js';
import { escapeHtml } from '../../../ui/dom.js';
import { icons } from '../../../ui/icons.js';
import { mathText, phraseHtml } from '../../../ui/mathText.js';
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
      const numberOf = Object.fromEntries(blanks.map((b, i) => [b.id, i + 1]));
      const done = attempt.status !== 'in-progress';
      let message = '';
      let tips = [];
      let timer = null;
      // 고르기: 보기 칩이 열려 있는 빈칸 (처음에는 아직 고르지 않은 첫 빈칸)
      let active = !done && choices ? (blanks.find((b) => !data.answers[b.id])?.id ?? null) : null;

      const optionsOf = (blank) => data.options?.[blank.id] ?? blank.answers.slice(0, 1);

      function markOf(state) {
        if (state === 'correct') return `<span class="blank__mark is-correct">${icons.check}<span>맞음</span></span>`;
        if (state === 'wrong') return `<span class="blank__mark is-wrong">${icons.x}<span>다시</span></span>`;
        return '';
      }

      function blankHtml(blank) {
        const number = numberOf[blank.id];
        const result = data.results?.[blank.id];
        const state = result === true ? 'correct' : result === false ? 'wrong' : '';
        const srState = state === 'correct' ? ' (맞음)' : state === 'wrong' ? ' (틀림)' : '';
        if (choices) {
          const value = data.answers[blank.id] ?? '';
          const isActive = active === blank.id;
          const label = `빈칸 ${number}${value ? `: ${value}` : ', 아직 고르지 않음'}${srState}`;
          return `<span class="blank blank--choice${state ? ` is-${state}` : ''}"><button type="button" class="slot${value ? ' is-filled' : ''}${isActive ? ' is-active' : ''}" id="blank-${blank.id}" data-slot="${blank.id}" aria-expanded="${isActive}" aria-controls="tray-${blank.id}" aria-label="${escapeHtml(label)}"${done ? ' disabled' : ''}>${value ? mathText(value) : `<span class="slot__empty">빈칸 ${number}</span>`}</button>${markOf(state)}</span>`;
        }
        const size = Math.max(4, Math.min(24, blank.answers[0].length + 2));
        return `<span class="blank${state ? ` is-${state}` : ''}"><input type="text" class="blank__input" id="blank-${blank.id}" data-blank="${blank.id}" value="${escapeHtml(data.answers[blank.id] ?? '')}" size="${size}" aria-label="빈칸 ${number}${srState}" autocomplete="off" autocapitalize="off" spellcheck="false"${done ? ' readonly' : ''}>${markOf(state)}</span>`;
      }

      function trayHtml(blank) {
        const number = numberOf[blank.id];
        const value = data.answers[blank.id] ?? '';
        const chips = optionsOf(blank)
          .map((option) => `<button type="button" class="chip${option === value ? ' is-chosen' : ''}" data-choose="${blank.id}" data-value="${escapeHtml(option)}" aria-pressed="${option === value}">${mathText(option)}</button>`)
          .join('');
        return `<div class="choice-tray" id="tray-${blank.id}" role="group" aria-labelledby="tray-${blank.id}-label">
          <p class="choice-tray__label" id="tray-${blank.id}-label">빈칸 ${number}에 들어갈 것을 고르세요</p>
          <div class="choice-tray__options">${chips}</div>
        </div>`;
      }

      function render() {
        let cursor = 0;
        const steps = problem.steps.map((step, index) => {
          const stepBlanks = [];
          const html = phraseHtml(parseStep(step.text), () => {
            const blank = blanks[cursor];
            cursor += 1;
            stepBlanks.push(blank);
            return blankHtml(blank);
          });
          const tray = choices && active && stepBlanks.some((b) => b.id === active)
            ? trayHtml(blanks.find((b) => b.id === active))
            : '';
          return `<li class="proof-steps__item${tray ? ' has-tray' : ''}"><span class="proof-steps__num" aria-hidden="true">${index + 1}</span><div class="proof-steps__body"><p class="proof-steps__text">${html}</p>${tray}</div></li>`;
        }).join('');

        const desc = choices
          ? `빈칸 ${blanks.length}개를 차례로 채우세요. 빈칸을 누르면 아래에 보기가 열립니다. 다 채우면 "정답 확인"을 누르세요.`
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
          if (!choices && isSameShape(value, b.answers)) return [`${where}: 식의 모양은 맞아요. 이 증명에서 앞서 정한 문자를 그대로 썼는지 확인하세요.`];
          return [`${where}: ${problem.steps[b.stepIndex].hint}`];
        });
        active = choices ? (blanks.find((b) => !data.results[b.id])?.id ?? null) : null;
        ctx.save();
        render();
        el.querySelector('.blank.is-wrong input, .blank.is-wrong .slot')?.focus();
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

      /** 보기 칩을 고른다: 칸을 채우고 다음 빈 칸의 보기를 연다. */
      function choose(blankId, value) {
        data.answers[blankId] = value;
        if (data.results) delete data.results[blankId];
        const order = blanks.map((b) => b.id);
        const from = order.indexOf(blankId);
        const rest = [...order.slice(from + 1), ...order.slice(0, from)];
        active = rest.find((id) => !data.answers[id]) ?? null;
        ctx.save();
        render();
        const next = active ? el.querySelector(`#tray-${active} .chip`) : el.querySelector('[data-action="check"]');
        next?.focus({ preventScroll: false });
      }

      const onInput = (event) => {
        const input = event.target.closest('input[data-blank]');
        if (!input) return;
        data.answers[input.dataset.blank] = input.value;
        if (data.results) delete data.results[input.dataset.blank];
        const wrapper = input.closest('.blank');
        wrapper.className = 'blank';
        wrapper.querySelector('.blank__mark')?.remove();
        clearTimeout(timer);
        timer = setTimeout(ctx.save, 400);
      };
      const onClick = (event) => {
        const chip = event.target.closest('[data-choose]');
        if (chip) {
          choose(chip.dataset.choose, chip.dataset.value);
          return;
        }
        const slot = event.target.closest('[data-slot]');
        if (slot) {
          active = active === slot.dataset.slot ? null : slot.dataset.slot;
          render();
          el.querySelector(active ? `#tray-${active} .chip` : `#blank-${slot.dataset.slot}`)?.focus();
          return;
        }
        const action = event.target.closest('[data-action]')?.dataset.action;
        if (action === 'check') check();
        if (action === 'reveal') reveal();
      };
      const onKeydown = (event) => {
        if (event.key === 'Enter' && event.target.matches('input[data-blank]') && !done) {
          event.preventDefault();
          check();
        }
        if (event.key === 'Escape' && active) {
          const closed = active;
          active = null;
          render();
          el.querySelector(`#blank-${closed}`)?.focus();
        }
      };

      render();
      el.addEventListener('input', onInput);
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
