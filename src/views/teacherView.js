// 교사 화면 미리보기
// 권한 검증, 실제 학생 데이터, 서버 저장, 내려받기는 아직 구현하지 않았다.
// 화면에서도 미구현 기능은 비활성 상태와 "미구현" 표시로 구분한다.

import { METHODS, getMethod } from '../data/methods.js';
import { LEVELS, getLevel } from '../data/levels.js';
import { PROBLEMS, getProblem } from '../data/problems/index.js';
import { fullProofText } from '../data/proofModel.js';
import { SAMPLE_ACTIVITY, SAMPLE_RESEARCH_RECORDS } from '../data/sampleRecords.js';
import { getClassroom, saveClassroom } from '../state/classroomStore.js';
import { escapeHtml, formatDateTime, formatTime } from '../ui/dom.js';
import { icons } from '../ui/icons.js';
import { breadcrumb, chatMessages, notice, proofText } from '../ui/components.js';

let selectedRecordIndex = 0;

export function renderTeacher(root) {
  const classroom = getClassroom();

  root.innerHTML = `<div class="page page--teacher">
    ${breadcrumb([{ label: '교사 화면 미리보기' }])}
    <header class="page-intro">
      <p class="eyebrow">교사 화면 미리보기</p>
      <h1>수업 관리</h1>
      <p class="lead">증명 연습의 인증 기준과 AI와 탐구하기 활동을 정하고, 학생의 활동을 확인하는 화면의 기본 골격입니다.</p>
    </header>

    ${notice('warn', '프로토타입 상태입니다', '교사 권한 확인, 실제 학생 데이터, 서버 저장은 아직 연결되지 않았습니다. 설정은 이 브라우저에만 저장되며, 아래 학생 기록은 모두 예시 데이터입니다.')}

    <section class="panel" aria-labelledby="settings-heading">
      <h2 id="settings-heading" class="section-title">수업 설정</h2>
      ${settingsForm(classroom)}
    </section>

    <section class="panel" aria-labelledby="activity-heading">
      <div class="section-head">
        <h2 id="activity-heading" class="section-title">증명 연습 현황</h2>
        <span class="tag tag--proto">예시 데이터</span>
      </div>
      <p class="meta">증명법마다 인증한 활동 단계 수(최대 ${LEVELS.length})와 최근 활동입니다.</p>
      ${activityTable()}
    </section>

    <section class="panel" aria-labelledby="record-heading">
      <div class="section-head">
        <h2 id="record-heading" class="section-title">AI와 탐구하기 기록 미리보기</h2>
        <span class="tag tag--proto">예시 데이터</span>
      </div>
      <div class="field field--inline">
        <label class="field__label" for="record-select">학생 기록 선택</label>
        <select id="record-select" class="field__select">
          ${SAMPLE_RESEARCH_RECORDS.map((record, index) => `<option value="${index}"${index === selectedRecordIndex ? ' selected' : ''}>${escapeHtml(record.pseudonym)} · ${escapeHtml(getProblem(record.problemId).title)}</option>`).join('')}
        </select>
      </div>
      <div data-record-detail>${recordDetail(SAMPLE_RESEARCH_RECORDS[selectedRecordIndex])}</div>
      <div class="actions actions--start">
        <button type="button" class="button button--secondary" disabled aria-describedby="unimplemented-note">기록 내려받기 (미구현)</button>
        <button type="button" class="button button--secondary" disabled aria-describedby="unimplemented-note">AI 요약 만들기 (미구현)</button>
        <p class="actions__note" id="unimplemented-note">내려받기와 AI 요약은 형식과 권한 설계가 정해진 뒤 구현합니다. AI 요약은 원본 기록을 대체하지 않고 원본과 연결해 저장할 예정입니다.</p>
      </div>
    </section>
  </div>`;

  const form = root.querySelector('[data-settings-form]');

  const onChange = (event) => {
    if (event.target.id === 'record-select') {
      selectedRecordIndex = Number(event.target.value);
      root.querySelector('[data-record-detail]').innerHTML = recordDetail(SAMPLE_RESEARCH_RECORDS[selectedRecordIndex]);
      return;
    }
    const status = root.querySelector('[data-settings-status]');
    if (form.contains(event.target) && status) status.textContent = '저장하지 않은 변경 사항이 있습니다.';
  };

  const onSubmit = (event) => {
    if (event.target !== form) return;
    event.preventDefault();
    const data = new FormData(form);
    saveClassroom({
      ...classroom,
      requiredClears: Number(data.get('requiredClears')),
      unlockAll: data.get('unlockAll') === 'on',
      researchOpen: data.get('researchOpen') === 'on',
      researchProblemId: data.get('researchProblemId'),
    });
    root.querySelector('[data-settings-status]').textContent = `설정을 저장했습니다 (${formatTime(new Date().toISOString())}). 학생 화면에 바로 반영됩니다.`;
  };

  root.addEventListener('change', onChange);
  root.addEventListener('submit', onSubmit);
  return () => {
    root.removeEventListener('change', onChange);
    root.removeEventListener('submit', onSubmit);
  };
}

