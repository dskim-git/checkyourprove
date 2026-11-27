// 교사 화면: 학생 한 명의 면담 (구현 6)
// 왼쪽(읽을 것): 추천 근거, 명제마다 1~4단계 기록 요약과 증명, 사후 설문 서술형 답
// 오른쪽(쓸 것): 면담 이유(유형), 면담 동의 확인(학생·보호자·녹음, 받은 날짜), 일시·면담자·상태, 질문 목록(자동 질문 예시 + 교사 질문, 질문별 학생 답 메모), 전체 메모
// 모든 입력은 바로 저장한다(state/interviewStore.js). 학생·보호자 동의를 표시해야 "완료"로 바꿀 수 있다.

import { INTERVIEW_CONSENTS, INTERVIEW_STATUS, INTERVIEW_TYPES, interviewType } from '../../data/interview.js';
import { CHECKLIST_NONE, MORE_ACCURATE_OPTIONS, REVISION_CHECKLIST, STUCK_RESOLVED_OPTIONS, methodOptionLabel, optionLabel } from '../../data/research.js';
import { aiShareOf, interviewQuestions, postSurveyTexts } from '../../services/interviewCandidates.js';
import { CONSENT_LABELS, consentStatus } from '../../services/surveyAnalysis.js';
import {
  addQuestions, consentComplete, ensureRecord, moveQuestion, recordOf, removeQuestion, selectionOf, selectStudent,
  updateQuestion, updateRecord, updateSelection,
} from '../../state/interviewStore.js';
import { sessionLabel } from '../../state/sessionStore.js';
import { inkStats } from '../../state/inkModel.js';
import { breadcrumb, notice, proofText, renderNotFound } from '../../ui/components.js';
import { splitBar } from '../../ui/charts.js';
import { escapeHtml, newId } from '../../ui/dom.js';
import { statementHtml } from '../../ui/mathText.js';
import { SCORE_SOURCES } from '../../services/analysis.js';
import { sourceOf } from './analysisHomeView.js';
import { interviewRow, interviewRows, matchList, statusChip, typeChip } from './interviewParts.js';

const fmt = (v) => (v == null ? '–' : Number.isInteger(v) ? String(v) : Number(v).toFixed(1));
const methodName = (id, other = '') => (id === 'other' ? `기타${other ? `(${other})` : ''}` : methodOptionLabel(id) || '–');
const text = (v, empty = '–') => escapeHtml(String(v ?? '').trim() || empty);
const dl = (rows) => `<dl class="read-list an-dl">${rows.map(([dt, dd]) => `<div><dt>${escapeHtml(dt)}</dt><dd>${dd}</dd></div>`).join('')}</dl>`;
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const clock = () => new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

