// 교사 화면: 면담 후보와 면담 기록 목록 (구현 6)
// 보기 설정(점수 출처·예시 학생·연구 동의·포함할 세션, 연구 분석과 같은 설정), 후보 기준값, 유형별 후보·선정 수,
// 면담 대상 목록(상태·일시·동의, CSV), 추천 후보(학생별로 묶은 근거, 교사가 골라 선정), 유형 6 직접 지정(사후 설문 서술형 참고).

import { isFirebase } from '../../state/appMode.js';
import { interviewType } from '../../data/interview.js';
import { interviewCsv, postSurveyTexts, typeCounts } from '../../services/interviewCandidates.js';
import { getGrading, updateGradingSettings } from '../../state/gradingStore.js';
import { interviewThresholds, selectionOf as getSelected, selectStudent, unselectStudent } from '../../state/interviewStore.js';
import { className, sessionLabel } from '../../state/sessionStore.js';
import { breadcrumb, notice } from '../../ui/components.js';
import { statTiles } from '../../ui/charts.js';
import { escapeHtml } from '../../ui/dom.js';
import { sourceOf, sourcePicker } from './analysisHomeView.js';
import { fillRetentionAlert } from './recordingsView.js';
import { handleScopeEvent, scopePicker, scopeText } from './sessionScope.js';
import { consentSummary, interviewRow, interviewRows, matchList, statusChip, typeChip } from './interviewParts.js';

const sampleTag = (s) => (s.sample ? ' <span class="tag tag--proto">예시</span>' : '');

