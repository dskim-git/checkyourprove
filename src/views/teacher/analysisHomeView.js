// 교사 화면: 연구 분석 개요 (구현 3-3)
// 점수 출처 고르기, 학급 요약 수치, 격차(AI − 나)와 향상(최종 − 나)의 관계,
// 학급 단위 분석(AI 답변 수용 정도, 학생이 찾은 부족한 점 통계, 개방형 답변 워드클라우드), 학생 목록(대시보드로 이동), CSV 내려받기.
// TODO(구현 4): 사전·사후 설문 차이를 학급 요약에 더한다.

import { validSource } from '../../services/analysis.js';
import { analysisCsv, analyzeStudent, classSummary, scoreSources, sourceLabel } from '../../services/analysis.js';
import { getGrading, updateGradingSettings } from '../../state/gradingStore.js';
import { researchStudents } from '../../state/researchRoster.js';
import { escapeHtml } from '../../ui/dom.js';
import { breadcrumb, notice } from '../../ui/components.js';
import { handleScopeEvent, scopePicker, scopeText } from './sessionScope.js';
import { forResearch, isResearchIncluded, surveyCsv, surveyStats, surveysInUse } from '../../services/surveyAnalysis.js';
import { principleStats } from '../../services/principleAnalysis.js';
import { surveyScale } from '../../data/surveyDefaults.js';
import { className as classNameOf, sessionLabel } from '../../state/sessionStore.js';
import { barList, bindChartTips, columns, dotPlot, scatter, splitBar, statTiles, wordCloud } from '../../ui/charts.js';
import { acceptanceStats, checklistStats, isNoneAnswer, OPEN_QUESTIONS, openAnswers, wordFrequencies } from '../../services/classInsights.js';

const fmt = (v, digits = 1) => (v == null ? '–' : Number(v).toFixed(digits).replace(/\.0$/, ''));
const signed = (v) => (v == null ? '–' : `${v > 0 ? '+' : ''}${fmt(v)}`);
const rText = (r) => (r == null ? '계산 불가' : r.toFixed(2));

/** 지금 점수 출처 ("AI를 보조 채점자로"를 끄면 채점자 1과 AI 평균은 채점자 1로) */
export const sourceOf = () => {
  const g = getGrading();
  return validSource(g.analysisSource ?? g.raters?.[0]?.id ?? 'r1', g);
};

/** 분석 대상 학생: 포함한 세션, 1단계 제출, 연구 동의(설정하면 동의하지 않은·답하지 않은 학생도) */
export function analysisStudents(g = getGrading()) {
  const all = researchStudents({ includeSamples: g.includeSamples, sessionIds: g.scopeSessionIds });
  // 철회한 학생은 철회 전 자료만(forResearch)
  // 일반인의 탐구 기록은 기본으로 뺀다(로드맵 3단계 사용자 결정)
  const included = all.filter((s) => (g.includeNonConsent || isResearchIncluded(s)) && !s.guest).map(forResearch);
  return { all, included, excluded: all.length - included.length };
}

/** 점수 출처 고르기 (분석 화면들이 함께 쓴다) */
export function sourcePicker(source) {
  return `<fieldset class="choice-group source-pick" data-source-pick>
    <legend>점수 출처</legend>
    <div class="pick-group__options">${scoreSources().map((s) => `<label class="pick pick--tag"><input type="radio" name="analysisSource" value="${s.id}"${s.id === source ? ' checked' : ''}><span>${escapeHtml(s.label)}</span></label>`).join('')}</div>
    <p class="field__help">${source === 'ai' ? 'AI 채점은 실제 AI가 아니라 예시 규칙으로 매긴 참고 점수입니다. 연구 분석에는 교사 채점을 쓰세요.' : source === 'avg' ? '두 채점자가 모두 채점한 증명만 평균을 냅니다.' : source === 'r1ai' ? 'AI를 보조 채점자로 씁니다. 채점자 1이 채점한 증명만 AI 점수와 평균을 냅니다.' : '이 채점자가 채점한 증명만 점수가 보입니다. 채점하지 않은 증명은 "채점 전"으로 표시됩니다.'}</p>
  </fieldset>`;
}

