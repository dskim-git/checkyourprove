// 교사 화면: 증명 채점 목록
// 채점자 고르기, 블라인드 채점(학생 이름과 단계를 가리고 채점자별 무작위 순서), 예시 학생 포함 여부,
// 채점 진행, 채점 목록, 두 채점자의 일치도를 보여 준다.

import { RUBRIC_TOTAL } from '../../data/rubric.js';
import { raterAgreement } from '../../services/agreement.js';
import { scoreFor } from '../../services/analysis.js';
import {
  activeRubric, currentRater, getGrading, renameRater, saveGrading, scoreOf, totalOf, updateGradingSettings,
} from '../../state/gradingStore.js';
import { escapeHtml, formatDateTime } from '../../ui/dom.js';
import { breadcrumb, notice } from '../../ui/components.js';
import { gradingQueue, pendingChecks } from './gradingParts.js';
import { handleScopeEvent, scopePicker } from './sessionScope.js';

const percent = (v) => (v == null ? '–' : `${Math.round(v * 100)}%`);
const kappaText = (v) => (v == null ? '계산 불가' : v.toFixed(2));

const FILTERS = [
  { id: 'all', label: '전체' },
  { id: 'todo', label: '채점 안 함' },
  { id: 'pending', label: '추가 확인 남음' },
  { id: 'done', label: '채점함' },
];

