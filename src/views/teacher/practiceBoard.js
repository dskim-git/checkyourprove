// 교사 업무판의 "증명 연습 현황" (로드맵 6단계 메모, 2026-11-28 사용자 결정)
// - 서버 모드: 표 위에 교사가 맡은 학급마다 탭(관리자는 모든 학급). 탭을 고르면 그 학급 학생의 증명법별 인증 단계 수·최근 활동·마지막 활동.
//   학생 목록과 이름·학번은 서버 함수(api/session.js classPractice)가 담당 교사에게만 준다(이름은 관리자만 읽는 links에 있음).
// - 표에는 학번·이름을 보인다(연습은 수업 관리용). 연구 화면(채점·분석·면담)은 그대로 연구 번호만.
// - 학번을 누르면 그 학생의 연구 번호를 보여 주는 팝업은 관리자만(연결표는 관리자만, data-spec 2절). 교사에게는 학번이 눌리지 않는다.
// - 프로토타입·시연 모드: 예시 데이터(SAMPLE_ACTIVITY).

import { isFirebase } from '../../state/appMode.js';
import { currentUser, isAdmin } from '../../state/accountStore.js';
import { activeSession, fetchClassPractice, getSessions } from '../../state/sessionStore.js';
import { practiceSettings } from '../../state/practiceSettings.js';
import { practiceSummary } from '../../state/practiceProgress.js';
import { METHODS, getMethod } from '../../data/methods.js';
import { LEVELS, getLevel } from '../../data/levels.js';
import { getProblem } from '../../data/problems/index.js';
import { SAMPLE_ACTIVITY } from '../../data/sampleRecords.js';
import { studentNoLabel } from '../../data/studentNo.js';
import { escapeHtml, formatDateTime, formatTime } from '../../ui/dom.js';
import { notice } from '../../ui/components.js';
import { openModal } from '../../ui/modal.js';

// 학급마다 마지막으로 받은 값: classId → { rows, at, kind } | { error } | { loading: true }
const cache = new Map();
let selectedId = null;

/** 학급 탭 순서: 반(학년도 최근 → 학년 → 반), 그다음 기타(이름) */
function boardClasses() {
  return [...getSessions().classes].filter((c) => !c.sample && !String(c.id).startsWith('pending-')).sort((a, b) => {
    const ah = a.kind === 'homeroom' ? 0 : 1;
    const bh = b.kind === 'homeroom' ? 0 : 1;
    if (ah !== bh) return ah - bh;
    if (ah === 0) return (b.year ?? 0) - (a.year ?? 0) || (a.grade ?? 0) - (b.grade ?? 0) || (a.classNo ?? 0) - (b.classNo ?? 0);
    return String(a.name).localeCompare(String(b.name), 'ko');
  });
}
const tabLabel = (c, all) => {
  const years = new Set(all.filter((x) => x.kind === 'homeroom').map((x) => x.year));
  return c.kind === 'homeroom' && years.size > 1 ? `${c.year} ${c.name}` : c.name;
};

/** 서버에서 받은 학생 하나 → 표의 한 줄 */
function rowOf(student, settings) {
  const s = practiceSummary(student.attempts ?? [], settings);
  const r = s.recent;
  const problem = r ? getProblem(r.problemId) : null;
  return {
    studentNo: student.studentNo,
    name: student.name,
    kind: student.kind,
    unlinked: student.unlinked,
    researchId: student.researchId,
    certified: s.certified,
    recent: r ? [getMethod(r.method)?.shortLabel, getLevel(r.levelId)?.title, problem?.title].filter(Boolean).join(', ') + ` (${s.recentStatus.label})` : '',
    lastActiveAt: s.lastActiveAt,
  };
}

const sampleRows = () => SAMPLE_ACTIVITY.map((row) => ({
  ...row,
  kind: 'student',
  recent: `${getMethod(row.recent.method).shortLabel}, ${getLevel(row.recent.levelId).title}, ${getProblem(row.recent.problemId).title} (${row.recent.result})`,
}));