function settingsForm(classroom) {
  const clearOptions = [1, 2, 3]
    .map((n) => `<option value="${n}"${classroom.requiredClears === n ? ' selected' : ''}>명제 ${n}개 통과</option>`)
    .join('');
  const researchOptions = PROBLEMS.map(
    (p) => `<option value="${p.id}"${classroom.researchProblemId === p.id ? ' selected' : ''}>[${escapeHtml(getMethod(p.method).shortLabel)}] ${escapeHtml(p.title)}</option>`,
  ).join('');

  return `<form class="settings-form" data-settings-form novalidate>
    <div class="field">
      <p class="field__label">수업</p>
      <p>${escapeHtml(classroom.name)}</p>
    </div>

    <fieldset class="choice-group">
      <legend class="field__label">증명 연습하기</legend>
      <div class="field field--inline">
        <label class="field__label" for="required-clears">활동 단계 인증 기준</label>
        <p class="field__help" id="required-clears-help">한 활동 단계에서 이만큼 통과하면 인증되고 다음 단계가 열립니다.</p>
        <select id="required-clears" name="requiredClears" class="field__select" aria-describedby="required-clears-help">${clearOptions}</select>
      </div>
      <label class="check">
        <input type="checkbox" name="unlockAll"${classroom.unlockAll ? ' checked' : ''}>
        <span>모든 단계 열기 <span class="meta">· 시연·수업 진행용. 인증하지 않아도 모든 활동을 선택할 수 있습니다.</span></span>
      </label>
    </fieldset>

    <fieldset class="choice-group">
      <legend class="field__label">AI와 탐구하기 (연구 모드)</legend>
      <label class="check">
        <input type="checkbox" name="researchOpen"${classroom.researchOpen ? ' checked' : ''}>
        <span>학생 홈에서 AI와 탐구하기 열기</span>
      </label>
      <div class="field field--inline">
        <label class="field__label" for="research-problem">탐구할 명제</label>
        <p class="field__help" id="research-problem-help">모든 학생이 같은 명제로 활동합니다.</p>
        <select id="research-problem" name="researchProblemId" class="field__select" aria-describedby="research-problem-help">${researchOptions}</select>
      </div>
    </fieldset>

    <fieldset class="choice-group is-unavailable" disabled>
      <legend class="field__label">연구용 고급 설정 <span class="tag tag--proto">미구현</span></legend>
      <label class="check">
        <input type="checkbox"${classroom.flawedAiProofEnabled ? ' checked' : ''}>
        <span>오류가 포함된 AI 증명 제공 <span class="meta">· 기본값 꺼짐. 교사가 명시적으로 설정하고 관리하는 기능으로 따로 구현할 예정입니다.</span></span>
      </label>
    </fieldset>

    <div class="actions">
      <p class="save-status" data-settings-status aria-live="polite"></p>
      <button type="submit" class="button button--primary">설정 저장</button>
    </div>
  </form>`;
}