export function renderGradingHome(root) {
  let filter = 'all';
  const draw = () => {
    const g = getGrading();
    const rater = currentRater();
    const { targets, blind, byProposition, byStage } = gradingQueue(rater.id);
    const graded = targets.filter((t) => scoreOf(rater.id, t.key)).length;
    const next = targets.find((t) => !scoreOf(rater.id, t.key)) ?? targets.find((t) => pendingChecks(t, scoreOf(rater.id, t.key)).length);

    root.innerHTML = `<div class="page page--teacher">
      ${breadcrumb([{ label: '교사 화면', href: '#/teacher' }, { label: '증명 채점' }])}
      <header class="page-intro">
        <h1>증명 채점</h1>
        <p class="lead">1단계 나의 증명, 2단계 AI 증명(학생이 옮겨 적은 것), 4단계 최종 증명을 같은 루브릭(${RUBRIC_TOTAL}점 만점)으로 채점해 비교합니다.</p>
      </header>
      ${notice('warn', '프로토타입 상태입니다', '채점 기록은 이 브라우저에만 저장됩니다. "예시 학생"은 화면 확인용 가상 데이터이고, "이 브라우저 학생"은 이 브라우저에서 AI와 탐구하기를 한 기록입니다. 제출한 단계만 채점할 수 있습니다.')}

      <section class="panel" aria-labelledby="grading-settings-heading">
        <h2 id="grading-settings-heading" class="section-title">채점 설정</h2>
        <form class="settings-form grading-settings" data-grading-settings novalidate>
          <fieldset class="choice-group">
            <legend>지금 채점하는 사람</legend>
            <p class="field__help">채점자마다 따로 채점하고, 채점 중에는 다른 채점자의 점수를 보여 주지 않습니다. 두 사람이 모두 채점한 증명으로 일치도를 계산합니다.</p>
            ${g.raters.map((r) => `<label class="check">
              <input type="radio" name="rater" value="${r.id}"${r.id === rater.id ? ' checked' : ''}>
              <span>${escapeHtml(r.name)} <span class="meta">${Object.keys(g.scores[r.id] ?? {}).length}개 채점</span></span>
            </label>`).join('')}
            <details class="disclosure">
              <summary>채점자 이름 바꾸기</summary>
              <div class="rater-names">
                ${g.raters.map((r, i) => `<div class="field">
                  <label class="field__label" for="rater-name-${r.id}">채점자 ${i + 1}</label>
                  <input type="text" class="field__input" id="rater-name-${r.id}" data-rater-name="${r.id}" value="${escapeHtml(r.name)}">
                </div>`).join('')}
                <button type="button" class="button button--secondary button--small" data-action="rename">이름 저장</button>
              </div>
            </details>
          </fieldset>
          <label class="check">
            <input type="checkbox" name="blind"${g.blind ? ' checked' : ''}>
            <span>블라인드 채점 <span class="meta">학생 이름과 단계를 가리고 채점자마다 정해진 무작위 순서로 보여 줍니다. 단계가 드러나는 추가 확인(옮겨 적기, 보완 여부)은 점수를 저장한 뒤에 열립니다.</span></span>
          </label>
          <p class="meta">AI 보조 채점자: ${g.aiAsRater ? '켜짐(채점자와 AI의 일치도가 아래에 나옵니다)' : '꺼짐(AI 채점은 참고로만)'} · <a href="#/admin/tools">관리자 설정 &gt; 연구 도구</a>에서 바꿉니다.</p>
          <label class="check">
            <input type="checkbox" name="includeSamples"${g.includeSamples ? ' checked' : ''}>
            <span>예시 학생 포함 <span class="meta">화면 확인용 가상 학생 6명의 기록을 함께 보여 줍니다.</span></span>
          </label>
          <fieldset class="choice-group">
            <legend>채점 순서</legend>
            <label class="check">
              <input type="radio" name="sortBy" value="mixed"${g.sortBy !== 'proposition' ? ' checked' : ''}>
              <span>${g.blind ? '섞어서' : '학생 순'} <span class="meta">${g.blind ? '모든 증명을 채점자마다 정해진 무작위 순서로 채점합니다.' : '학생마다 명제·단계 순서로 채점합니다.'}</span></span>
            </label>
            <label class="check">
              <input type="radio" name="sortBy" value="proposition"${g.sortBy === 'proposition' || (g.blind && g.sortBy === 'propositionStage') ? ' checked' : ''}>
              <span>같은 명제끼리 <span class="meta">한 명제의 증명을 모두 채점한 뒤 다음 명제로 넘어갑니다. 같은 기준으로 일관되게 채점하기 좋습니다.${g.blind ? ' 명제 안에서는 학생과 단계가 섞인 순서입니다.' : ' 명제 안에서는 학생 순입니다.'}</span></span>
            </label>
            <label class="check${g.blind ? ' is-unavailable' : ''}">
              <input type="radio" name="sortBy" value="propositionStage"${!g.blind && g.sortBy === 'propositionStage' ? ' checked' : ''}${g.blind ? ' disabled aria-describedby="stage-sort-note"' : ''}>
              <span>같은 명제·같은 단계끼리 <span class="meta" id="stage-sort-note">명제 안에서 1단계 나의 증명, 2단계 AI 증명, 4단계 최종 증명을 차례로 모아 채점합니다.${g.blind ? ' 순서만으로 단계가 드러나서 블라인드 채점을 끄면 쓸 수 있어요.' : ''}</span></span>
            </label>
          </fieldset>
          ${scopePicker(g)}
          <p class="save-status" data-grading-status aria-live="polite"></p>
        </form>
      </section>

      <section class="panel" aria-labelledby="grading-progress-heading">
        <div class="section-head">
          <h2 id="grading-progress-heading" class="section-title">${escapeHtml(rater.name)}의 채점</h2>
          <a class="button button--ghost button--small" href="#/teacher/rubric">루브릭 보기·고치기</a>
        </div>
        <p class="grade-progress"><strong class="num">${graded}</strong> / <span class="num">${targets.length}</span>개 채점함</p>
        ${targets.length
          ? `<div class="actions actions--start">
              ${next ? `<a class="button button--primary" href="#/teacher/grading/${next.key}" data-start>${graded ? '이어서 채점하기' : '채점 시작하기'}</a>` : '<p class="meta">모든 증명을 채점했습니다.</p>'}
            </div>
            ${filterBar()}
            ${targetTable(targets, rater, blind, byProposition, byStage)}`
          : '<p class="empty-text">채점할 증명이 없습니다. 학생이 1·2·4단계를 제출하면 여기에 나타납니다.</p>'}
      </section>

      <section class="panel" aria-labelledby="agreement-heading">
        <h2 id="agreement-heading" class="section-title">채점자 간 일치도</h2>
        ${agreementBlock(g)}
        ${g.aiAsRater ? aiAgreementBlock(g, targets) : ''}
      </section>
    </div>`;
  };

  function filterBar() {
    return `<fieldset class="choice-group grade-filter">
      <legend>보기</legend>
      ${FILTERS.map((f) => `<label class="check"><input type="radio" name="grade-filter" value="${f.id}"${filter === f.id ? ' checked' : ''} data-grade-filter><span>${f.label}</span></label>`).join('')}
    </fieldset>`;
  }

  const shows = (score, left) => (filter === 'todo' ? !score
    : filter === 'pending' ? Boolean(score) && left.length > 0
      : filter === 'done' ? Boolean(score) && !left.length
        : true);

  function targetTable(targets, rater, blind, byProposition, byStage) {
    const cols = blind ? 5 : 6;
    let lastGroup = null;
    let lastStage = null;
    const rows = targets.map((t, i) => {
      const score = scoreOf(rater.id, t.key);
      const left = pendingChecks(t, score);
      if (!shows(score, left)) return '';
      let groupRow = '';
      if (byProposition && t.problemId !== lastGroup) {
        lastGroup = t.problemId;
        const group = targets.filter((x) => x.problemId === t.problemId);
        const done = group.filter((x) => scoreOf(rater.id, x.key)).length;
        groupRow = `<tr class="grade-group"><th scope="colgroup" colspan="${cols}">명제 ${t.propIndex + 1} ${escapeHtml(t.problem?.title ?? '')} <span class="meta">${group.length}개 중 ${done}개 채점함</span></th></tr>`;
        lastStage = null;
      }
      if (byStage && t.stage !== lastStage) {
        lastStage = t.stage;
        const group = targets.filter((x) => x.problemId === t.problemId && x.stage === t.stage);
        const done = group.filter((x) => scoreOf(rater.id, x.key)).length;
        groupRow += `<tr class="grade-group grade-group--stage"><th scope="colgroup" colspan="${cols}">${escapeHtml(t.stageDef.label)} <span class="meta">${group.length}개 중 ${done}개 채점함</span></th></tr>`;
      }
      const status = score
        ? `채점함${left.length ? ` <span class="tag tag--warn">${escapeHtml(left.join(', '))} 남음</span>` : ''}`
        : '<span class="meta">아직</span>';
      const who = blind
        ? `<th scope="row"><a href="#/teacher/grading/${t.key}">증명 ${i + 1}</a></th>`
        : `<th scope="row"><a href="#/teacher/grading/${t.key}">${escapeHtml(t.student.pseudonym)}</a>${t.student.sample ? ' <span class="tag tag--proto">예시</span>' : ''}</th><td>${escapeHtml(t.stageDef.label)}</td>`;
      return `${groupRow}<tr>
        ${who}
        <td>명제 ${t.propIndex + 1}</td>
        <td>${status}</td>
        <td class="num">${score ? `${totalOf(score)} / ${RUBRIC_TOTAL}` : '–'}</td>
        <td>${score ? escapeHtml(formatDateTime(score.gradedAt)) : '–'}</td>
      </tr>`;
    }).join('');
    const head = blind
      ? '<th scope="col">순서</th>'
      : '<th scope="col">학생</th><th scope="col">단계</th>';
    return `<div class="table-wrap" role="region" aria-labelledby="grading-progress-heading" tabindex="0">
      <table class="data-table grade-table" data-grading-table>
        <thead><tr>${head}<th scope="col">명제</th><th scope="col">상태</th><th scope="col">합계</th><th scope="col">채점 시각</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="${cols}" class="meta">이 보기에 해당하는 증명이 없습니다.</td></tr>`}</tbody>
      </table>
    </div>`;
  }

  function agreementBlock(g) {
    const [a, b] = g.raters;
    const result = raterAgreement(activeRubric(), g.scores[a.id], g.scores[b.id]);
    if (!result.n) {
      return `<p class="empty-text">두 채점자가 모두 채점한 증명이 아직 없습니다. ${escapeHtml(a.name)}과 ${escapeHtml(b.name)}가 같은 증명을 채점하면 기준별 일치율과 가중 카파를 보여 줍니다.</p>`;
    }
    const rows = result.criteria.map((c) => `<tr>
      <th scope="row">${escapeHtml(c.title)}</th>
      <td class="num">${c.n}</td>
      <td class="num">${percent(c.exact)}</td>
      <td class="num">${kappaText(c.kappa)}</td>
    </tr>`).join('');
    return `<p class="meta">두 채점자가 모두 채점한 증명 ${result.n}개 기준입니다. 가중 카파는 이차 가중을 썼고, 1에 가까울수록 일치합니다. 모든 점수가 같으면 계산할 수 없습니다.</p>
      <div class="table-wrap" role="region" aria-labelledby="agreement-heading" tabindex="0">
        <table class="data-table" data-agreement-table>
          <thead><tr><th scope="col">기준</th><th scope="col">증명 수</th><th scope="col">정확 일치율</th><th scope="col">가중 카파</th></tr></thead>
          <tbody>${rows}
            <tr><th scope="row">합계 점수</th><td class="num">${result.n}</td><td class="num">${percent(result.exactTotal)}</td><td>평균 차이 <span class="num">${result.meanDiff.toFixed(2)}</span>점</td></tr>
          </tbody>
        </table>
      </div>`;
  }

  /** AI 보조 채점자: 채점자마다 그 채점자가 채점한 증명에서 AI 점수와의 일치도 */
  function aiAgreementBlock(g, targets) {
    const ai = {};
    targets.forEach((t) => {
      const s = scoreFor(t.student, t.stage, t.problemId, 'ai');
      if (s) ai[t.key] = { criteria: s.criteria };
    });
    const rows = g.raters.map((r) => {
      const res = raterAgreement(activeRubric(), g.scores[r.id], ai);
      const kappas = res.criteria.map((c) => c.kappa).filter((v) => v != null);
      return `<tr><th scope="row">${escapeHtml(r.name)} ↔ AI</th><td class="num">${res.n}</td><td class="num">${percent(res.exactTotal)}</td><td class="num">${res.meanDiff == null ? '–' : res.meanDiff.toFixed(2)}</td><td class="num">${kappas.length ? kappaText(kappas.reduce((s, v) => s + v, 0) / kappas.length) : '계산 불가'}</td></tr>`;
    }).join('');
    return `<h3 class="an-sub">채점자와 AI 보조 채점자의 일치도</h3>
      <p class="meta">AI 채점은 지금 예시 규칙(더미)이라 참고용입니다. 기준별 가중 카파의 평균을 함께 보여 줍니다.</p>
      <div class="table-wrap" role="region" aria-label="채점자와 AI의 일치도" tabindex="0">
        <table class="data-table" data-ai-agreement>
          <thead><tr><th scope="col">짝</th><th scope="col">증명 수</th><th scope="col">합계 정확 일치율</th><th scope="col">합계 평균 차이</th><th scope="col">기준별 카파 평균</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  const onChange = (event) => {
    if (handleScopeEvent(event, root)) {
      draw();
      return;
    }
    if (event.target.matches('[data-grade-filter]')) {
      filter = event.target.value;
      draw();
      root.querySelector(`[data-grade-filter][value="${filter}"]`)?.focus();
      return;
    }
    const form = event.target.closest('[data-grading-settings]');
    if (!form || event.target.matches('[data-rater-name]')) return;
    const data = new FormData(form);
    updateGradingSettings({ currentRater: data.get('rater'), blind: data.get('blind') === 'on', includeSamples: data.get('includeSamples') === 'on', sortBy: data.get('sortBy') ?? 'mixed' });
    draw();
    root.querySelector('[data-grading-status]').textContent = '설정을 저장했습니다.';
  };
  const onClick = (event) => {
    if (handleScopeEvent(event, root)) {
      draw();
      return;
    }
    if (!event.target.closest('[data-action="rename"]')) return;
    root.querySelectorAll('[data-rater-name]').forEach((input) => renameRater(input.dataset.raterName, input.value));
    saveGrading();
    draw();
    root.querySelector('[data-grading-status]').textContent = '채점자 이름을 저장했습니다.';
  };
  const onSubmit = (event) => event.preventDefault();

  draw();
  root.addEventListener('change', onChange);
  root.addEventListener('click', onClick);
  root.addEventListener('submit', onSubmit);
  return () => {
    root.removeEventListener('change', onChange);
    root.removeEventListener('click', onClick);
    root.removeEventListener('submit', onSubmit);
  };
}
