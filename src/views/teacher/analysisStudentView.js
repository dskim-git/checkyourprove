// 교사 화면: 학생별 분석 대시보드 (구현 3-3)
// 위: 요약 수치, 명제별 1·2·4단계 점수, 루브릭 기준별 변화, 단계별 작업 시간
// 아래: 명제마다 수집한 기록 전부 — 점수(출처·AI 제안·완성도·실제 증명법·확신), 증명법 변화, 막힌 점의 흐름,
//       자기 진단과 교사 채점 비교(+4단계 보완 여부), AI 대화(질문·태그·옮겨 적기), 3단계 분석, 4단계 반영, 작성 과정, 증명 원문

import {
  CONFIDENCE_LABELS, MORE_ACCURATE_OPTIONS, STUCK_RESOLVED_OPTIONS, methodOptionLabel, optionLabel,
} from '../../data/research.js';
import { ACTUAL_METHOD_OPTIONS, COMPLETENESS_OPTIONS, DEFAULT_RUBRIC, RUBRIC_TOTAL, STUCK_OVERCOME_OPTIONS } from '../../data/rubric.js';
import { getProblem } from '../../data/problems/index.js';
import { analyzeStudent, scoreFor, SCORE_SOURCES } from '../../services/analysis.js';
import { getGrading, updateGradingSettings } from '../../state/gradingStore.js';
import { conversationKey, targetKey } from '../../state/researchRoster.js';
import { escapeHtml, formatDateTime } from '../../ui/dom.js';
import { breadcrumb, renderNotFound } from '../../ui/components.js';
import { barList, bindChartTips, dotPlot, splitBar, statTiles } from '../../ui/charts.js';
import { mountInkViews } from '../../ui/inkCanvas.js';
import { statementHtml } from '../../ui/mathText.js';
import { readProofInk } from '../research/researchParts.js';
import { analysisStudents, sourceOf, sourcePicker } from './analysisHomeView.js';
import { sessionLabel } from '../../state/sessionStore.js';
import { surveyDomains, surveyScale } from '../../data/surveyDefaults.js';
import { CONSENT_LABELS, consentStatus, domainMeans, responsesOf } from '../../services/surveyAnalysis.js';
import { findSurvey } from '../../state/surveyStore.js';
import { PRINCIPLE_ITEMS, PRINCIPLE_PARTS } from '../../data/principleActivity.js';
import { principleScore } from '../../services/principleAnalysis.js';
import { gradedBy, openChatPopup, openGradePopup, taggedBy } from './recordPopups.js';
import { selectionOf } from '../../state/interviewStore.js';

const fmt = (v) => (v == null ? '–' : Number.isInteger(v) ? String(v) : Number(v).toFixed(1));
const signed = (v) => (v == null ? '–' : `${v > 0 ? '+' : ''}${fmt(v)}`);
const methodName = (id, other = '') => (id === 'other' ? `기타${other ? `(${other})` : ''}` : methodOptionLabel(id) || '–');
const dl = (rows) => `<dl class="read-list an-dl">${rows.map(([dt, dd]) => `<div><dt>${escapeHtml(dt)}</dt><dd>${dd}</dd></div>`).join('')}</dl>`;
const text = (v, empty = '–') => escapeHtml(String(v ?? '').trim() || empty);

