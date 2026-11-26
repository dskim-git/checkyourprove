// 증명 연습 4: 활동 화면의 공통 틀
// 머리말·명제·결과 안내·다음 행동은 여기서 그리고, 활동 내용은 activities/의 각 모듈이 그린다.

import { getMethod } from '../../data/methods.js';
import { LEVELS, getLevel, levelIndex } from '../../data/levels.js';
import { getProblem, problemsByMethod } from '../../data/problems/index.js';
import { getOrCreateAttempt, saveAttempt, finishAttempt, restartAttempt, findAttempt } from '../../state/attemptStore.js';
import { isCertified, isUnlocked } from '../../state/practiceProgress.js';
import { escapeHtml } from '../../ui/dom.js';
import { icons } from '../../ui/icons.js';
import { breadcrumb, notice, propositionBlock, renderNotFound } from '../../ui/components.js';
import { practiceHref } from './practiceParts.js';
import { ACTIVITIES } from './activities/index.js';

/** 받침 유무에 따라 주격 조사 이/가 */
function subjectParticle(word) {
  const code = word.trim().charCodeAt(word.trim().length - 1) - 0xac00;
  if (code < 0 || code > 11171) return '이(가)';
  return code % 28 ? '이' : '가';
}

export function renderActivity(root, [methodId, levelId, problemId]) {
  const method = getMethod(methodId);
  const level = getLevel(levelId);
  const problem = getProblem(problemId);
  if (!method || !level || !problem || problem.method !== method.id) {
    renderNotFound(root);
    return null;
  }
  const index = levelIndex(level.id);
  const listHref = practiceHref(method.id, level.id);
  const crumbs = [
    { label: '홈', href: '#/' },
    { label: '증명 연습하기', href: '#/practice' },
    { label: method.label, href: practiceHref(method.id) },
    { label: level.title, href: listHref },
    { label: problem.title },
  ];

  if (!isUnlocked(method.id, index)) {
    root.innerHTML = `<div class="page">
      ${breadcrumb(crumbs)}
      <h1>${escapeHtml(level.title)}</h1>
      ${notice('lock', '아직 열리지 않은 단계입니다', '이전 단계를 먼저 인증하세요.')}
      <p><a class="button button--secondary" href="${practiceHref(method.id)}">활동 단계 목록으로</a></p>
    </div>`;
    return null;
  }

  const activity = ACTIVITIES[level.id];
  let attempt = getOrCreateAttempt(level.id, problem, () => activity.createData(problem));
  let cleanupActivity = null;
  let justCertified = false;
  let confetti = null;

  /** 통과 축하: 종이 꽃가루가 화면 위에서 흩날린다(장식, 화면 읽기 프로그램에는 숨김). 동작 줄이기 설정이면 생략한다. */
  function celebrate() {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    confetti?.remove();
    const pieces = Array.from({ length: 42 }, (_, i) => {
      const x = (i * 23.7) % 100;
      const drift = Math.round((Math.random() - 0.5) * 160);
      const spin = Math.round(360 + Math.random() * 540) * (i % 2 ? 1 : -1);
      const delay = Math.round(Math.random() * 380);
      const duration = Math.round(1500 + Math.random() * 900);
      return `<i class="confetti__piece is-${(i % 4) + 1}${i % 3 === 0 ? ' is-round' : ''}" style="--x: ${x.toFixed(1)}%; --drift: ${drift}px; --spin: ${spin}deg; --delay: ${delay}ms; --dur: ${duration}ms"></i>`;
    }).join('');
    confetti = document.createElement('div');
    confetti.className = 'confetti';
    confetti.setAttribute('aria-hidden', 'true');
    confetti.innerHTML = pieces;
    document.body.append(confetti);
    const layer = confetti;
    window.setTimeout(() => layer.remove(), 3200);
  }

  const ctx = {
    problem,
    get attempt() {
      return attempt;
    },
    save: () => saveAttempt(attempt),
    logRequest(request) {
      attempt.requestLog.push(request);
      saveAttempt(attempt);
    },
    finish({ passed, score = null }) {
      const before = isCertified(method.id, level.id);
      finishAttempt(attempt, { passed, score });
      justCertified = !before && isCertified(method.id, level.id);
      draw({ focusResult: true, celebrateNow: passed });
    },
  };

  function resultBanner() {
    if (attempt.status === 'in-progress') return '';
    const scoreText = attempt.score != null ? ` (${attempt.score}점)` : '';
    const nextLevel = LEVELS[index + 1];
    const certText = justCertified
      ? ` "${level.title}" 단계를 인증했습니다.${nextLevel ? ` 다음 단계 "${nextLevel.title}"${subjectParticle(nextLevel.title)} 열렸습니다.` : ' 이 증명법의 모든 단계를 인증했습니다.'}`
      : '';
    const passed = attempt.status === 'passed';
    const banner = `<p class="result-box__body">${escapeHtml(passed
      ? certText.trim() || '잘했어요! 내 풀이는 아래에서 열어 볼 수 있습니다.'
      : failReason())}</p>`;
    const medal = passed && justCertified
      ? `<div class="medal" role="img" aria-label="인증 배지: ${escapeHtml(level.title)}">
          <span class="medal__disc">${icons.award}</span>
          <span class="medal__text"><span class="medal__title">인증 배지 획득</span><span>${escapeHtml(method.label)}, ${index + 1}단계 ${escapeHtml(level.title)}</span></span>
        </div>`
      : '';

    const next = nextProblem();
    const nextLevelLink = justCertified && nextLevel
      ? `<a class="button button--primary" href="${practiceHref(method.id, nextLevel.id)}">다음 단계로: ${escapeHtml(nextLevel.title)}</a>`
      : '';
    return `<section class="result-box ${passed ? 'is-passed' : 'is-ended'}" aria-labelledby="result-heading">
      <div class="result-box__head">
        <span class="result-box__stamp" aria-hidden="true">${passed ? icons.check : icons.alert}</span>
        <h2 id="result-heading" class="result-box__title" tabindex="-1">${passed ? `통과했습니다${scoreText}` : `이번에는 통과하지 못했습니다${scoreText}`}</h2>
      </div>
      ${banner}
      ${medal}
      <div class="result-actions">
        ${nextLevelLink}
        ${next ? `<a class="button ${nextLevelLink ? 'button--secondary' : 'button--primary'}" href="${practiceHref(method.id, level.id, next.id)}">다음 명제: ${escapeHtml(next.title)}</a>` : ''}
        <button type="button" class="button button--secondary" data-shell-action="restart">이 명제 다시 풀기</button>
        <a class="button button--ghost" href="${listHref}">명제 목록으로</a>
      </div>
    </section>`;
  }

  function failReason() {
    if (attempt.data.revealed) return '정답이나 예시를 보고 완성했기 때문에 이번에는 통과로 인정되지 않습니다. 다시 풀어 보거나 다른 명제에 도전해 보세요.';
    if (level.id === 'solo') return '기준 점수에 이르지 못했습니다. 채점 결과를 살펴보고 앞 단계 활동으로 복습한 뒤 다시 도전해 보세요.';
    return '다시 풀어 보거나 다른 명제에 도전해 보세요.';
  }

  function nextProblem() {
    const list = problemsByMethod(method.id);
    const start = list.findIndex((p) => p.id === problem.id);
    const ordered = [...list.slice(start + 1), ...list.slice(0, start)];
    return ordered.find((p) => !findAttempt(level.id, p.id)?.passedAt) ?? null;
  }

  /** 같은 명제를 다른 활동 단계로 바로 열기 (열린 단계만 링크) */
  function levelSwitcher() {
    const links = LEVELS.map((item, i) => {
      const label = `<span class="level-switch__num num">${i + 1}</span><span class="level-switch__name" aria-hidden="true">${escapeHtml(item.short)}</span><span class="visually-hidden">${escapeHtml(item.title)}</span>`;
      if (item.id === level.id) return `<li><span class="level-switch__item is-current" aria-current="page">${label}</span></li>`;
      if (!isUnlocked(method.id, i)) return '';
      return `<li><a class="level-switch__item" href="${practiceHref(method.id, item.id, problem.id)}">${label}</a></li>`;
    }).join('');
    return `<nav class="level-switch" aria-label="같은 명제로 다른 활동 단계 하기"><ul>${links}</ul></nav>`;
  }

  function draw({ focusResult = false, celebrateNow = false } = {}) {
    cleanupActivity?.();
    const finished = attempt.status !== 'in-progress';
    const work = `${propositionBlock(problem)}
      <section class="step-panel" data-activity aria-label="${escapeHtml(level.title)} 활동"></section>`;
    root.innerHTML = `<div class="page page--solve">
      <div class="lesson-top">
        ${breadcrumb(crumbs)}
        ${levelSwitcher()}
      </div>
      <header class="solve-header">
        <h1 class="solve-title">${escapeHtml(problem.title)}</h1>
        <details class="solve-rule">
          <summary>${index + 1}단계 ${escapeHtml(level.title)}: 통과 기준</summary>
          <p>${escapeHtml(level.passRule)}</p>
        </details>
      </header>
      ${resultBanner()}
      ${finished
        ? `<details class="review-fold"${attempt.status === 'passed' ? '' : ' open'}>
            <summary>문제와 내 풀이 보기</summary>
            <div class="review-fold__body">${work}</div>
          </details>`
        : work}
    </div>`;
    cleanupActivity = activity.mount(root.querySelector('[data-activity]'), ctx) ?? null;
    const current = root.querySelector('.level-switch .is-current');
    if (current) current.parentElement.parentElement.scrollLeft = current.offsetLeft - 16;
    if (focusResult) {
      window.scrollTo(0, 0);
      root.querySelector('#result-heading')?.focus({ preventScroll: true });
    }
    if (celebrateNow) celebrate();
  }

  const onShellClick = (event) => {
    if (event.target.closest('[data-shell-action="restart"]')) {
      attempt = restartAttempt(attempt, problem, () => activity.createData(problem));
      justCertified = false;
      draw();
      root.querySelector('[data-activity] input, [data-activity] textarea, [data-activity] button')?.focus();
    }
  };

  draw();
  root.addEventListener('click', onShellClick);
  return () => {
    confetti?.remove();
    cleanupActivity?.();
    root.removeEventListener('click', onShellClick);
  };
}
