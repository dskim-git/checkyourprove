// 교사 업무판의 "AI와 탐구하기 진행 현황"에서 단계마다 미제출 학생 보기 (2026-11-28 사용자 요청)
// 표에는 미제출 인원만 두고, 그 수를 누르면 팝업으로 미제출 학생의 학번·이름(과 시작했는지)을 보여 준다.
// 미제출 = 회차에 들어온 학생·일반인 중 그 단계를 제출하지 않은 사람(교사가 아직 열지 않은 단계면 모두).
// 학번·이름은 관리자만 읽는 links에 있어 서버 함수(api/session.js sessionRoster)로 받는다. 연구 번호는 보이지 않는다.

import { currentUser, sessionMembers } from '../../state/accountStore.js';
import { fetchSessionRoster } from '../../state/sessionStore.js';
import { sessionRecords } from '../../state/researchStore.js';
import { RESEARCH_STAGES } from '../../data/research.js';
import { escapeHtml, formatTime } from '../../ui/dom.js';
import { notice } from '../../ui/components.js';
import { openModal } from '../../ui/modal.js';

/** 그 단계를 제출하지 않은 사람의 uid (memberUids 순서) */
export function unsubmittedUids(stageN, memberUids, records) {
  return memberUids.filter((uid) => !records.get(uid)?.stages?.[String(stageN)]?.submittedAt);
}

/**
 * 팝업에 보일 줄: 학번 순(학번이 없으면 뒤), 시작했는지 함께
 * @param {Map<string, object>} roster uid → { studentNo, name, kind, unlinked }
 */
export function unsubmittedRows(stageN, memberUids, records, roster) {
  return unsubmittedUids(stageN, memberUids, records).map((uid) => {
    const who = roster.get(uid) ?? null;
    return {
      studentNo: who?.studentNo ?? '',
      name: who ? (who.unlinked ? '(연결 지움)' : who.name) : '(정보를 찾지 못함)',
      kind: who?.kind ?? 'student',
      started: Boolean(records.get(uid)?.stages?.[String(stageN)]),
    };
  }).sort((a, b) => (a.studentNo || '99999').localeCompare(b.studentNo || '99999') || a.name.localeCompare(b.name, 'ko'));
}

// 회차마다 받은 학번·이름(로그인한 사람이 바뀌면 비움). 들어온 사람이 늘면 다시 받는다.
const rosters = new Map();
let owner = null;

async function rosterFor(sessionId, memberUids) {
  const me = currentUser()?.uid ?? null;
  if (me !== owner) {
    rosters.clear();
    owner = me;
  }
  const have = rosters.get(sessionId);
  if (have && memberUids.every((uid) => have.map.has(uid))) return have;
  const r = await fetchSessionRoster(sessionId);
  if (!r || r.error) return { error: r?.error ?? '서버에서 답이 없어요.' };
  const got = { map: new Map((r.students ?? []).map((s) => [s.uid, s])), at: r.at };
  rosters.set(sessionId, got);
  return got;
}

function listHtml(stage, rows, at) {
  const startedN = rows.filter((r) => r.started).length;
  const body = rows.map((r) => `<tr>
      <th scope="row" class="num">${escapeHtml(r.studentNo || (r.kind === 'guest' ? '일반인' : '–'))}</th>
      <td>${escapeHtml(r.name)}</td>
      <td>${r.started ? '작성 중' : '<span class="meta">시작 전</span>'}</td>
    </tr>`).join('');
  return `<p class="meta">${stage.n}단계 ${escapeHtml(stage.short)}을 아직 제출하지 않은 학생 ${rows.length}명(작성 중 ${startedN}명, 시작 전 ${rows.length - startedN}명)${at ? ` · ${escapeHtml(formatTime(at))} 기준` : ''}</p>
    <div class="table-wrap" role="region" aria-label="미제출 학생" tabindex="0"><table class="data-table">
      <thead><tr><th scope="col">학번</th><th scope="col">이름</th><th scope="col">상태</th></tr></thead><tbody>${body}</tbody></table></div>`;
}

/** 미제출 학생 팝업을 연다 */
export function openUnsubmitted(session, stageN) {
  const stage = RESEARCH_STAGES.find((s) => s.n === stageN);
  if (!stage) return;
  const memberUids = sessionMembers(session.id).filter((u) => u.role === 'student' || u.role === 'guest').map((u) => u.uid);
  const count = unsubmittedUids(stageN, memberUids, sessionRecords(session.id)).length;
  openModal({
    title: `${stageN}단계 미제출 학생 ${count}명`,
    size: 'narrow',
    html: '<p class="meta" role="status">학번과 이름을 불러오는 중…</p>',
    onMount: (body) => {
      let alive = true;
      rosterFor(session.id, memberUids).then((roster) => {
        if (!alive) return;
        if (roster.error) {
          body.innerHTML = notice('warn', '불러오지 못했어요', roster.error);
          return;
        }
        // 받는 사이에 제출한 학생이 있으면 빠지도록 지금 기록으로 다시 센다
        body.innerHTML = listHtml(stage, unsubmittedRows(stageN, memberUids, sessionRecords(session.id), roster.map), roster.at);
      });
      return () => { alive = false; };
    },
  });
}