export function renderAnalysisStudent(root, [studentId]) {
  let disposeTips = () => {};
  let disposeInk = () => {};

  const draw = () => {
    disposeTips();
    disposeInk();
    const g = getGrading();
    const source = sourceOf();
    const students = analysisStudents(g).included.filter((s) => s.record.stages?.['1']?.submittedAt);
    const index = students.findIndex((s) => s.id === studentId);
    const student = students[index];
    if (!student) {
      renderNotFound(root);
      return;
    }
    const a = analyzeStudent(student, source);
    const prev = students[index - 1];
    const next = students[index + 1];
    const sourceLabel = SCORE_SOURCES.find((s) => s.id === source)?.label;

    const scoreChart = dotPlot({
      title: '명제별 점수 (10점 만점)',
      rows: a.props.map((p) => ({ label: `명제 ${p.propIndex + 1}`, values: p.totals })),
      max: RUBRIC_TOTAL,
      note: '같은 줄의 점 사이를 잇는 선이 길수록 단계 사이의 차이가 큽니다.',
    });
    const criteriaChart = dotPlot({
      title: '루브릭 기준별 점수 (명제 평균, 만점 대비 %)',
      rows: DEFAULT_RUBRIC.map((c) => ({ label: c.title, values: Object.fromEntries([1, 2, 4].map((n) => [n, a.criteria[c.id][n] == null ? null : Math.round(a.criteria[c.id][n] * 100)])) })),
      max: 100,
      unit: '%',
      ticks: [0, 25, 50, 75, 100],
    });
    const timeChart = barList({
      title: '단계별 작업 시간 (화면을 보고 있던 시간)',
      unit: '분',
      rows: a.stages.map((st) => ({ label: `${st.n}단계`, value: st.minutes ?? 0, sub: `${st.submittedAt ? `${formatDateTime(st.submittedAt)} 제출` : '제출 전'}, 화면 이탈 ${st.leaves}회` })),
    });

    root.innerHTML = `<div class="page page--teacher page--analysis">
      ${breadcrumb([{ label: '교사 화면', href: '#/teacher' }, { label: '연구 분석', href: '#/teacher/analysis' }, { label: student.pseudonym }])}
      <header class="page-intro">
        <h1>${escapeHtml(student.pseudonym)}${student.sample ? ' <span class="tag tag--proto">예시</span>' : ''}</h1>
        <p class="grade-who"><span class="tag tag--strong">${escapeHtml(sessionLabel(student.session))}</span><span class="tag${consentStatus(student) === 'agreed' ? ' tag--mint' : ''}">연구 동의: ${escapeHtml(CONSENT_LABELS[consentStatus(student)])}</span></p>
        <p class="lead">명제 ${a.props.length}개의 1~4단계 기록입니다. 점수 출처: ${escapeHtml(sourceLabel)}.</p>
        <nav class="an-nav" aria-label="다른 학생">
          <a class="button button--secondary button--small" href="#/teacher/interviews/${student.id}">면담 화면${selectionOf(student.id) ? ' (면담 대상)' : ''}</a>
          ${prev ? `<a class="button button--ghost button--small" href="#/teacher/analysis/${prev.id}">이전 학생: ${escapeHtml(prev.pseudonym)}</a>` : ''}
          ${next ? `<a class="button button--ghost button--small" href="#/teacher/analysis/${next.id}">다음 학생: ${escapeHtml(next.pseudonym)}</a>` : ''}
        </nav>
      </header>
      <form class="settings-form" data-analysis-settings novalidate>${sourcePicker(source)}</form>

      <section class="panel" aria-labelledby="st-summary">
        <h2 id="st-summary" class="section-title">한눈에 보기</h2>
        ${statTiles([
          { label: '나의 증명 (1단계)', value: fmt(a.avg[1]), sub: '점, 명제 평균' },
          { label: 'AI 증명 (2단계)', value: fmt(a.avg[2]), sub: '점' },
          { label: '최종 증명 (4단계)', value: fmt(a.avg[4]), sub: '점' },
          { label: '향상 (최종 − 나)', value: signed(a.avg.improve), sub: '점' },
          { label: '격차 (AI − 나)', value: signed(a.avg.gap), sub: '점' },
          { label: '최종 증명의 나의 반영', value: a.avg.ratioMine == null ? '–' : `${Math.round(a.avg.ratioMine * 10)}%`, sub: 'AI 반영은 나머지' },
          { label: '확신 정도 1 → 2 → 4', value: `${fmt(a.avg.confidence[1])} → ${fmt(a.avg.confidence[2])} → ${fmt(a.avg.confidence[4])}`, sub: '5점 만점' },
          { label: 'AI에게 한 질문', value: `${a.questions}개`, sub: a.offTopic ? `증명과 무관 ${a.offTopic}개` : '모두 증명 관련' },
          { label: '전체 작업 시간', value: `${fmt(a.totalMinutes)}분` },
        ])}
      </section>

      <section class="panel" aria-labelledby="st-charts">
        <h2 id="st-charts" class="section-title">점수 변화</h2>
        <div class="an-charts">${scoreChart}${criteriaChart}</div>
        ${timeChart}
      </section>

      ${principleBlock(student)}
      ${surveyBlock(student)}

      ${a.props.map((p) => propSection(student, p, source)).join('')}
    </div>`;
    disposeTips = bindChartTips(root);
    disposeInk = mountInkViews(root, (key) => {
      const [stage, problemId, field] = key.split('|');
      return student.record.stages?.[stage]?.items?.[problemId]?.ink?.[field] ?? null;
    });
  };

  /** 원리 활동 결과 */
  function principleBlock(student) {
    const sc = principleScore(student);
    const pr = student.record.principle;
    if (!sc) return `<section class="panel" aria-labelledby="st-principle"><h2 id="st-principle" class="section-title">"AI는 어떻게 답할까?" 원리 활동</h2><p class="empty-text">기록이 없습니다.</p></section>`;
    const rows = PRINCIPLE_ITEMS.map((it, i) => {
      const a = pr.answers?.[it.id];
      const part = PRINCIPLE_PARTS.find((p) => p.id === it.part);
      return `<tr><th scope="row">${i + 1}. ${escapeHtml(it.prompt)}</th><td>${escapeHtml(part.title)}</td><td>${a ? escapeHtml(it.options[a.choice]) : '–'}</td><td>${a ? (a.correct ? '<span class="tag tag--mint">맞음</span>' : `<span class="tag tag--warn">틀림</span> <span class="meta">정답: ${escapeHtml(it.options[it.answer])}</span>`) : '–'}</td><td class="num">${a?.ms != null ? `${Math.round(a.ms / 1000)}초` : '–'}</td></tr>`;
    }).join('');
    return `<section class="panel" aria-labelledby="st-principle">
      <h2 id="st-principle" class="section-title">"AI는 어떻게 답할까?" 원리 활동</h2>
      <p class="meta">${sc.finished ? '마침' : '진행 중'}, 처음 고른 답 ${sc.correct} / ${sc.total} 정답, ${sc.minutes}분. 마무리: ${escapeHtml(sc.reflection || '–')}</p>
      <details class="ref-card"><summary>문항별 응답 보기</summary>
        <div class="table-wrap"><table class="data-table grade-table">
          <thead><tr><th scope="col">문항</th><th scope="col">묶음</th><th scope="col">처음 고른 답</th><th scope="col">결과</th><th scope="col">걸린 시간</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
      </details>
    </section>`;
  }

  /** 사전·사후 설문: 영역 평균, 문항별 응답 */
  function surveyBlock(student) {
    const { pre, post } = responsesOf(student);
    const survey = findSurvey(pre?.surveyId ?? post?.surveyId);
    if (!survey) {
      return `<section class="panel" aria-labelledby="st-survey"><h2 id="st-survey" class="section-title">사전·사후 설문</h2><p class="empty-text">제출한 설문이 없습니다.</p></section>`;
    }
    const dm = domainMeans(survey, student);
    const { points, labels: SCALE_LABELS } = surveyScale(survey);
    const ans = (q, r) => {
      const v = r?.answers?.[q.id];
      if (v == null || v === '') return '–';
      return q.type === 'scale' ? `<span class="num">${v}</span> <span class="meta">${escapeHtml(SCALE_LABELS[v - 1])}</span>` : escapeHtml(String(v));
    };
    const change = (q) => (q.type === 'scale' && pre && post && pre.answers[q.id] != null && post.answers[q.id] != null
      ? (() => { const d = post.answers[q.id] - pre.answers[q.id]; return `<span class="num">${d > 0 ? '+' : ''}${d}</span>`; })()
      : '');
    const series = [{ key: 'pre', label: '사전', short: '사전', cls: 'mine' }, { key: 'post', label: '사후', short: '사후', cls: 'final' }];
    return `<section class="panel" aria-labelledby="st-survey">
      <h2 id="st-survey" class="section-title">사전·사후 설문</h2>
      <p class="meta">${escapeHtml(survey.title)}. 사전 ${pre ? `${escapeHtml(formatDateTime(pre.submittedAt))} 제출, ${Math.round((pre.activeMs ?? 0) / 60000)}분` : '제출 전'}, 사후 ${post ? `${escapeHtml(formatDateTime(post.submittedAt))} 제출, ${Math.round((post.activeMs ?? 0) / 60000)}분` : '제출 전'}</p>
      ${dotPlot({ title: `하위 요인별 평균 (${points}점 척도, 역문항 바꿈)`, series, max: points, min: 1, ticks: Array.from({ length: points }, (_, k) => k + 1), unit: '점', rows: surveyDomains(survey).filter((d) => dm.pre?.[d.id] != null || dm.post?.[d.id] != null).map((d) => ({ label: d.label, values: { pre: dm.pre?.[d.id] ?? null, post: dm.post?.[d.id] ?? null } })) })}
      <div class="table-wrap" role="region" aria-label="설문 응답" tabindex="0">
        <table class="data-table grade-table">
          <thead><tr><th scope="col">문항</th><th scope="col">사전</th><th scope="col">사후</th><th scope="col">변화</th></tr></thead>
          <tbody>${survey.questions.map((q, i) => `<tr><th scope="row">${i + 1}. ${escapeHtml(q.text)}${q.reverse ? ' <span class="tag">역문항</span>' : ''}</th><td>${ans(q, pre)}</td><td>${ans(q, post)}</td><td>${change(q)}</td></tr>`).join('')}</tbody>
        </table>
      </div>
    </section>`;
  }

  function propSection(student, p, source) {
    const n = p.propIndex + 1;
    const id = `prop-${n}`;
    const stages = [[1, '1단계 나의 증명', p.s1], [2, '2단계 AI 증명', p.s2], [4, '4단계 최종 증명', p.s4]];

    // 점수 표: 출처 점수, (교사 점수일 때) AI 제안, 완성도, 실제 증명법, 고른 증명법, 확신
    const scoreRows = stages.map(([stage, label, item]) => {
      const sc = p.score[stage];
      const ai = source === 'ai' ? null : scoreFor(student, stage, p.problemId, 'ai');
      const chosen = stage === 2 ? methodName(item?.aiMethod, item?.aiMethodOther) : methodName(item?.method, item?.methodOther);
      const conf = p.confidence[stage];
      return `<tr>
        <th scope="row">${escapeHtml(label)}</th>
        <td class="num">${sc ? `<strong>${fmt(sc.total)}</strong>` : '<span class="meta">채점 전</span>'} ${gradedBy(student, stage, p.problemId).length
          ? `<button type="button" class="an-link link-button" data-popup="grade" data-stage="${stage}" data-problem="${p.problemId}">채점 보기</button>`
          : `<a class="an-link" href="#/teacher/grading/${targetKey(student.id, stage, p.problemId)}">채점하기</a>`}</td>
        ${source === 'ai' ? '' : `<td class="num">${ai ? fmt(ai.total) : '–'}</td>`}
        <td>${sc?.completeness ? escapeHtml(optionLabel(COMPLETENESS_OPTIONS, sc.completeness)) : '–'}</td>
        <td>${escapeHtml(chosen)}</td>
        <td>${sc?.actualMethod ? escapeHtml(optionLabel(ACTUAL_METHOD_OPTIONS, sc.actualMethod)) : '–'}</td>
        <td>${conf == null ? '–' : `<span class="num">${conf}</span> <span class="meta">${escapeHtml(CONFIDENCE_LABELS[conf - 1])}</span>`}</td>
      </tr>`;
    }).join('');

    // 자기 진단 ↔ 교사 채점
    const verdict = (checked, lacks) => {
      if (lacks == null) return '<span class="meta">채점 전</span>';
      if (checked && lacks) return '<span class="tag tag--mint">같은 판단</span>';
      if (!checked && !lacks) return '<span class="tag tag--mint">같은 판단</span>';
      if (checked && !lacks) return '<span class="tag">학생만 부족하다고 봄</span>';
      return '<span class="tag tag--warn">학생이 놓침</span>';
    };
    const selfRows = p.selfCheck.map((c) => `<tr>
      <th scope="row">${escapeHtml(c.label)} <span class="meta">↔ ${escapeHtml(c.criterion)}</span></th>
      <td>${c.myChecked ? '체크함' : '–'}</td><td class="num">${c.myScore == null ? '–' : `${fmt(c.myScore)} / ${c.max}`}</td><td>${verdict(c.myChecked, c.myLacks)}</td>
      <td>${c.myChecked ? escapeHtml(p.revisions[c.id] === 'fixed' ? '보완됨' : p.revisions[c.id] === 'not' ? '보완 안 됨' : '확인 전') : '–'}</td>
      <td>${c.aiChecked ? '체크함' : '–'}</td><td class="num">${c.aiScore == null ? '–' : `${fmt(c.aiScore)} / ${c.max}`}</td><td>${verdict(c.aiChecked, c.aiLacks)}</td>
    </tr>`).join('');

    const tagsHtml = p.chat.tags.length
      ? `<ul class="tag-list">${p.chat.tags.map((t) => `<li class="tag">${escapeHtml(t.label)}${t.n > 1 ? ` ${t.n}` : ''}</li>`).join('')}</ul>`
      : `<span class="meta">${p.chat.tagged ? '붙인 태그 없음' : '아직 태그를 붙이지 않음'}</span>`;
    const transcript = p.transcript.check === 'teacher' ? '펜으로 옮겨 적음(교사 확인)' : p.transcript.check === 'text' ? `글로 옮겨 적음, 글자 일치 ${p.transcript.match == null ? '–' : `${Math.round(p.transcript.match * 100)}%`}` : '–';

    const processRows = p.process.map((pr) => `<tr>
      <th scope="row">${pr.n}단계</th>
      <td class="num">${fmt(pr.minutes)}분</td>
      <td>${pr.firstInputAt ? escapeHtml(formatDateTime(pr.firstInputAt)) : '–'}</td>
      <td class="num">${pr.inputs} / ${pr.deletes}</td>
      <td>${pr.mode == null ? '–' : pr.mode === 'pen' ? `펜 (${pr.inkStrokes}획)` : pr.inkStrokes ? `키보드 + 펜 ${pr.inkStrokes}획` : '키보드'}${pr.modeChanges ? ` <span class="meta">전환 ${pr.modeChanges}회</span>` : ''}</td>
      <td class="num">${pr.snapshots}</td>
      <td class="num">${pr.n === 2 ? `${p.chat.pasteAttempts} / ${p.chat.tabSwitches}` : '–'}</td>
    </tr>`).join('');

    return `<section class="panel an-prop" aria-labelledby="${id}">
      <div class="section-head"><h2 id="${id}" class="section-title">명제 ${n} ${escapeHtml(p.problem?.title ?? '')}</h2>
        <span class="an-prop__delta">향상 <strong class="num">${signed(p.improve)}</strong>, 격차 <strong class="num">${signed(p.gap)}</strong></span></div>
      <p class="an-statement">${statementHtml(p.problem?.statement ?? '')}</p>

      <h3 class="an-sub">점수와 증명법, 확신</h3>
      <div class="table-wrap" role="region" aria-label="명제 ${n} 점수" tabindex="0">
        <table class="data-table grade-table">
          <thead><tr><th scope="col">단계</th><th scope="col">점수 (${escapeHtml(SCORE_SOURCES.find((s) => s.id === source)?.label)})</th>${source === 'ai' ? '' : '<th scope="col">AI 제안</th>'}<th scope="col">완성도</th><th scope="col">학생이 고른 증명법</th><th scope="col">실제 증명법(채점)</th><th scope="col">확신 정도</th></tr></thead>
          <tbody>${scoreRows}</tbody>
        </table>
      </div>
      <p class="meta">증명법을 바꾼 기록: ${p.methods.changes}회 (1단계 ${escapeHtml(methodName(p.methods[1]))} → 4단계 ${escapeHtml(methodName(p.methods[4]))})</p>

      <div class="an-grid">
        <div class="an-block">
          <h3 class="an-sub">막힌 점의 흐름</h3>
          <ol class="an-flow">
            <li><span class="meta">1단계 막힌 점</span>${text(p.stuck.text)}</li>
            <li><span class="meta">3단계 학생 판단</span>${text(optionLabel(STUCK_RESOLVED_OPTIONS, p.stuck.resolved))}</li>
            <li><span class="meta">4단계 교사 확인</span>${text(optionLabel(STUCK_OVERCOME_OPTIONS, p.stuck.overcome), '확인 전')}</li>
          </ol>
        </div>
        <div class="an-block">
          <h3 class="an-sub">4단계 최종 증명</h3>
          ${dl([
            ['반영 비율', p.ratioMine == null ? '–' : `<span class="ratio-cell">${splitBar(p.ratioMine)}<span>나의 답변 ${p.ratioMine * 10}%, AI의 답변 ${100 - p.ratioMine * 10}%</span></span>`],
            ['나의 증명에서 가져온 부분', text(p.s4?.usedFromMine)],
            ['AI의 증명에서 가져온 부분', text(p.s4?.usedFromAi)],
          ])}
        </div>
      </div>

      <h3 class="an-sub">자기 진단(3단계 체크리스트)과 교사 채점</h3>
      <p class="meta">학생이 "보완할 점"으로 체크한 항목과, 짝이 되는 루브릭 기준의 점수가 만점보다 낮은지를 비교합니다.${p.noneChecked.mine ? ' 내 증명에는 "보완할 점을 찾지 못했다"를 골랐습니다.' : ''}${p.noneChecked.ai ? ' AI 증명에는 "보완할 점을 찾지 못했다"를 골랐습니다.' : ''}</p>
      <div class="table-wrap" role="region" aria-label="명제 ${n} 자기 진단" tabindex="0">
        <table class="data-table grade-table">
          <thead>
            <tr><th scope="col" rowspan="2">체크리스트 ↔ 기준</th><th scope="colgroup" colspan="4">내 증명 (1단계)</th><th scope="colgroup" colspan="3">AI 증명 (2단계)</th></tr>
            <tr><th scope="col">학생</th><th scope="col">교사 점수</th><th scope="col">비교</th><th scope="col">4단계 보완</th><th scope="col">학생</th><th scope="col">교사 점수</th><th scope="col">비교</th></tr>
          </thead>
          <tbody>${selfRows}</tbody>
        </table>
      </div>

      <div class="an-grid">
        <div class="an-block">
          <h3 class="an-sub">2단계 AI 대화</h3>
          ${dl([
            ['질문', `${p.chat.questions}개${p.chat.offTopic ? `, 증명과 무관 ${p.chat.offTopic}개` : ''}`],
            ['증명 도움 답', `${p.chat.proofHelp}개${p.chat.proofHelpAt ? ` (처음 ${escapeHtml(formatDateTime(p.chat.proofHelpAt))})` : ''}`],
            ['대화 태그', `${tagsHtml} ${taggedBy(student, p.problemId).length
              ? `<button type="button" class="an-link link-button" data-popup="chat" data-problem="${p.problemId}">대화 보기</button>`
              : `<a class="an-link" href="#/teacher/chats/${conversationKey(student.id, p.problemId)}">태그 붙이기</a>`}`],
            ['옮겨 적기', `${escapeHtml(transcript)}${p.transcript.teacher ? `, 교사: ${p.transcript.teacher === 'ok' ? '같음' : '오류 있음'}` : ''}`],
            ['AI 답변에서 특징적인 점', text(p.s2?.notable)],
          ])}
        </div>
        <div class="an-block">
          <h3 class="an-sub">3단계 비교 분석</h3>
          ${dl([
            ['더 정확하다고 본 증명', text(optionLabel(MORE_ACCURATE_OPTIONS, p.s3?.moreAccurate))],
            ['공통점과 차이점', text(p.s3?.compareNote)],
            ['내 증명이 나은 점', text(p.s3?.myAdvantage)],
            ['AI 증명에서 보완할 부분', text(p.s3?.aiIssues)],
            ['AI에서 도움이 된 점', text(p.s3?.aiHelpful)],
            ['최종 증명 활용 계획', text(p.s3?.plan)],
            ['AI에 대한 의견', text(p.s3?.aiOpinion)],
          ])}
        </div>
      </div>

      <h3 class="an-sub">작성 과정</h3>
      <div class="table-wrap" role="region" aria-label="명제 ${n} 작성 과정" tabindex="0">
        <table class="data-table grade-table">
          <thead><tr><th scope="col">단계</th><th scope="col">작업 시간</th><th scope="col">첫 입력</th><th scope="col">입력 / 지우기</th><th scope="col">입력 방식</th><th scope="col">중간 저장본</th><th scope="col">붙여넣기 / 탭 이동</th></tr></thead>
          <tbody>${processRows}</tbody>
        </table>
      </div>

      <details class="ref-card an-proofs">
        <summary>증명 원문 보기 (1·2·4단계)</summary>
        <div class="an-proofs__grid">
          ${stages.map(([stage, label, item]) => {
            const field = stage === 2 ? 'aiProof' : 'proof';
            return `<div class="an-proofs__col"><h4 class="an-sub">${escapeHtml(label)}</h4>${item ? readProofInk(item[field], item.ink?.[field], `${stage}|${p.problemId}|${field}`) : '<p class="empty-text">기록 없음</p>'}</div>`;
          }).join('')}
        </div>
      </details>
    </section>`;
  }

  const onChange = (event) => {
    if (event.target.name === 'analysisSource') {
      updateGradingSettings({ analysisSource: event.target.value });
      draw();
    }
  };

  // 채점·태그를 마친 항목은 화면을 옮기지 않고 팝업으로 본다.
  let closePopup = null;
  const onClick = (event) => {
    const btn = event.target.closest('[data-popup]');
    if (!btn) return;
    const student = analysisStudents().all.find((s) => s.id === studentId);
    const problem = getProblem(btn.dataset.problem);
    closePopup = btn.dataset.popup === 'grade'
      ? openGradePopup(student, Number(btn.dataset.stage), btn.dataset.problem, problem)
      : openChatPopup(student, btn.dataset.problem, problem);
  };

  draw();
  root.addEventListener('change', onChange);
  root.addEventListener('click', onClick);
  return () => {
    disposeTips();
    disposeInk();
    root.removeEventListener('change', onChange);
    root.removeEventListener('click', onClick);
    closePopup?.();
  };
}

