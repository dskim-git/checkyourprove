// 학생 홈: 증명 연습하기 / AI와 탐구하기 / 내 기록 보기

import { METHODS } from '../data/methods.js';
import { LEVELS } from '../data/levels.js';
import { getProblem } from '../data/problems/index.js';
import { getClassroom } from '../state/classroomStore.js';
import { listAttempts } from '../state/attemptStore.js';
import { certifiedLevelCount } from '../state/practiceProgress.js';
import { escapeHtml } from '../ui/dom.js';
import { icons } from '../ui/icons.js';

export function renderHub(root) {
  const classroom = getClassroom();
  const certified = METHODS.reduce((sum, method) => sum + certifiedLevelCount(method.id), 0);
  const totalLevels = METHODS.length * LEVELS.length;
  const attempts = listAttempts().length;
  const researchProblem = getProblem(classroom.researchProblemId);

  const researchTile = classroom.researchOpen && researchProblem
    ? `<a class="tile" href="#/research/${researchProblem.id}">
        <span class="tile__icon">${icons.chat}</span>
        <span class="tile__title">AI와 탐구하기</span>
        <span class="tile__desc">선생님이 정한 명제를 내가 먼저 증명한 뒤, AI와 탐구하고 두 증명을 비교합니다.</span>
        <span class="tile__meta">오늘의 명제 · ${escapeHtml(researchProblem.title)}</span>
      </a>`
    : `<div class="tile is-disabled" aria-disabled="true">
        <span class="tile__icon">${icons.lock}</span>
        <span class="tile__title">AI와 탐구하기</span>
        <span class="tile__desc">선생님이 아직 이 활동을 열지 않았습니다.</span>
        <span class="tile__meta">잠김</span>
      </div>`;

  root.innerHTML = `<div class="page page--hub">
    <header class="page-intro">
      <p class="eyebrow">${escapeHtml(classroom.name)}</p>
      <h1>${escapeHtml(classroom.studentName)}님, 무엇을 해 볼까요?</h1>
      <p class="meta">프로토타입 · 로그인은 아직 연결되지 않아 예시 학생으로 보고 있습니다.</p>
    </header>
    <ul class="tile-grid" aria-label="활동 선택">
      <li>
        <a class="tile" href="#/practice">
          <span class="tile__icon">${icons.pencil}</span>
          <span class="tile__title">증명 연습하기</span>
          <span class="tile__desc">증명법을 고르고, 쉬운 활동부터 한 단계씩 인증하며 연습합니다.</span>
          <span class="tile__meta">인증한 단계 ${certified} / ${totalLevels}</span>
        </a>
      </li>
      <li>${researchTile}</li>
      <li>
        <a class="tile" href="#/records">
          <span class="tile__icon">${icons.records}</span>
          <span class="tile__title">내 기록 보기</span>
          <span class="tile__desc">증명법별 인증 현황과 지금까지 푼 활동의 결과를 봅니다.</span>
          <span class="tile__meta">활동 기록 ${attempts}개</span>
        </a>
      </li>
    </ul>
  </div>`;
  return null;
}