function noCell(row, i, admin) {
  const text = row.unlinked ? '연결 지움' : row.studentNo || (row.kind === 'guest' ? '일반인' : '–');
  if (!admin || !row.researchId) return `<th scope="row" class="num">${escapeHtml(text)}</th>`;
  return `<th scope="row"><button type="button" class="link-button num" data-pb-rid="${i}" aria-haspopup="dialog" aria-label="${escapeHtml(`${text} ${row.name || ''}`.trim())}의 연구 번호 보기">${escapeHtml(text)}</button></th>`;
}

function tableHtml(rows, admin) {
  const head = METHODS.map((m) => `<th scope="col">${escapeHtml(m.shortLabel)}</th>`).join('');
  const body = rows.map((row, i) => `<tr>
      ${noCell(row, i, admin)}
      <td>${row.unlinked ? '<span class="meta">(연결 지움)</span>' : escapeHtml(row.name || '')}</td>
      ${METHODS.map((m) => `<td class="num">${row.certified[m.id] ?? 0} / ${LEVELS.length}</td>`).join('')}
      <td class="wrap">${row.recent ? escapeHtml(row.recent) : '<span class="meta">아직 없음</span>'}</td>
      <td>${row.lastActiveAt ? escapeHtml(formatDateTime(row.lastActiveAt)) : '<span class="meta">–</span>'}</td>
    </tr>`).join('');
  return `<div class="table-wrap" role="region" aria-labelledby="activity-heading" tabindex="0">
    <table class="data-table practice-board__table">
      <thead><tr><th scope="col">학번</th><th scope="col">이름</th>${head}<th scope="col">최근 활동</th><th scope="col">마지막 활동</th></tr></thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

/** 업무판의 "증명 연습 현황" 칸(제목 포함). 내용은 fillPracticeBoard가 채운다 */
export function practiceBoardHtml() {
  return `<section class="panel practice-board" aria-labelledby="activity-heading">
      <div class="section-head">
        <h2 id="activity-heading" class="section-title">증명 연습 현황</h2>
        ${isFirebase ? '' : '<span class="tag tag--proto">예시 데이터</span>'}
      </div>
      <p class="meta">증명법마다 인증한 활동 단계 수(최대 ${LEVELS.length})와 최근 활동입니다.${isAdmin(currentUser()) ? ' 학번을 누르면 연구 번호를 볼 수 있어요(관리자만).' : ''}</p>
      <div data-practice-board></div>
    </section>`;
}

let lastRows = [];

function draw(host) {
  const admin = isAdmin(currentUser());
  if (!isFirebase) {
    lastRows = sampleRows();
    host.innerHTML = tableHtml(lastRows, admin);
    return;
  }
  const list = boardClasses();
  if (!list.length) {
    lastRows = [];
    host.innerHTML = '<p class="meta">아직 담당 학급이 없어요. 학급을 만들면 여기에 학급마다 탭이 생겨요.</p>';
    return;
  }
  if (!list.some((c) => c.id === selectedId)) {
    const active = activeSession()?.classId;
    selectedId = list.some((c) => c.id === active) ? active : list[0].id;
  }
  const klass = list.find((c) => c.id === selectedId);
  const tabs = `<div class="seg seg--tabs" role="tablist" aria-label="학급 고르기">${list.map((c) => `<button type="button" role="tab" class="seg__item${c.id === selectedId ? ' is-on' : ''}" id="pb-tab-${escapeHtml(c.id)}" aria-selected="${c.id === selectedId}" aria-controls="pb-panel" tabindex="${c.id === selectedId ? 0 : -1}" data-pb-class="${escapeHtml(c.id)}">${escapeHtml(tabLabel(c, list))}</button>`).join('')}</div>`;
  const state = cache.get(selectedId);
  let body;
  if (!state || state.loading) {
    body = '<p class="meta" role="status">학생 기록을 불러오는 중…</p>';
  } else if (state.error) {
    body = `${notice('warn', '불러오지 못했어요', state.error)}<p><button type="button" class="button button--secondary" data-pb-refresh>다시 불러오기</button></p>`;
  } else {
    const settings = practiceSettings(selectedId);
    lastRows = state.students.map((s) => rowOf(s, settings));
    const empty = klass.kind === 'homeroom'
      ? '아직 이 반에 배정된 학생이 없어요. 학년도·학번이 이 반과 맞는 학생이 가입해 승인되면 저절로 들어와요.'
      : '아직 이 학급의 회차에 들어온 학생이 없어요.';
    body = `<div class="practice-board__bar">
        <p class="meta">학생 ${lastRows.length}명 · 인증 기준: 단계마다 명제 ${settings.requiredClears}개 통과 · ${escapeHtml(formatTime(state.at))}에 불러옴</p>
        <button type="button" class="button button--ghost" data-pb-refresh>새로 고침</button>
      </div>
      ${lastRows.length ? tableHtml(lastRows, admin) : `<p class="meta">${empty}</p>`}`;
  }
  host.innerHTML = `${tabs}<div id="pb-panel" role="tabpanel" aria-labelledby="pb-tab-${escapeHtml(selectedId)}" class="practice-board__panel">${body}</div>`;
}

async function load(host, classId, { force = false } = {}) {
  if (!force && cache.has(classId) && !cache.get(classId).error) return;
  cache.set(classId, { loading: true });
  draw(host);
  const r = await fetchClassPractice(classId);
  cache.set(classId, r?.error || !r ? { error: r?.error ?? '서버에서 답이 없어요.' } : { students: r.students ?? [], at: r.at });
  if (host.isConnected && selectedId === classId) draw(host);
}

function showResearchId(row) {
  const no = row.studentNo ? `${row.studentNo}${studentNoLabel(row.studentNo) ? ` (${studentNoLabel(row.studentNo)})` : ''}` : (row.kind === 'guest' ? '일반인' : '–');
  openModal({
    title: '연구 번호',
    size: 'narrow',
    html: `<dl class="read-list">
        <div><dt>학번</dt><dd class="num">${escapeHtml(no)}</dd></div>
        <div><dt>이름</dt><dd>${escapeHtml(row.unlinked ? '(연결 지움)' : row.name)}</dd></div>
        <div><dt>연구 번호</dt><dd><strong class="num">${escapeHtml(row.researchId)}</strong></dd></div>
      </dl>
      <p class="meta">연구 번호와 이름을 잇는 정보(연결표)는 관리자만 봅니다. 채점·분석·면담 화면에는 연구 번호만 나와요.</p>`,
  });
}

/**
 * 업무판에 들어올 때 한 번 부른다. 탭·새로 고침·학번 팝업을 다룬다. 업무판을 다시 그릴 때마다 fill()을 부른다.
 * 들어올 때마다 서버에서 새로 받는다(다른 계정으로 바꿔 로그인해도 지난 값이 남지 않게).
 * @returns {{ fill: () => void, cleanup: () => void }}
 */
export function mountPracticeBoard(root) {
  cache.clear();
  const fill = () => {
    const host = root.querySelector('[data-practice-board]');
    if (!host) return;
    draw(host);
    if (isFirebase && selectedId) load(host, selectedId);
  };
  const onClick = (event) => {
    const host = root.querySelector('[data-practice-board]');
    if (!host || !host.contains(event.target)) return;
    const tab = event.target.closest('[data-pb-class]');
    if (tab) {
      selectedId = tab.dataset.pbClass;
      draw(host);
      load(host, selectedId);
      host.querySelector(`[data-pb-class="${CSS.escape(selectedId)}"]`)?.focus();
      return;
    }
    if (event.target.closest('[data-pb-refresh]')) {
      load(host, selectedId, { force: true });
      return;
    }
    const rid = event.target.closest('[data-pb-rid]');
    if (rid && isAdmin(currentUser())) {
      const row = lastRows[Number(rid.dataset.pbRid)];
      if (row?.researchId) showResearchId(row);
    }
  };
  // 탭 목록: 왼쪽·오른쪽 화살표로 옮긴다
  const onKey = (event) => {
    const tab = event.target.closest?.('[data-pb-class]');
    if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const tabs = [...tab.parentElement.querySelectorAll('[data-pb-class]')];
    const i = tabs.indexOf(tab);
    const next = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs.at(-1) : tabs[(i + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    event.preventDefault();
    next.click();
  };
  root.addEventListener('click', onClick);
  root.addEventListener('keydown', onKey);
  return {
    fill,
    cleanup: () => {
      root.removeEventListener('click', onClick);
      root.removeEventListener('keydown', onKey);
    },
  };
}
