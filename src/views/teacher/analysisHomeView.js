// 교사 화면: 연구 분석 개요 (구현 3-3)
// 점수 출처 고르기, 학급 요약 수치, 격차(AI − 나)와 향상(최종 − 나)의 관계, 학생 목록(대시보드로 이동), CSV 내려받기.

import { analysisCsv, analyzeStudent, classSummary, SCORE_SOURCES } from '../../services/analysis.js';
import { getGrading, updateGradingSettings } from '../../state/gradingStore.js';
import { researchStudents } from '../../state/researchRoster.js';
import { escapeHtml } from '../../ui/dom.js';
import { breadcrumb, notice } from '../../ui/components.js';
import { bindChartTips, scatter, splitBar, statTiles } from '../../ui/charts.js';

const fmt = (v, digits = 1) => (v == null ? '–' : Number(v).toFixed(digits).replace(/\.0$/, ''));
const signed = (v) => (v == null ? '–' : `${v > 0 ? '+' : ''}${fmt(v)}`);
const rText = (r) => (r == null ? '계산 불가' : r.toFixed(2));

export const sourceOf = () => getGrading().analysisSource ?? 'r1';

/** 점수 출처 고르기 (분석 화면들이 함께 쓴다) */
export function sourcePicker(source) {
  return `<fieldset class="choice-group source-pick" data-source-pick>
    <legend>점수 출처</legend>
    <div class="pick-group__options">${SCORE_SOURCES.map((s) => `<label class="pick pick--tag"><input type="radio" name="analysisSource" value="${s.id}"${s.id === source ? ' checked' : ''}><span>${escapeHtml(s.label)}</span></label>`).join('')}</div>
    <p class="field__help">${source === 'ai' ? 'AI 채점은 실제 AI가 아니라 예시 규칙으로 매긴 참고 점수입니다. 연구 분석에는 교사 채점을 쓰세요.' : source === 'avg' ? '두 채점자가 모두 채점한 증명만 평균을 냅니다.' : '이 채점자가 채점한 증명만 점수가 보입니다. 채점하지 않은 증명은 "채점 전"으로 표시됩니다.'}</p>
  </fieldset>`;
}

export function renderAnalysisHome(root) {
  let disposeTips = () => {};
  const draw = () => {
    disposeTips();
    const g = getGrading();
    const source = sourceOf();
    const students = researchStudents({ includeSamples: g.includeSamples }).filter((s) => s.record.stages?.['1']?.submittedAt);
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
        </form>
        ${scored ? '' : notice('eye', '아직 채점한 증명이 없습니다', '증명 채점 화면에서 채점하거나, 점수 출처를 "AI 채점(참고)"으로 바꾸면 대시보드를 미리 볼 수 있습니다.')}
      </section>
      <section class="panel" aria-labelledby="an-class">
        <h2 id="an-class" class="section-title">학급 요약</h2>
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
      <section class="panel" aria-labelledby="an-students">
        <div class="section-head">
          <h2 id="an-students" class="section-title">학생별 요약</h2>
          <button type="button" class="button button--secondary button--small" data-action="csv"${analyses.length ? '' : ' disabled'}>CSV 내려받기</button>
        </div>
        <p class="meta">학생 이름을 누르면 그 학생의 대시보드가 열립니다. 점수는 명제 평균(10점 만점)입니다. CSV에는 학생 × 명제마다 모든 기록이 한 줄씩 들어갑니다.</p>
        ${analyses.length ? `<div class="table-wrap" role="region" aria-labelledby="an-students" tabindex="0">
          <table class="data-table grade-table" data-analysis-table>
            <thead><tr><th scope="col">학생</th><th scope="col">나</th><th scope="col">AI</th><th scope="col">최종</th><th scope="col">향상</th><th scope="col">격차</th><th scope="col">나의 반영</th><th scope="col">확신 1 → 4</th><th scope="col">질문</th><th scope="col">작업 시간</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>` : '<p class="empty-text">아직 1단계를 제출한 학생이 없습니다.</p>'}
      </section>
    </div>`;
    disposeTips = bindChartTips(root);
  };

  const onChange = (event) => {
    if (event.target.name === 'analysisSource') updateGradingSettings({ analysisSource: event.target.value });
    if (event.target.name === 'includeSamples') updateGradingSettings({ includeSamples: event.target.checked });
    if (event.target.closest('[data-analysis-settings]')) draw();
  };
  const onClick = (event) => {
    if (!event.target.closest('[data-action="csv"]')) return;
    const g = getGrading();
    const source = sourceOf();
    const students = researchStudents({ includeSamples: g.includeSamples }).filter((s) => s.record.stages?.['1']?.submittedAt);
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