export function renderInterviewHome(root) {
  let filter = 'all';

  const draw = () => {
    const g = getGrading();
    const { rows, all, excluded } = interviewRows(g);
    const th = interviewThresholds();
    const counts = typeCounts(rows);
    const unscored = rows.reduce((s, r) => s + r.unscored, 0);
    const candidates = rows.filter((r) => r.matches.length);
    const shown = candidates.filter((r) => filter === 'all' || r.matches.some((m) => m.type === filter));
    // 면담 대상: 지금 설정에서 빠진 학생도 선정했다면 목록에 남긴다
    const selectedRows = all.filter((s) => getSelected(s.id)).map((s) => rows.find((r) => r.student.id === s.id) ?? interviewRow(s));

    root.innerHTML = `<div class="page page--teacher page--interview">
      ${breadcrumb([{ label: '교사 화면', href: '#/teacher' }, { label: '면담' }])}
      <header class="page-intro">
        <h1>면담 후보와 기록</h1>
        <p class="lead">학생 × 명제마다 기록을 살펴 면담 후보를 추천합니다. 추천은 참고용이고 면담 대상은 교사가 고릅니다. 고른 학생은 면담 화면에서 기록을 보며 질문 예시와 메모를 남깁니다.</p>
      </header>
      ${isFirebase ? notice('info', '면담 기록은 서버에 저장돼요', '회차마다 담당 선생님들과 함께 쓰고, 학생은 볼 수 없어요. 녹음 파일은 아직 이 기기에만 저장되고(다음 단계에서 서버로), 음성 전사는 그 뒤에 더합니다.') : notice('warn', '프로토타입 상태입니다', '이 브라우저의 기록과 예시 학생 기록으로 계산합니다. 녹음 파일은 이 브라우저에만 저장되고, 음성 전사는 서버를 연결한 뒤에 더합니다.')}
      <div data-retention-alert></div>
      <p><a class="button button--secondary button--small" href="#/teacher/recordings">녹음 관리</a></p>

      <section class="panel" aria-labelledby="iv-settings">
        <h2 id="iv-settings" class="section-title">보기 설정</h2>
        <form class="settings-form grading-settings" data-analysis-settings novalidate>
          ${sourcePicker(sourceOf())}
          <label class="check"><input type="checkbox" name="includeSamples"${g.includeSamples ? ' checked' : ''}><span>예시 학생 포함</span></label>
          <label class="check"><input type="checkbox" name="includeNonConsent"${g.includeNonConsent ? ' checked' : ''}><span>연구에 동의하지 않은 학생도 포함 <span class="meta">기본은 동의한 학생만 추천합니다.${excluded ? ` 지금 ${excluded}명이 빠져 있습니다.` : ''}</span></span></label>
          ${scopePicker(g)}
        </form>
        <p class="meta">연구 분석 화면과 같은 설정입니다. 여기서 바꾸면 연구 분석에도 똑같이 적용됩니다.</p>
        ${unscored ? notice('eye', `점수가 없는 명제 ${unscored}개는 유형 1~3을 판정하지 못했습니다`, '증명 채점 화면에서 채점하거나, 점수 출처를 "AI 채점(참고)"으로 바꾸면 미리 볼 수 있습니다. 유형 4·5는 점수 없이도 판정합니다.') : ''}
      </section>

      <section class="panel" aria-labelledby="iv-criteria">
        <h2 id="iv-criteria" class="section-title">후보 기준</h2>
        <p class="meta">10점 만점 점수 기준입니다. 기준값은 <a href="#/admin/tools">관리자 설정 &gt; 연구 도구</a>에서 바꿉니다.</p>
        <details class="ref-card">
          <summary>유형별 판정 규칙</summary>
          <ul class="answer-list">
            <li><strong>유형 1</strong> 1단계 ${th.lowMax}점 이하이고 4단계 ${th.highMin}점 이상</li>
            <li><strong>유형 2</strong> 1단계 ${th.highMin}점 이상이고 최종 증명의 AI 반영 ${th.aiShareMin}% 이상(4단계 반영 비율, 학생 자기 보고)</li>
            <li><strong>유형 3</strong> 1단계 ${th.highMin}점 이상이고, 4단계에서 증명법을 바꾸었거나 점수가 ${th.dropMin}점 이상 떨어짐</li>
            <li><strong>유형 4</strong> 대화 태그 "단계를 나눈 질문"(잘 쓴 예), "짧게 해 달라는 요청"·"목적과 무관한 사용"(못 쓴 예). 채점자 중 한 명이라도 붙이면 인정합니다. 아직 태그를 붙이지 않은 대화는 증명과 무관한 질문 수로 "추정"을 보여 줍니다.</li>
            <li><strong>유형 5</strong> 2단계에서 AI가 쓴 증명법이 1단계와 다른데 4단계도 1단계 증명법을 유지함. 1단계 ${th.stickWeakMax}점 이하이면 "부정확한데도 고수"로 표시합니다.</li>
            <li><strong>유형 6</strong> 추천하지 않습니다. 아래에서 교사가 직접 지정합니다.</li>
          </ul>
        </details>
      </section>

      <section class="panel" aria-labelledby="iv-summary">
        <h2 id="iv-summary" class="section-title">유형별 후보</h2>
        <p class="meta">포함한 세션: ${escapeHtml(scopeText(g))}, 학생 ${rows.length}명 중 후보 ${candidates.length}명. 한 학생이 여러 유형에 들 수 있습니다.</p>
        ${statTiles(counts.map((c) => ({ label: `유형 ${c.type.n} ${c.type.short}`, value: c.type.id === 't6' ? '직접 지정' : `후보 ${c.candidates}명`, sub: `면담 대상 ${c.selected}명` })))}
      </section>

      <section class="panel" aria-labelledby="iv-selected">
        <div class="section-head">
          <h2 id="iv-selected" class="section-title">면담 대상 (${selectedRows.length}명)</h2>
          <button type="button" class="button button--secondary button--small" data-action="csv"${selectedRows.length ? '' : ' disabled'}>면담 기록 CSV 내려받기</button>
        </div>
        ${selectedRows.length ? `<div class="table-wrap" role="region" aria-labelledby="iv-selected" tabindex="0">
          <table class="data-table grade-table" data-iv-selected>
            <thead><tr><th scope="col">학생</th><th scope="col">세션</th><th scope="col">고른 유형</th><th scope="col">상태</th><th scope="col">면담 일시</th><th scope="col">면담 동의</th><th scope="col">질문 메모</th></tr></thead>
            <tbody>${selectedRows.map((r) => {
              const sel = getSelected(r.student.id);
              const qs = r.record?.questions ?? [];
              return `<tr>
                <th scope="row"><a href="#/teacher/interviews/${r.student.id}">${escapeHtml(r.student.pseudonym)}</a>${sampleTag(r.student)}</th>
                <td>${escapeHtml(sessionLabel(r.student.session))}</td>
                <td><span class="tag-chips">${sel.types.map((t) => typeChip(t)).join('')}</span></td>
                <td>${statusChip(r.record)}</td>
                <td>${r.record?.scheduledAt ? escapeHtml(r.record.scheduledAt.replace('T', ' ')) : '–'}</td>
                <td>${escapeHtml(consentSummary(r.record))}</td>
                <td class="num">${r.record ? `${qs.filter((q) => String(q.answer ?? '').trim()).length} / ${qs.length}` : '–'}</td>
              </tr>`;
            }).join('')}</tbody>
          </table>
        </div>` : '<p class="empty-text">아직 면담 대상으로 정한 학생이 없습니다. 아래 추천 후보에서 고르세요.</p>'}
      </section>

      <section class="panel" aria-labelledby="iv-candidates">
        <h2 id="iv-candidates" class="section-title">추천 후보</h2>
        <fieldset class="choice-group" data-iv-filter>
          <legend>유형</legend>
          <div class="pick-group__options">
            <label class="pick pick--tag"><input type="radio" name="ivFilter" value="all"${filter === 'all' ? ' checked' : ''}><span>전체 (${candidates.length})</span></label>
            ${counts.filter((c) => c.type.id !== 't6').map((c) => `<label class="pick pick--tag"><input type="radio" name="ivFilter" value="${c.type.id}"${filter === c.type.id ? ' checked' : ''}><span>유형 ${c.type.n} (${c.candidates})</span></label>`).join('')}
          </div>
        </fieldset>
        ${shown.length ? `<ul class="iv-cards">${shown.map(candidateCard).join('')}</ul>` : '<p class="empty-text">기준에 맞는 학생이 없습니다. 기준값이나 점수 출처를 바꾸어 보세요.</p>'}
      </section>

      <section class="panel" aria-labelledby="iv-manual">
        <h2 id="iv-manual" class="section-title">유형 6: 직접 지정</h2>
        <p class="meta">수업에 대해 자기 의견이 있는 학생 등, 추천 기준과 관계없이 면담하고 싶은 학생을 고릅니다. 사후 설문의 서술형 답을 참고하세요.</p>
        ${manualForm(rows)}
        ${surveyTexts(rows)}
      </section>
    </div>`;
  };

  function candidateCard(r) {
    const sel = getSelected(r.student.id);
    const types = [...new Set(r.matches.map((m) => m.type))];
    return `<li class="iv-card${sel ? ' is-selected' : ''}" data-student="${escapeHtml(r.student.id)}">
      <div class="section-head">
        <h3 class="iv-card__name"><a href="#/teacher/analysis/${r.student.id}">${escapeHtml(r.student.pseudonym)}</a>${sampleTag(r.student)}</h3>
        <span class="tag-chips"><span class="tag">${escapeHtml(sessionLabel(r.student.session))}</span>${sel ? '<span class="tag tag--strong">면담 대상</span>' : ''}</span>
      </div>
      ${matchList(r.matches)}
      ${sel
        ? `<div class="actions actions--start">
            <a class="button button--primary button--small" href="#/teacher/interviews/${r.student.id}">면담 화면 열기</a>
            <button type="button" class="button button--ghost button--small" data-action="unselect">면담 대상에서 빼기</button>
          </div>`
        : `<fieldset class="choice-group iv-card__pick">
            <legend class="meta">면담 이유로 남길 유형</legend>
            <div class="pick-group__options">${types.map((t) => `<label class="pick pick--tag"><input type="checkbox" name="pickType" value="${t}" checked><span>유형 ${interviewType(t).n} · ${escapeHtml(interviewType(t).short)}</span></label>`).join('')}</div>
          </fieldset>
          <p class="field__error" data-pick-error hidden>유형을 하나 이상 고르세요.</p>
          <div class="actions actions--start"><button type="button" class="button button--secondary button--small" data-action="select">면담 대상으로 정하기</button></div>`}
    </li>`;
  }

  function manualForm(rows) {
    const free = rows.filter((r) => !getSelected(r.student.id));
    if (!rows.length) return '<p class="empty-text">아직 1단계를 제출한 학생이 없습니다.</p>';
    if (!free.length) return '<p class="meta">모든 학생을 이미 면담 대상으로 정했습니다.</p>';
    return `<form class="iv-manual" data-manual-form novalidate>
      <div class="field"><label class="field__label" for="iv-manual-student">학생</label>
        <select class="field__select" id="iv-manual-student" name="student">${free.map((r) => `<option value="${escapeHtml(r.student.id)}">${escapeHtml(r.student.pseudonym)} (${escapeHtml(sessionLabel(r.student.session))})</option>`).join('')}</select></div>
      <div class="field"><label class="field__label" for="iv-manual-note">고른 이유 <span class="field__req">필수</span></label>
        <input type="text" class="field__input" id="iv-manual-note" name="note" placeholder="예: 사후 설문에 AI 수업에 대한 의견을 자세히 씀">
        <p class="field__error" data-manual-error hidden>고른 이유를 쓰세요.</p></div>
      <div class="actions actions--start"><button type="submit" class="button button--secondary">유형 6으로 면담 대상 정하기</button></div>
    </form>`;
  }

  function surveyTexts(rows) {
    const list = rows.map((r) => ({ r, texts: postSurveyTexts(r.student) })).filter((x) => x.texts.length);
    return `<details class="ref-card">
      <summary>사후 설문 서술형 답 보기 (${list.length}명)</summary>
      ${list.length ? `<ul class="answer-list">${list.map(({ r, texts }) => `<li><span class="meta">${escapeHtml(r.student.pseudonym)}${getSelected(r.student.id) ? ', 면담 대상' : ''}</span>${texts.map((t) => `<span><span class="meta">${escapeHtml(t.question)}</span> ${escapeHtml(t.text)}</span>`).join('')}</li>`).join('')}</ul>` : '<p class="empty-text">아직 사후 설문에 서술형 답을 쓴 학생이 없습니다.</p>'}
    </details>`;
  }

  const redraw = () => {
    const y = window.scrollY;
    draw();
    window.scrollTo(0, y);
  };

  const onChange = (event) => {
    if (handleScopeEvent(event, root)) return redraw();
    const t = event.target;
    if (t.name === 'analysisSource') updateGradingSettings({ analysisSource: t.value });
    else if (t.name === 'includeSamples') updateGradingSettings({ includeSamples: t.checked });
    else if (t.name === 'includeNonConsent') updateGradingSettings({ includeNonConsent: t.checked });
    else if (t.name === 'ivFilter') {
      filter = t.value;
      redraw();
      root.querySelector(`input[name="ivFilter"][value="${filter}"]`)?.focus();
      return;
    } else return;
    redraw();
  };

  const onClick = (event) => {
    if (handleScopeEvent(event, root)) return redraw();
    const btn = event.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'csv') {
      const { all } = interviewRows();
      const sel = all.filter((s) => getSelected(s.id)).map((s) => interviewRow(s));
      const csv = interviewCsv(sel.map((r) => ({ ...r, propIndexOf: (id) => r.a.props.findIndex((p) => p.problemId === id) })), { className });
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `면담기록-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      return;
    }
    const card = btn.closest('[data-student]');
    if (!card) return;
    const id = card.dataset.student;
    if (action === 'unselect') {
      unselectStudent(id);
      return redraw();
    }
    if (action === 'select') {
      const types = [...card.querySelectorAll('input[name="pickType"]:checked')].map((b) => b.value);
      if (!types.length) {
        card.querySelector('[data-pick-error]').hidden = false;
        return;
      }
      const row = interviewRows().rows.find((r) => r.student.id === id);
      const reasons = (row?.matches ?? []).filter((m) => types.includes(m.type)).map((m) => ({ type: m.type, problemId: m.problemId, text: m.text }));
      selectStudent(id, { types, reasons });
      redraw();
    }
  };

  const onSubmit = (event) => {
    if (!event.target.closest('[data-manual-form]')) return;
    event.preventDefault();
    const form = event.target;
    const id = form.querySelector('[name="student"]').value;
    const noteBox = form.querySelector('[name="note"]');
    const note = noteBox.value.trim();
    if (!note) {
      form.querySelector('[data-manual-error]').hidden = false;
      noteBox.setAttribute('aria-invalid', 'true');
      noteBox.focus();
      return;
    }
    selectStudent(id, { types: ['t6'], reasons: [{ type: 't6', problemId: null, text: note }], note });
    redraw();
  };

  draw();
  fillRetentionAlert(root);
  root.addEventListener('change', onChange);
  root.addEventListener('click', onClick);
  root.addEventListener('submit', onSubmit);
  return () => {
    root.removeEventListener('change', onChange);
    root.removeEventListener('click', onClick);
    root.removeEventListener('submit', onSubmit);
  };
}

