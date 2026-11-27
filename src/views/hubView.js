// 학생 홈: 오늘의 기록(연속 학습일·통과·인증) → 이어서 하기 → 증명 연습하기 / AI와 탐구하기 / 내 기록 보기

import { currentUser, displayName } from '../state/accountStore.js';
import { METHODS, getMethod } from '../data/methods.js';
import { LEVELS, getLevel } from '../data/levels.js';
import { getProblem } from '../data/problems/index.js';
import { getClassroom } from '../state/classroomStore.js';
import { listAttempts } from '../state/attemptStore.js';
import { certifiedLevelCount } from '../state/practiceProgress.js';
import { continueAttempt, passedCount, streak } from '../state/motivation.js';
import { escapeHtml } from '../ui/dom.js';
import { researchSummary } from './research/researchHomeView.js';
import { icons } from '../ui/icons.js';

function statStrip() {
  const { days, today } = streak();
  const certified = METHODS.reduce((sum, method) => sum + certifiedLevelCount(method.id), 0);
  const totalLevels = METHODS.length * LEVELS.length;
  const streakNote = days === 0 ? '오늘 시작해 보세요' : today ? '오늘도 했어요' : '오늘 하면 이어져요';
  return `<ul class="stat-strip" aria-label="나의 학습 현황">
    <li class="stat stat--streak${days > 0 ? ' is-on' : ''}">
      <span class="stat__icon">${icons.flame}</span>
      <span class="stat__value num">${days}<span class="stat__unit">일</span></span>
      <span class="stat__label">연속 학습<span class="visually-hidden">, </span><span class="stat__note">${streakNote}</span></span>
    </li>
    <li class="stat">
      <span class="stat__icon">${icons.check}</span>
      <span class="stat__value num">${passedCount()}<span class="stat__unit">개</span></span>
      <span class="stat__label">통과한 활동</span>
    </li>
    <li class="stat">
      <span class="stat__icon">${icons.award}</span>
      <span class="stat__value num">${certified}<span class="stat__unit">/${totalLevels}</span></span>
      <span class="stat__label">인증 배지</span>
    </li>
  </ul>`;
}

function continueCard() {
  const attempt = continueAttempt();
  const problem = attempt && getProblem(attempt.problemId);
  const level = attempt && getLevel(attempt.levelId);
  if (!problem || !level) return '';
  const method = getMethod(attempt.method);
  return `<a class="continue-card" href="#/practice/${attempt.method}/${attempt.levelId}/${attempt.problemId}">
    <span class="continue-card__play">${icons.play}</span>
    <span class="continue-card__body">
      <span class="continue-card__label">이어서 하기</span>
      <span class="continue-card__title">${escapeHtml(problem.title)}</span>
      <span class="continue-card__meta">${escapeHtml(method.label)}, ${LEVELS.indexOf(level) + 1}단계 ${escapeHtml(level.title)}</span>
    </span>
  </a>`;
}

export function renderHub(root) {
  const me = currentUser();
  const classroom = getClassroom();
  const attempts = listAttempts().length;
  const researchTile = classroom.researchOpen
    ? `<a class="tile tile--research" href="#/research">
        <span class="tile__icon tile__glyph" aria-hidden="true">?</span>
        <span class="tile__text">
          <span class="tile__title">AI와 탐구하기</span>
          <span class="tile__desc">내가 먼저 증명하고, AI의 증명을 얻어 비교한 뒤 최종 증명을 완성합니다.</span>
          <span class="tile__meta">${escapeHtml(researchSummary(classroom))}</span>
        </span>
        <span class="tile__go">${icons.chevronRight}</span>
      </a>`
    : `<div class="tile tile--research is-disabled" aria-disabled="true">
        <span class="tile__icon">${icons.lock}</span>
        <span class="tile__text">
          <span class="tile__title">AI와 탐구하기</span>
          <span class="tile__desc">선생님이 아직 이 활동을 열지 않았습니다.</span>
          <span class="tile__meta">잠김</span>
        </span>
      </div>`;

  root.innerHTML = `<div class="page page--hub">
    <header class="hub-head">
      <h1>${escapeHtml(me ? displayName(me) : classroom.studentName)}님, 무엇을 해 볼까요?</h1>
      <p class="meta">${me ? `${escapeHtml(classroom.sessionLabel)}. 설정은 오른쪽 위 톱니바퀴에서 바꿀 수 있어요.` : `${escapeHtml(classroom.name)}. 로그인하지 않아 예시 학생으로 보고 있습니다. 오른쪽 위 "로그인"에서 시연용 역할로 들어갈 수 있어요.`}</p>
    </header>
    ${statStrip()}
    ${continueCard()}
    <ul class="tile-list" aria-label="활동 선택">
      <li>
        <a class="tile tile--practice" href="#/practice">
          <span class="tile__icon tile__glyph" aria-hidden="true">∴</span>
          <span class="tile__text">
            <span class="tile__title">증명 연습하기</span>
            <span class="tile__desc">증명법을 고르고, 쉬운 활동부터 한 단계씩 인증하며 연습합니다.</span>
          </span>
          <span class="tile__go">${icons.chevronRight}</span>
        </a>
      </li>
      <li>${researchTile}</li>
      <li>
        <a class="tile tile--records" href="#/records">
          <span class="tile__icon tile__glyph" aria-hidden="true">✓</span>
          <span class="tile__text">
            <span class="tile__title">내 기록 보기</span>
            <span class="tile__desc">증명법별 인증 현황과 지금까지 푼 활동의 결과를 봅니다.</span>
            <span class="tile__meta">활동 기록 ${attempts}개</span>
          </span>
          <span class="tile__go">${icons.chevronRight}</span>
        </a>
      </li>
    </ul>
  </div>`;
  return null;
}