export function renderAnalysisHome(root) {
  let disposeTips = () => {};
  let openField = 'aiHelpful';
  let surveyPick = null;
  const draw = () => {
    disposeTips();
    const g = getGrading();
    const source = sourceOf();
    const pool = analysisStudents(g);
    const students = pool.included.filter((s) => s.record.stages?.['1']?.submittedAt);
    const analyses = students.map((s) => analyzeStudent(s, source));
    const sum = classSummary(analyses);
    const scored = analyses.some((a) => a.props.some((p) => p.totals[1] != null || p.totals[4] != null));
    const xs = sum.points.map((p) => p.x);
    const ys = sum.points.map((p) => p.y);
    // 축 범위: 0을 포함하고 2 단위로 맞춘다
    const range = (vals) => {
      const lo = Math.floor(Math.min(0, ...vals) / 2) * 2;
      const hi = Math.ceil(Math.max(0, ...vals) / 2) * 2;
      return [lo, hi > lo ? hi : lo + 2];
    };

    const rows = analyses.map((a) => `<tr>
      <th scope="row"><a href="#/teacher/analysis/${a.student.id}">${escapeHtml(a.student.pseudonym)}</a>${a.student.sample ? ' <span class="tag tag--proto">예시</span>' : ''}</th>
      <td>${escapeHtml(sessionLabel(a.student.session))}</td>
      <td class="num">${fmt(a.avg[1])}</td><td class="num">${fmt(a.avg[2])}</td><td class="num">${fmt(a.avg[4])}</td>
      <td class="num">${signed(a.avg.improve)}</td><td class="num">${signed(a.avg.gap)}</td>
      <td>${a.avg.ratioMine == null ? '–' : `<span class="ratio-cell">${splitBar(Math.round(a.avg.ratioMine))}<span class="num">${Math.round(a.avg.ratioMine * 10)}%</span></span>`}</td>
      <td class="num">${fmt(a.avg.confidence[1])} → ${fmt(a.avg.confidence[4])}</td>
      <td class="num">${a.questions}${a.offTopic ? ` <span class="meta">(무관 ${a.offTopic})</span>` : ''}</td>
      <td class="num">${fmt(a.totalMinutes)}분</td>
    </tr>`).join('');

    root.innerHTML = `<div class="page page--teacher page--analysis">
      ${breadcrumb([{ label: '교사 화면', href: '#/teacher' }, { label: '연구 분석' }])}
      <header class="page-intro">
        <h1>연구 분석</h1>
        <p class="lead">채점과 활동 기록으로 학생별 변화를 봅니다. 향상은 최종 증명(4단계) − 나의 증명(1단계), 격차는 AI 증명(2단계) − 나의 증명 점수입니다.</p>
      </header>
      ${notice('warn', '프로토타입 상태입니다', '이 브라우저의 기록과 예시 학생 기록으로 계산합니다. 1단계를 제출한 학생만 보입니다.')}
      <section class="panel" aria-labelledby="an-settings">
        <h2 id="an-settings" class="section-title">보기 설정</h2>
        <form class="settings-form grading-settings" data-analysis-settings novalidate>
          ${sourcePicker(source)}
          <label class="check"><input type="checkbox" name="includeSamples"${g.includeSamples ? ' checked' : ''}><span>예시 학생 포함</span></label>
          <label class="check"><input type="checkbox" name="includeNonConsent"${g.includeNonConsent ? ' checked' : ''}><span>연구에 동의하지 않은 학생도 포함 <span class="meta">기본은 동의한 학생만 분석합니다.${pool.excluded ? ` 지금 ${pool.excluded}명이 빠져 있습니다.` : ''}</span></span></label>
          ${scopePicker(g)}
        </form>
        ${scored ? '' : notice('eye', '아직 채점한 증명이 없습니다', '증명 채점 화면에서 채점하거나, 점수 출처를 "AI 채점(참고)"으로 바꾸면 대시보드를 미리 볼 수 있습니다.')}
      </section>
      <section class="panel" aria-labelledby="an-class">
        <h2 id="an-class" class="section-title">학급 요약</h2>
        <p class="meta">포함한 세션: ${escapeHtml(scopeText(g))}</p>
        ${statTiles([
          { label: '학생 수', value: `${sum.students}명` },
          { label: '평균 향상 (최종 − 나)', value: signed(sum.improve), sub: '점, 10점 만점' },
          { label: '평균 격차 (AI − 나)', value: signed(sum.gap), sub: '점' },
          { label: '격차와 향상의 상관', value: rText(sum.rGapImprove), sub: `명제 ${sum.points.length}개 기준` },
          { label: 'AI 반영 비율과 향상의 상관', value: rText(sum.rRatioImprove) },
        ])}
        ${sum.points.length ? scatter({
          title: '격차가 클수록 향상도 컸나요?',
          note: '점 하나가 학생 한 명의 명제 하나입니다. 오른쪽 위로 갈수록 AI 증명이 나의 증명보다 좋았고 최종 증명에서 많이 나아진 경우입니다.',
          points: sum.points.map((p) => ({ x: p.x, y: p.y, label: `${p.student.pseudonym} 명제 ${p.prop.propIndex + 1}` })),
          x: range(xs), y: range(ys), xLabel: '격차 (AI − 나)', yLabel: '향상 (최종 − 나)',
        }) : ''}
      </section>
      ${acceptanceSection(analyses)}
      ${checklistSection(analyses, source)}
      ${openSection(analyses)}
      ${principleSection(pool.included)}
      ${surveySection(pool.included)}
      <section class="panel" aria-labelledby="an-students">
        <div class="section-head">
          <h2 id="an-students" class="section-title">학생별 요약</h2>
          <button type="button" class="button button--secondary button--small" data-action="csv"${analyses.length ? '' : ' disabled'}>CSV 내려받기</button>
        </div>
        <p class="meta">학생 이름을 누르면 그 학생의 대시보드가 열립니다. 점수는 명제 평균(10점 만점)입니다. CSV에는 학생 × 명제마다 모든 기록이 한 줄씩 들어갑니다.</p>
        ${analyses.length ? `<div class="table-wrap" role="region" aria-labelledby="an-students" tabindex="0">
          <table class="data-table grade-table" data-analysis-table>
            <thead><tr><th scope="col">학생</th><th scope="col">세션</th><th scope="col">나</th><th scope="col">AI</th><th scope="col">최종</th><th scope="col">향상</th><th scope="col">격차</th><th scope="col">나의 반영</th><th scope="col">확신 1 → 4</th><th scope="col">질문</th><th scope="col">작업 시간</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>` : '<p class="empty-text">아직 1단계를 제출한 학생이 없습니다.</p>'}
      </section>
    </div>`;
    disposeTips = bindChartTips(root);
  };

  function acceptanceSection(analyses) {
    const st = acceptanceStats(analyses);
    if (!st.n) return '';
    const pctText = (v) => (v == null ? '–' : `${v}%`);
    return `<section class="panel" aria-labelledby="an-accept">
      <h2 id="an-accept" class="section-title">AI 답변을 받아들인 정도</h2>
      <p class="meta">학생 × 명제 ${st.n}개 기준입니다. 반영 비율은 4단계에서 학생이 직접 표시한 값입니다.</p>
      ${statTiles([
        { label: '최종 증명의 AI 반영 (평균)', value: pctText(st.meanAiShare), sub: '학생 자기 보고' },
        { label: '"AI 증명이 더 정확하다"', value: pctText(st.aiMoreAccurate), sub: '3단계 응답 중' },
        { label: 'AI의 증명법으로 바꿈', value: pctText(st.toAiRate), sub: '1단계에 AI와 다른 증명법을 쓴 경우 중' },
        { label: '확신 정도 1 → 2 → 4', value: `${st.confidence[1] ?? '–'} → ${st.confidence[2] ?? '–'} → ${st.confidence[4] ?? '–'}`, sub: '나 → AI 증명 → 최종, 5점 만점' },
      ])}
      <div class="an-charts">
        ${columns({
          title: '최종 증명에서 AI 답변을 반영한 비율',
          bins: st.histogram.map((b) => ({ label: `${100 - b.value * 10}`, count: b.count, tip: `AI 반영 ${100 - b.value * 10}%: ${b.count}개` })).reverse(),
          axisLabel: 'AI 반영 비율 (%) — 오른쪽으로 갈수록 AI 답변을 많이 반영',
        })}
        ${barList({ title: '3단계: 어느 증명이 더 정확하다고 보았나요?', unit: '개', wide: true, rows: st.accurate.map((o) => ({ label: o.label, value: o.count })) })}
        ${barList({ title: '증명법: 1단계(나) → 4단계(최종)', unit: '개', wide: true, rows: st.methodFlow.map((o) => ({ label: o.label, value: o.count })) })}
        ${barList({ title: '3단계: 1단계의 막힌 점이 AI 증명으로 해결되었나요?', unit: '개', wide: true, rows: st.resolved.map((o) => ({ label: o.label, value: o.count })) })}
      </div>
    </section>`;
  }

  function checklistSection(analyses, source) {
    const st = checklistStats(analyses);
    if (!st.n) return '';
    const teacher = sourceLabel(source);
    const rows = (list) => list.map((c) => ({
      label: c.label,
      value: c.checked,
      sub: c.lacks == null ? '' : c.graded ? `${teacher}: 부족 ${c.lacks}개 / 채점 ${c.graded}개` : `${teacher}: 채점 전`,
    }));
    return `<section class="panel" aria-labelledby="an-check">
      <h2 id="an-check" class="section-title">학생이 찾은 부족한 점 (3단계 체크리스트)</h2>
      <p class="meta">3단계 비교 분석 ${st.n}개에서 학생이 "보완할 점"으로 체크한 수입니다. 막대 아래에는 짝이 되는 루브릭 기준에서 교사 채점(점수 출처)이 만점보다 낮게 준 수를 함께 보여 줍니다.</p>
      <div class="an-charts">
        ${barList({ title: '내 증명(1단계 초안)에서 부족하다고 본 점', unit: '개', wide: true, rows: rows(st.mine), max: st.n })}
        ${barList({ title: 'AI 증명(2단계)에서 부족하다고 본 점', unit: '개', wide: true, rows: rows(st.ai), max: st.n })}
      </div>
    </section>`;
  }

  function openSection(analyses) {
    const answers = openAnswers(analyses, openField);
    const none = answers.filter((a) => isNoneAnswer(a.text));
    const real = answers.filter((a) => !isNoneAnswer(a.text));
    const words = wordFrequencies(real.map((a) => a.text));
    const q = OPEN_QUESTIONS.find((x) => x.id === openField);
    return `<section class="panel" aria-labelledby="an-open">
      <h2 id="an-open" class="section-title">개방형 답변 모아 보기</h2>
      <fieldset class="choice-group" data-open-pick>
        <legend>문항</legend>
        <div class="pick-group__options">${OPEN_QUESTIONS.map((o) => `<label class="pick pick--tag"><input type="radio" name="openField" value="${o.id}"${o.id === openField ? ' checked' : ''}><span>${escapeHtml(o.label)}</span></label>`).join('')}</div>
      </fieldset>
      <p class="meta">${escapeHtml(q.label)}: 답 ${answers.length}개 중 내용이 있는 답 ${real.length}개, "없음"이나 "찾지 못함" ${none.length}개. 낱말은 조사를 떼고 흔한 말을 빼서 센 것으로, 뜻을 정확히 가르지는 못합니다.</p>
      <div class="an-charts">
        <figure class="chart">
          <figcaption class="chart__head"><span class="chart__title">많이 나온 낱말</span></figcaption>
          ${wordCloud({ words: words.slice(0, 30), empty: '내용이 있는 답이 아직 없습니다.' })}
        </figure>
        ${words.length ? barList({ wide: true, title: '낱말 빈도 (상위 10개)', unit: '번', rows: words.slice(0, 10).map((w) => ({ label: w.word, value: w.count, sub: `답 ${w.docs}개에 나옴` })) }) : ''}
      </div>
      <details class="ref-card">
        <summary>답 전체 보기 (${answers.length})</summary>
        <ul class="answer-list">${answers.map((a) => `<li><span class="meta">${escapeHtml(a.who)}, 명제 ${a.prop}</span>${escapeHtml(a.text)}</li>`).join('')}</ul>
      </details>
    </section>`;
  }

  function principleSection(students) {
    const st = principleStats(students);
    if (!st.n) {
      return `<section class="panel" aria-labelledby="an-principle"><h2 id="an-principle" class="section-title">"AI는 어떻게 답할까?" 원리 활동</h2><p class="empty-text">아직 활동을 마친 학생이 없습니다.</p></section>`;
    }
    const weakest = [...st.items].filter((x) => x.rate != null).sort((a, b) => a.rate - b.rate)[0];
    return `<section class="panel" aria-labelledby="an-principle">
      <h2 id="an-principle" class="section-title">"AI는 어떻게 답할까?" 원리 활동</h2>
      <p class="meta">처음 고른 답 기준입니다(학생은 고른 뒤 바로 설명을 보고 다시 고르지 않습니다).</p>
      ${statTiles([
        { label: '마친 학생', value: `${st.n}명`, sub: st.meanMinutes != null ? `평균 ${st.meanMinutes}분` : '' },
        { label: '평균 정답', value: `${st.meanCorrect} / ${st.items.length}` },
        ...st.parts.map((p) => ({ label: p.title, value: p.rate == null ? '–' : `${p.rate}%`, sub: '정답률' })),
      ])}
      <div class="an-charts">
        ${barList({ title: '문항별 정답률', unit: '%', max: 100, wide: true, rows: st.items.map((x) => ({ label: `${x.num}번 ${st.parts.find((p) => p.id === x.item.part).title}`, value: x.rate ?? 0, sub: x.topWrong ? `자주 고른 오답: ${x.topWrong.option} (${x.topWrong.count}명)` : '' })) })}
        <div class="an-block">
          <h3 class="an-sub">가장 많이 틀린 문항</h3>
          ${weakest ? `<p><strong>${weakest.num}. ${escapeHtml(weakest.item.prompt)}</strong></p><p class="meta">정답률 ${weakest.rate}%${weakest.topWrong ? `, 자주 고른 오답 "${escapeHtml(weakest.topWrong.option)}"` : ''}. 2단계 AI 대화 전에 다시 짚어 주면 좋습니다.</p>` : ''}
          <h3 class="an-sub">마무리: AI 답을 쓸 때 꼭 해야 할 일</h3>
          ${wordCloud({ words: wordFrequencies(st.reflections.map((r) => r.text)).slice(0, 20) })}
          <details class="ref-card"><summary>답 전체 보기 (${st.reflections.length})</summary><ul class="answer-list">${st.reflections.map((r) => `<li><span class="meta">${escapeHtml(r.who)}</span>${escapeHtml(r.text)}</li>`).join('')}</ul></details>
        </div>
      </div>
    </section>`;
  }

  function surveySection(students) {
    const use = surveysInUse(students);
    if (!use.length) {
      return `<section class="panel" aria-labelledby="an-survey"><h2 id="an-survey" class="section-title">사전·사후 설문</h2><p class="empty-text">아직 제출한 설문 응답이 없습니다.</p></section>`;
    }
    const pick = use.find((u) => u.id === surveyPick) ?? use[0];
    const st = surveyStats(pick.survey, students);
    const fmt = (v) => (v == null ? '–' : Number(v).toFixed(2).replace(/\.?0+$/, ''));
    const signed = (v) => (v == null ? '–' : `${v > 0 ? '+' : ''}${fmt(v)}`);
    const series = [{ key: 'pre', label: '사전', short: '사전', cls: 'mine' }, { key: 'post', label: '사후', short: '사후', cls: 'final' }];
    const scaleItems = st.items.filter((i) => i.q.type === 'scale');
    const choiceItems = st.items.filter((i) => i.q.type === 'choice');
    const textItems = st.items.filter((i) => i.q.type === 'short' || i.q.type === 'long');
    const qNum = (q) => st.survey.questions.indexOf(q) + 1;
    const { points, labels } = surveyScale(pick.survey);
    const ticks = Array.from({ length: points }, (_, k) => k + 1);
    const inst = pick.survey.instrument ?? {};
    return `<section class="panel" aria-labelledby="an-survey">
      <div class="section-head">
        <h2 id="an-survey" class="section-title">사전·사후 설문</h2>
        <button type="button" class="button button--secondary button--small" data-action="survey-csv">설문 CSV 내려받기</button>
      </div>
      ${use.length > 1 ? `<fieldset class="choice-group"><legend>설문</legend><div class="pick-group__options">${use.map((u) => `<label class="pick pick--tag"><input type="radio" name="surveyPick" value="${u.id}"${u.id === pick.id ? ' checked' : ''}><span>${escapeHtml(u.survey.title)} (${u.n}명)</span></label>`).join('')}</div></fieldset>` : `<p class="meta">${escapeHtml(pick.survey.title)}</p>`}
      ${inst.name || inst.citation ? `<p class="meta">평가도구: ${escapeHtml([inst.name, inst.citation].filter(Boolean).join(', '))}</p>` : ''}
      <p class="meta">변화와 효과 크기(dz = 변화 평균 ÷ 변화의 표준편차)는 사전·사후를 모두 낸 학생끼리 짝지어 계산합니다. ${points}점 척도(1 ${escapeHtml(labels[0])} ~ ${points} ${escapeHtml(labels[points - 1])}), 역문항은 ${points + 1} − 점수로 바꾸어 하위 요인 평균에 넣습니다. 학생 수가 적으면 효과 크기는 참고만 하세요.</p>
      ${statTiles([
        { label: '사전 응답', value: `${st.preN}명`, sub: st.minutes.pre != null ? `평균 ${fmt(st.minutes.pre)}분` : '' },
        { label: '사후 응답', value: `${st.postN}명`, sub: st.minutes.post != null ? `평균 ${fmt(st.minutes.post)}분` : '' },
        { label: '사전·사후 모두', value: `${st.pairedN}명`, sub: '변화 계산에 쓰는 학생' },
        ...st.domains.map((d) => ({ label: `${d.label} 변화`, value: signed(d.diff), sub: `${fmt(d.pre)} → ${fmt(d.post)}, dz ${fmt(d.dz)}` })),
      ])}
      <div class="an-charts">
        ${dotPlot({ title: `하위 요인별 평균 (${points}점 척도)`, series, max: points, min: 1, ticks, unit: '점', rows: st.domains.map((d) => ({ label: d.label, values: { pre: d.pre, post: d.post } })) })}
        ${dotPlot({ title: `문항별 평균 (${points}점 척도)`, series, max: points, min: 1, ticks, unit: '점', rows: scaleItems.map((i) => ({ label: `${qNum(i.q)}번${i.q.reverse ? ' (역)' : ''}`, values: { pre: i.pre, post: i.post } })) })}
      </div>
      <div class="table-wrap" role="region" aria-label="문항별 사전·사후" tabindex="0">
        <table class="data-table grade-table" data-survey-table>
          <thead><tr><th scope="col">문항</th><th scope="col">사전</th><th scope="col">사후</th><th scope="col">변화</th><th scope="col">짝 n</th><th scope="col">dz</th></tr></thead>
          <tbody>${scaleItems.map((i) => `<tr><th scope="row">${qNum(i.q)}. ${escapeHtml(i.q.text)}${i.q.reverse ? ' <span class="tag">역문항</span>' : ''}</th><td class="num">${fmt(i.pre)}</td><td class="num">${fmt(i.post)}</td><td class="num">${signed(i.diff)}</td><td class="num">${i.n}</td><td class="num">${fmt(i.dz)}</td></tr>`).join('')}</tbody>
        </table>
      </div>
      ${choiceItems.map((i) => `<div class="an-charts">
        ${barList({ title: `${qNum(i.q)}. ${i.q.text} (사전)`, unit: '명', wide: true, rows: i.preCounts.map((c) => ({ label: c.option, value: c.count })), max: st.rows.length })}
        ${barList({ title: '(사후)', unit: '명', wide: true, rows: i.postCounts.map((c) => ({ label: c.option, value: c.count })), max: st.rows.length })}
      </div>`).join('')}
      ${textItems.map((i) => `<details class="ref-card"><summary>${qNum(i.q)}. ${escapeHtml(i.q.text)}</summary>
        <div class="an-charts">
          <figure class="chart"><figcaption class="chart__head"><span class="chart__title">사전 (${i.preTexts.length})</span></figcaption>${wordCloud({ words: wordFrequencies(i.preTexts.filter((t) => !isNoneAnswer(t.text)).map((t) => t.text)).slice(0, 20) })}<ul class="answer-list">${i.preTexts.map((t) => `<li><span class="meta">${escapeHtml(t.who)}</span>${escapeHtml(t.text)}</li>`).join('')}</ul></figure>
          <figure class="chart"><figcaption class="chart__head"><span class="chart__title">사후 (${i.postTexts.length})</span></figcaption>${wordCloud({ words: wordFrequencies(i.postTexts.filter((t) => !isNoneAnswer(t.text)).map((t) => t.text)).slice(0, 20) })}<ul class="answer-list">${i.postTexts.map((t) => `<li><span class="meta">${escapeHtml(t.who)}</span>${escapeHtml(t.text)}</li>`).join('')}</ul></figure>
        </div>
      </details>`).join('')}
    </section>`;
  }

  const onChange = (event) => {
    if (handleScopeEvent(event, root)) {
      draw();
      return;
    }
    if (event.target.name === 'openField') {
      openField = event.target.value;
      const y = window.scrollY;
      draw();
      window.scrollTo(0, y);
      root.querySelector(`input[name="openField"][value="${openField}"]`)?.focus();
      return;
    }
    if (event.target.name === 'analysisSource') updateGradingSettings({ analysisSource: event.target.value });
    if (event.target.name === 'includeSamples') updateGradingSettings({ includeSamples: event.target.checked });
    if (event.target.name === 'includeNonConsent') updateGradingSettings({ includeNonConsent: event.target.checked });
    if (event.target.name === 'surveyPick') {
      surveyPick = event.target.value;
      draw();
      return;
    }
    if (event.target.closest('[data-analysis-settings]')) draw();
  };
  const download = (csv, name) => {
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const onClick = (event) => {
    if (handleScopeEvent(event, root)) {
      draw();
      return;
    }
    if (event.target.closest('[data-action="survey-csv"]')) {
      const { included } = analysisStudents();
      const use = surveysInUse(included);
      const pick = use.find((u) => u.id === surveyPick) ?? use[0];
      if (pick) download(surveyCsv(pick.survey, included, { className: classNameOf }), `설문-${new Date().toISOString().slice(0, 10)}.csv`);
      return;
    }
    if (!event.target.closest('[data-action="csv"]')) return;
    const g = getGrading();
    const source = sourceOf();
    const students = analysisStudents(g).included.filter((s) => s.record.stages?.['1']?.submittedAt);
    const csv = analysisCsv(students.map((s) => analyzeStudent(s, source)), source);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `연구분석-${source}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  draw();
  root.addEventListener('change', onChange);
  root.addEventListener('click', onClick);
  return () => {
    disposeTips();
    root.removeEventListener('change', onChange);
    root.removeEventListener('click', onClick);
  };
}