function activityTable() {
  const head = METHODS.map((m) => `<th scope="col">${escapeHtml(m.shortLabel)}</th>`).join('');
  const rows = SAMPLE_ACTIVITY.map((row) => {
    const recent = row.recent;
    const cells = METHODS.map((m) => `<td>${row.certified[m.id]} / ${LEVELS.length}</td>`).join('');
    return `<tr>
      <th scope="row">${escapeHtml(row.pseudonym)}</th>
      ${cells}
      <td>${escapeHtml(getMethod(recent.method).shortLabel)} · ${escapeHtml(getLevel(recent.levelId).title)} · ${escapeHtml(getProblem(recent.problemId).title)} (${escapeHtml(recent.result)})</td>
      <td>${escapeHtml(formatDateTime(row.lastActiveAt))}</td>
    </tr>`;
  }).join('');

  return `<div class="table-wrap" role="region" aria-labelledby="activity-heading" tabindex="0">
    <table class="data-table">
      <thead><tr><th scope="col">학생(가명)</th>${head}<th scope="col">최근 활동</th><th scope="col">마지막 활동</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function recordDetail(record) {
  const problem = getProblem(record.problemId);
  const requests = record.aiDialogue.requestLog.map((req) => `<tr>
      <td>${escapeHtml(formatTime(req.sentAt))}</td>
      <td>${req.purpose === 'proof' ? '증명 생성' : '대화'}</td>
      <td><code>${escapeHtml(req.inputKeys.join(', '))}</code></td>
      <td>${req.inputKeys.includes('studentDraft') ? '포함됨' : `${icons.check}<span>포함 안 됨</span>`}</td>
      <td>${escapeHtml(req.promptVersion)}</td>
    </tr>`).join('');

  const pendingText = '아직 이 단계에 도달하지 않았습니다.';
  const c = record.comparison;

  return `<ol class="timeline">
    <li class="timeline__item">
      <h3 class="timeline__title">1. 확정한 초안 <span class="meta">${escapeHtml(formatDateTime(record.draft.confirmedAt))}</span></h3>
      ${proofText(record.draft.text)}
    </li>
    <li class="timeline__item">
      <h3 class="timeline__title">2. AI 탐구 <span class="meta">메시지 ${record.aiDialogue.messages.length}개</span></h3>
      <div class="table-wrap" role="region" aria-label="AI 요청 입력 기록" tabindex="0">
        <table class="data-table data-table--compact">
          <thead><tr><th scope="col">시각</th><th scope="col">목적</th><th scope="col">AI 입력 필드</th><th scope="col">학생 초안</th><th scope="col">프롬프트</th></tr></thead>
          <tbody>${requests}</tbody>
        </table>
      </div>
      <details class="disclosure">
        <summary>대화 기록 보기</summary>
        <ol class="chat__log chat__log--compact">${chatMessages(record.aiDialogue.messages)}</ol>
      </details>
    </li>
    <li class="timeline__item">
      <h3 class="timeline__title">3. AI의 증명 <span class="meta">${escapeHtml(formatDateTime(record.aiProof.generatedAt))}</span></h3>
      ${record.aiProof.generatedAt ? proofText(fullProofText(problem)) : `<p class="empty-text">${pendingText}</p>`}
    </li>
    <li class="timeline__item">
      <h3 class="timeline__title">4. 비교·평가</h3>
      ${c ? `<dl class="record-list">
        <div><dt>내 증명 · 잘한 점</dt><dd>${escapeHtml(c.ownStrengths)}</dd></div>
        <div><dt>내 증명 · 부족한 점</dt><dd>${escapeHtml(c.ownWeaknesses)}</dd></div>
        <div><dt>AI 증명 · 잘한 점</dt><dd>${escapeHtml(c.aiStrengths)}</dd></div>
        <div><dt>AI 증명 · 부족한 점</dt><dd>${escapeHtml(c.aiWeaknesses)}</dd></div>
        <div><dt>AI 증명에서 아쉬운 점</dt><dd>${escapeHtml(c.aiRegrets)}</dd></div>
      </dl>` : `<p class="empty-text">${pendingText}</p>`}
    </li>
    <li class="timeline__item">
      <h3 class="timeline__title">5. 최종 증명</h3>
      ${record.finalProof ? proofText(record.finalProof.text) : `<p class="empty-text">${pendingText}</p>`}
    </li>
    <li class="timeline__item">
      <h3 class="timeline__title">6. 반영 성찰</h3>
      ${record.reflection ? `<dl class="record-list">
        <div><dt>내 초안 반영</dt><dd>${record.reflection.ownReflectedLevel} / 5</dd></div>
        <div><dt>AI 증명 반영</dt><dd>${record.reflection.aiReflectedLevel} / 5</dd></div>
        <div><dt>설명</dt><dd>${escapeHtml(record.reflection.explanation)}</dd></div>
      </dl>` : `<p class="empty-text">${pendingText}</p>`}
    </li>
  </ol>`;
}
