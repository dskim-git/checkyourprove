// 교사 화면: AI 대화 태그 목록 (구현 3-2)
// 2단계 AI 대화마다 태그 진행 상황, 태그별 빈도, 두 채점자의 태그 일치도를 보여 준다.

import { tagAgreement } from '../../services/agreement.js';
import { activeChatTags, chatTagRecord, currentRater, getGrading, updateGradingSettings } from '../../state/gradingStore.js';
import { TAG_SCOPES } from '../../data/chatTags.js';
import { escapeHtml } from '../../ui/dom.js';
import { breadcrumb, notice } from '../../ui/components.js';
import { allTagIds, chatQueue, raterChoice, tagLabel } from './chatTagParts.js';
import { handleScopeEvent, scopePicker } from './sessionScope.js';

const percent = (v) => (v == null ? '–' : `${Math.round(v * 100)}%`);
const kappaText = (v) => (v == null ? '계산 불가' : v.toFixed(2));

export function renderChatTagHome(root) {
  const draw = () => {
    const g = getGrading();
    const rater = currentRater();
    const tags = activeChatTags();
    const { convs, blind } = chatQueue(rater.id);
    const done = convs.filter((c) => chatTagRecord(rater.id, c.key)?.doneAt).length;
    const next = convs.find((c) => !chatTagRecord(rater.id, c.key)?.doneAt);

    const rows = convs.map((c, i) => {
      const record = chatTagRecord(rater.id, c.key);
      const ids = allTagIds(record);
      const questions = c.messages.filter((m) => m.role === 'student').length;
      const offTopic = c.messages.filter((m) => m.role === 'student' && m.topic && m.topic !== 'proof' && m.topic !== 'greeting').length;
      const who = blind
        ? `<th scope="row"><a href="#/teacher/chats/${c.key}">대화 ${i + 1}</a></th>`
        : `<th scope="row"><a href="#/teacher/chats/${c.key}">${escapeHtml(c.student.pseudonym)}</a>${c.student.sample ? ' <span class="tag tag--proto">예시</span>' : ''}</th>`;
      const counts = {};
      ids.forEach((id) => { counts[id] = (counts[id] ?? 0) + 1; });
      return `<tr>
        ${who}
        <td>명제 ${c.propIndex + 1}</td>
        <td class="num">${questions}${offTopic ? ` <span class="meta">(무관 ${offTopic})</span>` : ''}</td>
        <td>${record?.doneAt ? '마침' : record?.taggedAt ? '붙이는 중' : '<span class="meta">아직</span>'}</td>
        <td class="wrap">${ids.length ? Object.entries(counts).map(([id, n]) => `<span class="tag">${escapeHtml(tagLabel(tags, id))}${n > 1 ? ` ${n}` : ''}</span>`).join(' ') : '–'}</td>
      </tr>`;
    }).join('');

    root.innerHTML = `<div class="page page--teacher">
      ${breadcrumb([{ label: '교사 화면', href: '#/teacher' }, { label: 'AI 대화 태그' }])}
      <header class="page-intro">
        <h1>AI 대화 태그</h1>
        <p class="lead">2단계에서 학생이 AI와 나눈 대화를 읽고 질문마다, 그리고 대화 전체에 태그를 붙입니다. 면담 후보(대화를 잘 쓴 학생, 목적과 다르게 쓴 학생)를 고르는 근거가 됩니다.</p>
      </header>
      ${notice('warn', '프로토타입 상태입니다', '태그 기록은 이 브라우저에만 저장됩니다. 블라인드와 예시 학생 설정은 증명 채점과 같습니다.')}

      <section class="panel" aria-labelledby="chat-settings-heading">
        <h2 id="chat-settings-heading" class="section-title">태그 설정</h2>
        <form class="settings-form grading-settings" data-chat-settings novalidate>
          ${raterChoice(g, rater.id)}
          <label class="check">
            <input type="checkbox" name="blind"${g.blind ? ' checked' : ''}>
            <span>블라인드 <span class="meta">학생 이름을 가리고 채점자마다 정해진 무작위 순서로 보여 줍니다.</span></span>
          </label>
          <label class="check">
            <input type="checkbox" name="includeSamples"${g.includeSamples ? ' checked' : ''}>
            <span>예시 학생 포함</span>
          </label>
          ${scopePicker(g)}
        </form>
      </section>

      <section class="panel" aria-labelledby="chat-list-heading">
        <div class="section-head">
          <h2 id="chat-list-heading" class="section-title">${escapeHtml(rater.name)}의 태그</h2>
          <a class="button button--ghost button--small" href="#/teacher/chat-tags">태그 목록 보기·고치기</a>
        </div>
        <p class="grade-progress"><strong class="num">${done}</strong> / <span class="num">${convs.length}</span>개 대화 마침</p>
        ${convs.length
          ? `<div class="actions actions--start">${next ? `<a class="button button--primary" href="#/teacher/chats/${next.key}">${done ? '이어서 태그 붙이기' : '태그 붙이기 시작'}</a>` : '<p class="meta">모든 대화에 태그를 마쳤습니다.</p>'}</div>
            <div class="table-wrap" role="region" aria-labelledby="chat-list-heading" tabindex="0">
              <table class="data-table grade-table" data-chat-table>
                <thead><tr><th scope="col">${blind ? '순서' : '학생'}</th><th scope="col">명제</th><th scope="col">질문 수</th><th scope="col">상태</th><th scope="col">붙인 태그</th></tr></thead>
                <tbody>${rows}</tbody>
              </table>
            </div>`
          : '<p class="empty-text">아직 AI 대화가 없습니다. 학생이 2단계에서 AI와 대화하면 여기에 나타납니다.</p>'}
      </section>

      <section class="panel" aria-labelledby="tag-count-heading">
        <h2 id="tag-count-heading" class="section-title">태그별 빈도 (${escapeHtml(rater.name)})</h2>
        ${frequencyTable(tags, convs, rater)}
      </section>

      <section class="panel" aria-labelledby="tag-agree-heading">
        <h2 id="tag-agree-heading" class="section-title">채점자 간 태그 일치도</h2>
        ${agreementTable(g, tags, convs)}
      </section>
    </div>`;
  };

  function frequencyTable(tags, convs, rater) {
    const rows = tags.map((tag) => {
      let count = 0;
      const students = new Set();
      convs.forEach((c) => {
        const record = chatTagRecord(rater.id, c.key);
        if (!record) return;
        const n = allTagIds(record).filter((id) => id === tag.id).length;
        count += n;
        if (n) students.add(c.student.id);
      });
      return `<tr><th scope="row">${escapeHtml(tag.label)}</th><td>${escapeHtml(TAG_SCOPES.find((s) => s.id === tag.scope)?.label ?? '')}</td><td class="num">${count}</td><td class="num">${students.size}</td></tr>`;
    }).join('');
    return `<div class="table-wrap" role="region" aria-labelledby="tag-count-heading" tabindex="0">
      <table class="data-table grade-table" data-tag-count>
        <thead><tr><th scope="col">태그</th><th scope="col">붙이는 곳</th><th scope="col">붙인 수</th><th scope="col">학생 수</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }

  function agreementTable(g, tags, convs) {
    const [a, b] = g.raters;
    const result = tagAgreement(tags, convs, g.chatTagging?.[a.id], g.chatTagging?.[b.id]);
    if (!result.conversations) {
      return `<p class="empty-text">두 채점자가 모두 마친 대화가 아직 없습니다. ${escapeHtml(a.name)}과 ${escapeHtml(b.name)}가 같은 대화에 태그를 마치면 태그별 일치율과 카파를 보여 줍니다.</p>`;
    }
    const rows = result.rows.map((r) => `<tr>
      <th scope="row">${escapeHtml(r.label)}</th>
      <td class="num">${r.n}</td>
      <td class="num">${r.countA} / ${r.countB}</td>
      <td class="num">${percent(r.exact)}</td>
      <td class="num">${kappaText(r.kappa)}</td>
    </tr>`).join('');
    return `<p class="meta">두 채점자가 모두 마친 대화 ${result.conversations}개 기준입니다. 태그를 붙일 수 있는 자리(질문, AI 답, 대화 전체)마다 붙임/안 붙임을 비교합니다. 한 사람도 붙이지 않았거나 모두 붙였으면 카파를 계산할 수 없습니다.</p>
      <div class="table-wrap" role="region" aria-labelledby="tag-agree-heading" tabindex="0">
        <table class="data-table grade-table" data-tag-agreement>
          <thead><tr><th scope="col">태그</th><th scope="col">자리 수</th><th scope="col">붙인 수 (${escapeHtml(a.name)} / ${escapeHtml(b.name)})</th><th scope="col">일치율</th><th scope="col">카파</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  const onChange = (event) => {
    if (handleScopeEvent(event, root)) {
      draw();
      return;
    }
    const form = event.target.closest('[data-chat-settings]');
    if (!form) return;
    const data = new FormData(form);
    updateGradingSettings({ currentRater: data.get('rater'), blind: data.get('blind') === 'on', includeSamples: data.get('includeSamples') === 'on' });
    draw();
  };

  const onClick = (event) => {
    if (handleScopeEvent(event, root)) draw();
  };

  draw();
  root.addEventListener('change', onChange);
  root.addEventListener('click', onClick);
  return () => {
    root.removeEventListener('change', onChange);
    root.removeEventListener('click', onClick);
  };
}