export function renderInterview(root, [studentId]) {
  const { all } = interviewRows();
  const student = all.find((s) => s.id === studentId);
  if (!student) {
    renderNotFound(root);
    return null;
  }
  let status = '';

  const autoQuestions = (row, types) => interviewQuestions(row.a, row.matches, types, { student });

  const draw = ({ focus = null } = {}) => {
    const row = interviewRow(student);
    const sel = selectionOf(student.id);
    if (sel && !recordOf(student.id)) ensureRecord(student.id, autoQuestions(row, sel.types));
    const record = recordOf(student.id);
    const order = all.filter((s) => selectionOf(s.id));
    const i = order.findIndex((s) => s.id === student.id);
    const prev = i > 0 ? order[i - 1] : null;
    const next = i >= 0 ? order[i + 1] : null;
    const sourceLabel = SCORE_SOURCES.find((s) => s.id === sourceOf())?.label;

    root.innerHTML = `<div class="page page--teacher page--interview">
      ${breadcrumb([{ label: '교사 화면', href: '#/teacher' }, { label: '면담', href: '#/teacher/interviews' }, { label: student.pseudonym }])}
      <header class="page-intro">
        <h1>${escapeHtml(student.pseudonym)} 면담${student.sample ? ' <span class="tag tag--proto">예시</span>' : ''}</h1>
        <p class="grade-who"><span class="tag tag--strong">${escapeHtml(sessionLabel(student.session))}</span><span class="tag${consentStatus(student) === 'agreed' ? ' tag--mint' : ''}">연구 동의: ${escapeHtml(CONSENT_LABELS[consentStatus(student)])}</span>${sel ? statusChip(record) : '<span class="tag">면담 대상 아님</span>'}</p>
        <nav class="an-nav" aria-label="다른 면담 대상">
          <a class="button button--ghost button--small" href="#/teacher/analysis/${student.id}">학생 대시보드</a>
          ${prev ? `<a class="button button--ghost button--small" href="#/teacher/interviews/${prev.id}">이전: ${escapeHtml(prev.pseudonym)}</a>` : ''}
          ${next ? `<a class="button button--ghost button--small" href="#/teacher/interviews/${next.id}">다음: ${escapeHtml(next.pseudonym)}</a>` : ''}
        </nav>
      </header>
      <div class="split grade-layout iv-layout">
        <div class="split__main grade-read iv-read" data-iv-read>
          <section class="panel" aria-labelledby="iv-why">
            <h2 id="iv-why" class="section-title">추천 근거</h2>
            <p class="meta">지금 기준값과 점수 출처(${escapeHtml(sourceLabel)})로 계산했습니다.${row.unscored ? ` 점수가 없는 명제 ${row.unscored}개는 유형 1~3을 판정하지 못했습니다.` : ''}</p>
            ${matchList(row.matches)}
            ${sel?.reasons?.length ? `<details class="ref-card"><summary>면담 대상으로 정할 때의 근거</summary><ul class="answer-list">${sel.reasons.map((r) => `<li>${typeChip(r.type)}<span>${escapeHtml(r.text)}</span></li>`).join('')}</ul></details>` : ''}
          </section>
          ${row.a.props.map((p) => propBlock(p)).join('')}
          ${surveyBlock()}
        </div>
        <div class="split__side iv-side">
          ${selectBlock(row, sel)}
          ${sel ? recordForm(record) : ''}
        </div>
      </div>
    </div>`;
    if (focus) root.querySelector(focus)?.focus();
  };

  function propBlock(p) {
    const n = p.propIndex + 1;
    const share = aiShareOf(p.ratioMine);
    const checklist = (ids) => {
      const list = ids ?? [];
      if (list.includes(CHECKLIST_NONE.id)) return escapeHtml(CHECKLIST_NONE.label);
      return list.length ? escapeHtml(list.map((id) => REVISION_CHECKLIST.find((c) => c.id === id)?.label ?? id).join(', ')) : '–';
    };
    const studentMsgs = (p.s2?.chat?.messages ?? []).filter((m) => m.role === 'student');
    const proof = (item, field, label) => {
      if (!item) return '';
      const ink = inkStats(item.ink?.[field]).strokes;
      return `<div class="grade-sub"><h4 class="grade-sub__title">${escapeHtml(label)}</h4>${String(item[field] ?? '').trim() ? proofText(item[field]) : ''}${ink ? `<p class="meta">펜으로 쓴 필기가 있습니다(획 ${ink}개). <a href="#/teacher/analysis/${student.id}">대시보드</a>에서 다시 볼 수 있습니다.</p>` : ''}</div>`;
    };
    // 넓은 화면은 펼치고, 폰·태블릿 세로는 접어서 면담 입력란까지 빨리 가게 한다
    const wide = window.matchMedia?.('(min-width: 56rem)').matches ?? true;
    return `<details class="panel iv-prop" data-iv-prop="${n}"${wide ? ' open' : ''}>
      <summary class="iv-prop__summary"><span class="section-title">명제 ${n}</span><span class="meta">1단계 ${fmt(p.totals[1])}점 → 4단계 ${fmt(p.totals[4])}점, ${escapeHtml(methodName(p.s1?.method, p.s1?.methodOther))}</span></summary>
      <p class="proposition__statement iv-prop__statement">${statementHtml(p.problem?.statement ?? '')}</p>
      <div class="iv-stages">
        <div><h3 class="an-sub">1단계 나의 증명</h3>${dl([
          ['증명법', text(methodName(p.s1?.method, p.s1?.methodOther))],
          ['점수', `${fmt(p.totals[1])}점`],
          ['확신', p.confidence[1] == null ? '–' : `${p.confidence[1]} / 5`],
          ['어려웠던 점·막힌 점', text(p.s1?.stuck)],
        ])}</div>
        <div><h3 class="an-sub">2단계 AI 증명</h3>${dl([
          ['AI가 쓴 증명법', text(methodName(p.s2?.aiMethod, p.s2?.aiMethodOther))],
          ['AI 증명 점수', `${fmt(p.totals[2])}점`],
          ['AI에게 한 질문', studentMsgs.length ? `<ol class="iv-asks">${studentMsgs.map((m) => `<li>${escapeHtml(m.text)}</li>`).join('')}</ol>` : '–'],
          ['대화 태그', p.chat.tags.length ? `<span class="tag-chips">${p.chat.tags.map((t) => `<span class="tag">${escapeHtml(t.label)}${t.n > 1 ? ` ×${t.n}` : ''}</span>`).join('')}</span>` : text(p.chat.tagged ? '붙인 태그 없음' : '태그 전')],
          ['도움이 된 점·특징적인 점', text(p.s2?.notable)],
        ])}</div>
        <div><h3 class="an-sub">3단계 비교 분석</h3>${dl([
          ['더 정확한 증명', text(optionLabel(MORE_ACCURATE_OPTIONS, p.s3?.moreAccurate))],
          ['내 증명에서 보완할 점', checklist(p.s3?.myChecklist)],
          ['막힌 점이 AI 증명으로 해결되었나', text(optionLabel(STUCK_RESOLVED_OPTIONS, p.s3?.stuckResolved))],
          ['활용 계획', text(p.s3?.plan)],
          ['AI에 대한 의견', text(p.s3?.aiOpinion)],
        ])}</div>
        <div><h3 class="an-sub">4단계 최종 증명</h3>${dl([
          ['증명법', text(methodName(p.s4?.method, p.s4?.methodOther))],
          ['점수', `${fmt(p.totals[4])}점`],
          ['반영 비율', p.ratioMine == null ? '–' : `<span class="ratio-cell">${splitBar(p.ratioMine)}<span class="num">나 ${p.ratioMine * 10}% · AI ${share}%</span></span>`],
          ['내 증명에서 쓴 부분', text(p.s4?.usedFromMine)],
          ['AI 증명에서 쓴 부분', text(p.s4?.usedFromAi)],
          ['확신', p.confidence[4] == null ? '–' : `${p.confidence[4]} / 5`],
        ])}</div>
      </div>
      <details class="ref-card"><summary>증명 보기 (1·2·4단계)</summary>
        <div class="grade-proof">${proof(p.s1, 'proof', '1단계 나의 증명')}${proof(p.s2, 'aiProof', '2단계 옮겨 적은 AI 증명')}${proof(p.s4, 'proof', '4단계 최종 증명')}</div>
      </details>
    </details>`;
  }

  function surveyBlock() {
    const texts = postSurveyTexts(student);
    return `<section class="panel" aria-labelledby="iv-survey">
      <h2 id="iv-survey" class="section-title">사후 설문 서술형 답</h2>
      ${texts.length ? dl(texts.map((t) => [t.question, escapeHtml(t.text)])) : '<p class="empty-text">사후 설문의 서술형 답이 없습니다.</p>'}
    </section>`;
  }

  function selectBlock(row, sel) {
    const matched = new Set(row.matches.map((m) => m.type));
    const pills = (checked) => INTERVIEW_TYPES.map((t) => `<label class="pick pick--tag${matched.has(t.id) ? ' is-ai' : ''}"><input type="checkbox" name="selType" value="${t.id}"${checked(t) ? ' checked' : ''}><span>유형 ${t.n} · ${escapeHtml(t.short)}${matched.has(t.id) ? ' <span class="tag">추천</span>' : ''}</span></label>`).join('');
    const noteField = (value) => `<div class="field"><label class="field__label" for="iv-note">유형 6을 고른 이유</label><input type="text" class="field__input" id="iv-note" name="selNote" value="${escapeHtml(value ?? '')}" placeholder="예: 수업에 대한 의견을 자세히 씀"></div>`;
    if (!sel) {
      return `<section class="panel iv-box" aria-labelledby="iv-select">
        <h2 id="iv-select" class="section-title">면담 대상으로 정하기</h2>
        ${notice('eye', '아직 면담 대상이 아닙니다', '면담 이유로 남길 유형을 고르고 정하면 면담 기록을 쓸 수 있습니다. "추천"은 지금 기준에 맞는 유형입니다.')}
        <fieldset class="choice-group"><legend>면담 이유</legend><div class="pick-group__options">${pills((t) => matched.has(t.id))}</div></fieldset>
        ${noteField('')}
        <p class="field__error" data-select-error hidden></p>
        <div class="actions actions--start"><button type="button" class="button button--primary" data-action="select">면담 대상으로 정하기</button></div>
      </section>`;
    }
    return `<section class="panel iv-box" aria-labelledby="iv-select">
      <h2 id="iv-select" class="section-title">면담 이유</h2>
      <fieldset class="choice-group"><legend class="meta">고른 유형 (하나 이상)</legend><div class="pick-group__options">${pills((t) => sel.types.includes(t.id))}</div></fieldset>
      <p class="field__error" data-select-error hidden></p>
      ${sel.types.includes('t6') ? noteField(sel.note) : ''}
    </section>`;
  }

  function recordForm(r) {
    const canFinish = consentComplete(r);
    return `<section class="panel iv-box" aria-labelledby="iv-consent">
        <h2 id="iv-consent" class="section-title">면담 동의 확인</h2>
        <p class="meta">서면 동의서는 종이로 받고, 받은 날짜를 표시합니다. 학생과 보호자 동의를 표시해야 면담을 "완료"로 저장할 수 있습니다.</p>
        <div class="iv-consents">${INTERVIEW_CONSENTS.map((c) => `<div class="iv-consent">
          <label class="check"><input type="checkbox" name="consent" value="${c.id}"${r.consent?.[c.id] ? ' checked' : ''}><span>${escapeHtml(c.label)}${c.required ? ' <span class="field__req">필수</span>' : ''}${c.help ? ` <span class="meta">${escapeHtml(c.help)}</span>` : ''}</span></label>
          <input type="date" class="field__input iv-consent__date" name="consentDate" data-consent="${c.id}" value="${escapeHtml(r.consent?.[c.id] ?? '')}" aria-label="${escapeHtml(c.label)} 받은 날짜"${r.consent?.[c.id] ? '' : ' disabled'}>
        </div>`).join('')}</div>
      </section>
      <section class="panel iv-box" aria-labelledby="iv-info">
        <h2 id="iv-info" class="section-title">면담 정보</h2>
        <div class="iv-info">
          <div class="field"><label class="field__label" for="iv-when">면담 일시</label><input type="datetime-local" class="field__input" id="iv-when" name="scheduledAt" value="${escapeHtml(r.scheduledAt ?? '')}"></div>
          <div class="field"><label class="field__label" for="iv-who">면담자</label><input type="text" class="field__input" id="iv-who" name="interviewer" value="${escapeHtml(r.interviewer ?? '')}" placeholder="예: 담당 교사"></div>
        </div>
        <fieldset class="choice-group"><legend>상태</legend><div class="pick-group__options">${INTERVIEW_STATUS.map((s) => {
          const off = s.id === 'done' && !canFinish && r.status !== 'done';
          return `<label class="pick pick--tag${off ? ' is-unavailable' : ''}"><input type="radio" name="status" value="${s.id}"${r.status === s.id ? ' checked' : ''}${off ? ' disabled aria-describedby="iv-done-help"' : ''}><span>${escapeHtml(s.label)}</span></label>`;
        }).join('')}</div></fieldset>
        ${canFinish ? '' : '<p class="field__help" id="iv-done-help">학생 면담 동의와 보호자 동의를 표시하면 "완료"를 고를 수 있습니다.</p>'}
      </section>
      <section class="panel iv-box" aria-labelledby="iv-qs">
        <div class="section-head">
          <h2 id="iv-qs" class="section-title">질문 (${r.questions.length})</h2>
          <button type="button" class="button button--ghost button--small" data-action="regen">자동 질문 다시 넣기</button>
        </div>
        <p class="meta">자동 질문은 고른 유형과 학생 기록으로 만든 예시입니다. 글을 고치거나 빼고, 질문을 더하세요. 메모는 쓰는 대로 저장됩니다.</p>
        ${r.questions.length ? `<ol class="iv-questions">${r.questions.map((q, i) => questionItem(q, i, r.questions.length)).join('')}</ol>` : '<p class="empty-text">질문이 없습니다. 아래에서 더하거나 자동 질문을 다시 넣으세요.</p>'}
        <div class="field iv-add">
          <label class="field__label" for="iv-new-q">질문 더하기</label>
          <textarea class="field__input" id="iv-new-q" name="newQuestion" rows="2" placeholder="예: 최종 증명을 쓸 때 가장 오래 고민한 줄은 어디인가요?"></textarea>
          <p class="field__error" data-new-q-error hidden>질문을 쓰세요.</p>
          <div class="actions actions--start"><button type="button" class="button button--secondary button--small" data-action="add-q">질문 더하기</button></div>
        </div>
      </section>
      <section class="panel iv-box" aria-labelledby="iv-memo-h">
        <h2 id="iv-memo-h" class="section-title">전체 메모</h2>
        <div class="field"><label class="field__label visually-hidden" for="iv-memo">전체 메모</label><textarea class="field__input" id="iv-memo" name="memo" rows="5" placeholder="면담 분위기, 질문 밖에서 나온 이야기, 후속 확인할 것">${escapeHtml(r.memo ?? '')}</textarea></div>
        <p class="save-status" data-iv-status role="status" aria-live="polite">${escapeHtml(status)}</p>
      </section>`;
  }

  function questionItem(q, i, total) {
    const t = q.type ? interviewType(q.type) : null;
    const prop = q.problemId ? interviewRow(student).a.props.find((p) => p.problemId === q.problemId) : null;
    return `<li class="iv-q" data-q="${escapeHtml(q.id)}">
      <p class="iv-q__meta"><span class="num iv-q__num">${i + 1}</span><span class="tag${q.source === 'teacher' ? ' tag--strong' : ''}">${q.source === 'teacher' ? '교사 질문' : '자동 질문'}</span>${t ? `<span class="tag">유형 ${t.n}</span>` : ''}${prop ? `<span class="tag">명제 ${prop.propIndex + 1}</span>` : ''}</p>
      <div class="field"><label class="field__label" for="q-text-${i}">질문</label><textarea class="field__input" id="q-text-${i}" name="qText" rows="3">${escapeHtml(q.text)}</textarea></div>
      <div class="field"><label class="field__label" for="q-ans-${i}">학생 답 메모</label><textarea class="field__input" id="q-ans-${i}" name="qAnswer" rows="3" placeholder="학생이 한 말을 짧게 적어 두세요">${escapeHtml(q.answer ?? '')}</textarea></div>
      <div class="actions actions--start iv-q__actions">
        <button type="button" class="button button--ghost button--small" data-action="q-up"${i === 0 ? ' disabled' : ''}>위로</button>
        <button type="button" class="button button--ghost button--small" data-action="q-down"${i === total - 1 ? ' disabled' : ''}>아래로</button>
        <button type="button" class="button button--ghost button--small" data-action="q-remove">빼기</button>
      </div>
    </li>`;
  }

  const saved = (msg = `저장함 ${clock()}`) => {
    status = msg;
    const el = root.querySelector('[data-iv-status]');
    if (el) el.textContent = msg;
  };
  const redraw = (focus = null) => {
    const y = window.scrollY;
    draw({ focus });
    window.scrollTo(0, y);
  };

  const onInput = (event) => {
    const t = event.target;
    const qId = t.closest('[data-q]')?.dataset.q;
    if (t.name === 'qText' && qId) {
      if (t.value.trim()) updateQuestion(student.id, qId, { text: t.value });
    } else if (t.name === 'qAnswer' && qId) updateQuestion(student.id, qId, { answer: t.value });
    else if (t.name === 'memo' || t.name === 'interviewer') updateRecord(student.id, { [t.name]: t.value });
    else if (t.name === 'selNote' && selectionOf(student.id)) updateSelection(student.id, { note: t.value.trim() });
    else return;
    saved();
  };

  const onChange = (event) => {
    const t = event.target;
    if (t.name === 'consent') {
      updateRecord(student.id, { consent: { [t.value]: t.checked ? today() : null } });
      saved();
      return redraw(`input[name="consent"][value="${t.value}"]`);
    }
    if (t.name === 'consentDate') {
      if (t.value) updateRecord(student.id, { consent: { [t.dataset.consent]: t.value } });
      return saved();
    }
    if (t.name === 'scheduledAt') {
      updateRecord(student.id, { scheduledAt: t.value });
      return saved();
    }
    if (t.name === 'status') {
      const ok = updateRecord(student.id, { status: t.value });
      saved(ok ? `상태: ${INTERVIEW_STATUS.find((s) => s.id === t.value).label} (${clock()})` : '학생·보호자 동의를 먼저 표시하세요.');
      return redraw(`input[name="status"][value="${recordOf(student.id).status}"]`);
    }
    if (t.name === 'selType' && selectionOf(student.id)) {
      const types = [...root.querySelectorAll('input[name="selType"]:checked')].map((b) => b.value);
      const err = root.querySelector('[data-select-error]');
      if (!types.length) {
        t.checked = true;
        err.textContent = '유형을 하나 이상 고르세요. 면담 대상에서 빼려면 면담 목록에서 빼세요.';
        err.hidden = false;
        return;
      }
      updateSelection(student.id, { types });
      saved();
      redraw(`input[name="selType"][value="${t.value}"]`);
    }
  };

  const onClick = (event) => {
    const btn = event.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const qId = btn.closest('[data-q]')?.dataset.q;
    if (action === 'select') {
      const types = [...root.querySelectorAll('input[name="selType"]:checked')].map((b) => b.value);
      const note = root.querySelector('[name="selNote"]')?.value.trim() ?? '';
      const err = root.querySelector('[data-select-error]');
      if (!types.length || (types.includes('t6') && !note)) {
        err.textContent = !types.length ? '유형을 하나 이상 고르세요.' : '유형 6을 고른 이유를 쓰세요.';
        err.hidden = false;
        return;
      }
      const row = interviewRow(student);
      const reasons = [...row.matches.filter((m) => types.includes(m.type)).map((m) => ({ type: m.type, problemId: m.problemId, text: m.text })), ...(types.includes('t6') ? [{ type: 't6', problemId: null, text: note }] : [])];
      selectStudent(student.id, { types, reasons, note });
      saved('면담 대상으로 정했습니다.');
      return redraw('input[name="consent"]');
    }
    if (action === 'regen') {
      const before = recordOf(student.id).questions.length;
      addQuestions(student.id, autoQuestions(interviewRow(student), selectionOf(student.id).types));
      const added = recordOf(student.id).questions.length - before;
      saved(added ? `자동 질문 ${added}개를 더했습니다.` : '빠진 자동 질문이 없습니다.');
      return redraw('[data-action="regen"]');
    }
    if (action === 'add-q') {
      const box = root.querySelector('[name="newQuestion"]');
      const value = box.value.trim();
      if (!value) {
        root.querySelector('[data-new-q-error]').hidden = false;
        box.setAttribute('aria-invalid', 'true');
        box.focus();
        return;
      }
      addQuestions(student.id, [{ id: newId('tq'), text: value, source: 'teacher', type: null, problemId: null }]);
      saved();
      return redraw('[name="newQuestion"]');
    }
    if (!qId) return;
    if (action === 'q-up' || action === 'q-down') {
      moveQuestion(student.id, qId, action === 'q-up' ? -1 : 1);
      saved();
      return redraw(`[data-q="${qId}"] [data-action="${action}"]:not(:disabled), [data-q="${qId}"] textarea`);
    }
    if (action === 'q-remove') {
      const q = recordOf(student.id).questions.find((x) => x.id === qId);
      if (String(q?.answer ?? '').trim() && !window.confirm('이 질문에 쓴 학생 답 메모도 함께 지워집니다. 뺄까요?')) return;
      removeQuestion(student.id, qId);
      saved();
      redraw('#iv-qs');
    }
  };

  draw();
  root.addEventListener('input', onInput);
  root.addEventListener('change', onChange);
  root.addEventListener('click', onClick);
  return () => {
    root.removeEventListener('input', onInput);
    root.removeEventListener('change', onChange);
    root.removeEventListener('click', onClick);
  };
}
