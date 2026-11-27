// 관리자 설정 (로드맵 3단계 프로토타입, 2026-11-27 설정 정리로 위쪽 탭 7개로 묶음). 탭마다 주소가 있다.
//   #/admin/users     사용자·가입: 가입 규칙, 승인 대기(하나씩·모두 승인, 거절), 학생 명단, 사용자 역할
//   #/admin/links     연결표·요청: 개인정보 요청(기록 삭제·탈퇴), 연결표(보호자 동의 날짜, CSV, 연결 지우기)
//   #/admin/ethics    연구 윤리: IRB, 연구 정보, 보존(연구 자료 삭제일, 면담 녹음 보관 기한), 학생 연구 동의서(양식·고치기)
//   #/admin/tools     연구 도구: 채점 루브릭, 대화 태그, 설문 문항(평가도구), 면담 후보 기준, AI 보조 채점자
//   #/admin/practice  증명 연습 기본값(교사가 학급마다 바꿀 수 있음)
//   #/admin/notices   공지·안내: 앱 공지(대상·기한), 문의처
//   #/admin/audit     관리 기록(누가 언제 무엇을), CSV
// 프로토타입: 로그인한 사람이 관리자가 아니면 막는다. 로그인하지 않은 미리보기에서는 볼 수 있게 두고 알린다.
// TODO(Firebase): 이 화면의 읽기·쓰기는 서버 규칙으로 관리자만 허용한다(사용자 지정 클레임 role=admin).

import {
  addRoster, approveUsers, currentUser, dataDeleteDate, displayName, ethics, getAccounts, isAdmin, linkTableCsv, rejectUser, removeRosterEntry,
  ROLES, saveEthics, setGuardianConsent, setRole, STATUS_LABELS, unlinkAll, unlinkUser,
} from '../../state/accountStore.js';
import { consentDoc, listSurveys, saveConsent } from '../../state/surveyStore.js';
import {
  addNotice, auditCsv, auditLog, closeRequest, getAdmin, logAction, NOTICE_AUDIENCES, PRACTICE_FIELDS, REQUEST_TYPES, removeNotice, saveContact,
  savePracticeDefaults, saveSignupRules,
} from '../../state/adminStore.js';
import { interviewThresholds, resetThresholds, retentionUntil, saveThresholds, setRetentionUntil } from '../../state/interviewStore.js';
import { THRESHOLD_FIELDS } from '../../data/interview.js';
import { activeChatTags, activeRubric, getGrading, updateGradingSettings } from '../../state/gradingStore.js';
import { settingsTabs } from '../../ui/settingsTabs.js';
import { isFirebase } from '../../state/appMode.js';
import { findSession, sessionLabel } from '../../state/sessionStore.js';
import { retentionState } from '../../state/recordingStore.js';
import { breadcrumb, notice } from '../../ui/components.js';
import { escapeHtml, formatDateTime } from '../../ui/dom.js';
import { consentTemplate } from '../../data/consentTemplates.js';

const THIS_YEAR = new Date().getFullYear();
export const ADMIN_TABS = [
  { id: 'users', label: '사용자·가입', href: '#/admin/users', lead: '가입 규칙, 가입 승인, 학생 명단, 역할을 관리합니다.' },
  { id: 'links', label: '연결표·요청', href: '#/admin/links', lead: '연구 번호와 실제 사람을 잇는 연결표와, 학생의 개인정보 요청을 처리합니다. 관리자만 봅니다.' },
  { id: 'ethics', label: '연구 윤리', href: '#/admin/ethics', lead: 'IRB 심의 여부, 연구 정보, 자료 보존 기간, 학생 연구 동의서를 정합니다.' },
  { id: 'tools', label: '연구 도구', href: '#/admin/tools', lead: '모든 학급이 같은 도구로 자료를 모으도록 채점·태그·설문·면담 기준을 정합니다.' },
  { id: 'practice', label: '연습 기본값', href: '#/admin/practice', lead: '증명 연습의 앱 전체 기본값입니다. 교사는 학급마다 바꿀 수 있습니다.' },
  { id: 'notices', label: '공지·안내', href: '#/admin/notices', lead: '앱 위쪽에 보일 공지와, 도움말에 보일 문의처를 정합니다.' },
  { id: 'audit', label: '관리 기록', href: '#/admin/audit', lead: '승인, 역할 변경, 연결표 내려받기·지우기 같은 중요한 일을 누가 언제 했는지 남깁니다.' },
];
const who = () => {
  const u = currentUser();
  return u ? displayName(u) : '미리보기';
};
/** 관리자 설정 머리 (빵 부스러기, 제목, 탭, 미리보기 안내) */
const chrome = (tab) => {
  const t = ADMIN_TABS.find((x) => x.id === tab);
  const open = getAdmin().requests.filter((x) => x.status === 'open').length;
  const tabs = ADMIN_TABS.map((x) => (x.id === 'links' && open ? { ...x, badge: open } : x));
  return `${breadcrumb([{ label: '관리자 보드', href: '#/admin' }, { label: '관리자 설정' }])}
    <header class="page-intro"><h1>관리자 설정</h1><p class="lead">${escapeHtml(t.lead)}</p></header>
    ${settingsTabs(tabs, tab, '관리자 설정')}
    ${previewNote()}`;
};

/** 관리자가 아니면 막는 화면 (막았으면 true) */
function guard(root, title) {
  const user = currentUser();
  if (user && !isAdmin(user)) {
    root.innerHTML = `<div class="page page--teacher">${breadcrumb([{ label: '교사 업무판', href: '#/teacher' }, { label: title }])}<h1>${escapeHtml(title)}</h1>${notice('lock', '관리자만 볼 수 있어요', '이 화면은 관리자 계정으로 로그인해야 볼 수 있습니다.')}</div>`;
    return true;
  }
  return false;
}
const previewNote = () => (currentUser() ? '' : notice('warn', '로그인하지 않은 미리보기입니다', '실제로는 관리자 계정만 이 화면을 볼 수 있습니다. 계정 화면에서 처음 로그인한 계정이 관리자가 됩니다.'));
const sessionLabelOf = (id) => sessionLabel(findSession(id)) || id;
const download = (text, name) => {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const profileText = (u) => (u.profile?.kind === 'student'
  ? `${u.profile.year}학년도 ${u.profile.studentNo} ${u.profile.name}`
  : u.profile ? [u.profile.name, u.profile.affiliation].filter(Boolean).join(', ') : '정보 입력 전');

// ── 가입 승인·명단·사용자 ─────────────────────

export function renderAdminUsers(root) {
  if (guard(root, '관리자 설정')) return null;
  let status = '';
  let rosterYear = THIS_YEAR;

  const draw = (focus = null) => {
    const d = getAccounts();
    const pending = d.users.filter((u) => u.status === 'pending');
    const others = d.users.filter((u) => u.status !== 'pending');
    const rules = getAdmin().signup;
    root.innerHTML = `<div class="page page--teacher page--admin">
      ${chrome('users')}
      ${isFirebase ? '' : notice('warn', '프로토타입 상태입니다', '계정은 이 브라우저에만 저장됩니다. 서버를 연결하면 구글 로그인과 서버 저장으로 바뀝니다.')}
      <section class="panel" aria-labelledby="ad-rules">
        <h2 id="ad-rules" class="section-title">가입 규칙</h2>
        <form class="settings-form" data-signup-rules novalidate>
          <label class="check"><input type="checkbox" name="rosterAutoApprove"${rules.rosterAutoApprove ? ' checked' : ''}><span>학생 명단과 맞으면 바로 승인 <span class="meta">끄면 모든 가입을 관리자가 승인합니다.</span></span></label>
          <label class="check"><input type="checkbox" name="allowGuests"${rules.allowGuests ? ' checked' : ''}><span>일반인 가입 받기 <span class="meta">끄면 가입 화면에서 "일반인"을 고를 수 없습니다.</span></span></label>
        </form>
      </section>
      <section class="panel" aria-labelledby="ad-pending">
        <div class="section-head">
          <h2 id="ad-pending" class="section-title">승인 대기 (${pending.length})</h2>
          ${pending.length > 1 ? '<button type="button" class="button button--primary button--small" data-action="approve-all">모두 승인</button>' : ''}
        </div>
        ${pending.length ? `<ul class="admin-list">${pending.map((u) => `<li class="admin-row" data-uid="${escapeHtml(u.uid)}">
          <div class="admin-row__main"><strong>${escapeHtml(displayName(u))}</strong> <span class="tag">${u.profile?.kind === 'student' ? '학생' : '일반인'}</span>
            <span class="meta">${escapeHtml(profileText(u))}${u.profile?.reason ? `, 이유: ${escapeHtml(u.profile.reason)}` : ''}, ${escapeHtml(u.email)}, ${escapeHtml(formatDateTime(u.submittedAt))} 신청</span>
            ${u.profile?.kind === 'student' ? '<span class="meta">명단에 없는 학생입니다(학번·이름이 다를 수 있음).</span>' : ''}</div>
          <div class="actions actions--start"><button type="button" class="button button--secondary button--small" data-action="approve">승인</button><button type="button" class="button button--ghost button--small" data-action="reject">거절</button></div>
        </li>`).join('')}</ul>` : '<p class="empty-text">승인을 기다리는 가입 신청이 없습니다.</p>'}
      </section>
      <section class="panel" aria-labelledby="ad-roster">
        <h2 id="ad-roster" class="section-title">학생 명단 (${d.roster.length}명)</h2>
        <p class="meta">명단에 있는 학생이 같은 학년도·학번·이름으로 가입하면 바로 승인됩니다. 엑셀에서 "학년도, 학번, 이름" 또는 "학번, 이름" 열을 복사해 붙여넣으세요(한 줄에 한 학생).</p>
        <form class="admin-roster" data-roster-form novalidate>
          <div class="field field--inline"><label class="field__label" for="ad-year">학년도 칸이 없을 때</label><input type="number" class="field__input" id="ad-year" name="year" value="${rosterYear}" inputmode="numeric"></div>
          <div class="field"><label class="field__label" for="ad-roster-text">명단</label><textarea class="field__input" id="ad-roster-text" name="roster" rows="4" placeholder="2026&#9;10203&#9;김민준&#10;10204&#9;이서연"></textarea></div>
          <div class="actions actions--start"><button type="submit" class="button button--secondary">명단에 더하기</button></div>
        </form>
        ${d.roster.length ? `<details class="ref-card"><summary>명단 보기 (${d.roster.length})</summary>
          <div class="table-wrap" role="region" aria-label="학생 명단" tabindex="0"><table class="data-table grade-table" data-roster-table>
            <thead><tr><th scope="col">학년도</th><th scope="col">학번</th><th scope="col">이름</th><th scope="col">가입</th><th scope="col"><span class="visually-hidden">지우기</span></th></tr></thead>
            <tbody>${d.roster.map((r) => {
              const joined = d.users.find((u) => u.profile?.kind === 'student' && String(u.profile.year) === String(r.year) && u.profile.studentNo === r.studentNo);
              return `<tr><td class="num">${r.year}</td><td class="num">${escapeHtml(r.studentNo)}</td><th scope="row">${escapeHtml(r.name)}</th><td>${joined ? escapeHtml(STATUS_LABELS[joined.status]) : '<span class="meta">가입 전</span>'}</td><td><button type="button" class="button button--ghost button--small" data-action="roster-remove" data-year="${r.year}" data-no="${escapeHtml(r.studentNo)}">지우기</button></td></tr>`;
            }).join('')}</tbody>
          </table></div>
        </details>` : ''}
      </section>
      <section class="panel" aria-labelledby="ad-users">
        <h2 id="ad-users" class="section-title">사용자 (${others.length})</h2>
        <p class="meta">역할: 관리자(가입 승인·연결표·연구 윤리 설정과 교사 일), 교사(학급·세션·채점·분석·면담), 학생(연습과 세션 코드로 탐구), 일반인(연습, 세션 코드가 있으면 탐구. 탐구 기록은 연구 분석에서 빠짐).</p>
        ${others.length ? `<div class="table-wrap" role="region" aria-labelledby="ad-users" tabindex="0"><table class="data-table grade-table" data-users-table>
          <thead><tr><th scope="col">이름</th><th scope="col">정보</th><th scope="col">상태</th><th scope="col">역할</th><th scope="col">연구 번호</th><th scope="col">세션</th></tr></thead>
          <tbody>${others.map((u) => `<tr data-uid="${escapeHtml(u.uid)}">
            <th scope="row">${escapeHtml(displayName(u))}${u.uid === d.currentUid ? ' <span class="tag tag--mint">나</span>' : ''}</th>
            <td>${escapeHtml(profileText(u))}<br><span class="meta">${escapeHtml(u.email)}</span></td>
            <td>${escapeHtml(STATUS_LABELS[u.status])}${u.autoApproved ? ' <span class="meta">(명단)</span>' : ''}</td>
            <td><label class="visually-hidden" for="role-${escapeHtml(u.uid)}">${escapeHtml(displayName(u))} 역할</label><select class="field__select admin-role" id="role-${escapeHtml(u.uid)}" name="role" data-uid="${escapeHtml(u.uid)}">${ROLES.map((r) => `<option value="${r.id}"${r.id === u.role ? ' selected' : ''}>${r.label}</option>`).join('')}</select></td>
            <td class="num">${escapeHtml(u.researchId)}</td>
            <td>${escapeHtml(u.sessionIds.map(sessionLabelOf).join(', ') || '–')}</td>
          </tr>`).join('')}</tbody>
        </table></div>` : '<p class="empty-text">아직 사용자가 없습니다.</p>'}
        <p class="save-status" role="status" data-admin-status>${escapeHtml(status)}</p>
      </section>
    </div>`;
    if (focus) root.querySelector(focus)?.focus();
  };

  const onClick = (event) => {
    const b = event.target.closest('[data-action]');
    if (!b) return;
    const a = b.dataset.action;
    const uid = b.closest('[data-uid]')?.dataset.uid;
    if (a === 'approve-all') {
      const ids = getAccounts().users.filter((u) => u.status === 'pending').map((u) => u.uid);
      approveUsers(ids);
      status = `${ids.length}명을 승인했습니다.`;
    } else if (a === 'approve') {
      approveUsers([uid]);
      status = '승인했습니다.';
    } else if (a === 'reject') {
      if (!window.confirm('이 가입 신청을 거절할까요?')) return;
      rejectUser(uid);
      status = '거절했습니다.';
    } else if (a === 'roster-remove') {
      removeRosterEntry(b.dataset.year, b.dataset.no);
      status = '명단에서 지웠습니다.';
    } else return;
    draw('#ad-pending');
  };
  const onSubmit = (event) => {
    if (!event.target.matches('[data-roster-form]')) return;
    event.preventDefault();
    rosterYear = Number(event.target.querySelector('[name="year"]').value) || THIS_YEAR;
    const res = addRoster(event.target.querySelector('[name="roster"]').value, rosterYear);
    status = `명단에 ${res.added}명을 더했습니다.${res.skipped ? ` 읽지 못했거나 이미 있는 줄 ${res.skipped}개는 건너뛰었습니다.` : ''}${res.approved ? ` 승인을 기다리던 학생 ${res.approved}명이 명단과 맞아 승인되었습니다.` : ''}`;
    draw('#ad-roster-text');
  };
  const onChange = (event) => {
    if (event.target.closest('[data-signup-rules]')) {
      saveSignupRules({ [event.target.name]: event.target.checked }, who());
      status = '가입 규칙을 저장했습니다.';
      return draw(`[name="${event.target.name}"]`);
    }
    if (event.target.name !== 'role') return;
    const ok = setRole(event.target.dataset.uid, event.target.value);
    status = ok ? '역할을 바꾸었습니다.' : '관리자는 한 명 이상 있어야 합니다.';
    draw(`select[data-uid="${event.target.dataset.uid}"]`);
  };

  draw();
  root.addEventListener('click', onClick);
  root.addEventListener('submit', onSubmit);
  root.addEventListener('change', onChange);
  return () => {
    root.removeEventListener('click', onClick);
    root.removeEventListener('submit', onSubmit);
    root.removeEventListener('change', onChange);
  };
}

// ── 연결표 ─────────────────────

export function renderAdminLinks(root) {
  if (guard(root, '관리자 설정')) return null;
  let status = '';
  const draw = (focus = null) => {
    const users = getAccounts().users.filter((u) => u.role === 'student' || u.role === 'guest');
    const reqs = getAdmin().requests;
    root.innerHTML = `<div class="page page--teacher page--admin">
      ${chrome('links')}
      <section class="panel" aria-labelledby="rq-heading">
        <h2 id="rq-heading" class="section-title">개인정보 요청 (처리 전 ${reqs.filter((q) => q.status === 'open').length})</h2>
        <p class="meta">학생·일반인이 "내 설정 > 개인정보"에서 보낸 기록 삭제·탈퇴 요청입니다. 연결표로 사람을 확인하고 처리한 뒤 "처리함"을 누르세요. 연구 자료는 철회 원칙(철회 전 자료 사용)을 따릅니다.</p>
        ${reqs.length ? `<ul class="admin-list" data-requests>${reqs.map((q) => `<li class="admin-row" data-req="${escapeHtml(q.id)}">
          <div class="admin-row__main"><strong>${escapeHtml(REQUEST_TYPES.find((t) => t.id === q.type)?.label ?? q.type)}</strong> <span class="tag${q.status === 'open' ? ' tag--warn' : ' tag--mint'}">${q.status === 'open' ? '처리 전' : '처리함'}</span>
            <span class="meta">${escapeHtml(q.researchId)}, ${escapeHtml(formatDateTime(q.at))}${q.reason ? `, 이유: ${escapeHtml(q.reason)}` : ''}${q.doneAt ? `, ${escapeHtml(formatDateTime(q.doneAt))} 처리${q.note ? `: ${escapeHtml(q.note)}` : ''}` : ''}</span></div>
          ${q.status === 'open' ? `<div class="inline-form"><label class="visually-hidden" for="rq-note-${escapeHtml(q.id)}">처리 메모</label><input type="text" class="field__input" id="rq-note-${escapeHtml(q.id)}" name="note" placeholder="처리 메모 (예: 연결 정보 지움)"><button type="button" class="button button--secondary button--small" data-action="req-done">처리함</button></div>` : ''}
        </li>`).join('')}</ul>` : '<p class="empty-text">받은 요청이 없습니다.</p>'}
      </section>
      <section class="panel" aria-labelledby="lk-table">
        <div class="section-head">
          <h2 id="lk-table" class="section-title">학생·일반인 ${users.length}명</h2>
          <span class="actions">
            <button type="button" class="button button--secondary button--small" data-action="csv"${users.length ? '' : ' disabled'}>연결표 내려받기 (CSV)</button>
            <button type="button" class="button button--ghost button--small" data-action="unlink-all"${users.some((u) => !u.unlinkedAt) ? '' : ' disabled'}>연결 정보 모두 지우기</button>
          </span>
        </div>
        <p class="meta">"연결 지우기"는 이름·학번·소속·이메일만 지우고 연구 번호와 활동 기록은 남깁니다(가명 자료가 됨). 보호자 동의는 종이 동의서를 받은 날짜를 적습니다.</p>
        ${users.length ? `<div class="table-wrap" role="region" aria-labelledby="lk-table" tabindex="0"><table class="data-table grade-table" data-links-table>
          <thead><tr><th scope="col">연구 번호</th><th scope="col">구분</th><th scope="col">이름</th><th scope="col">학번·소속</th><th scope="col">이메일</th><th scope="col">세션</th><th scope="col">보호자 동의</th><th scope="col"><span class="visually-hidden">연결 지우기</span></th></tr></thead>
          <tbody>${users.map((u) => `<tr data-uid="${escapeHtml(u.uid)}">
            <th scope="row" class="num">${escapeHtml(u.researchId)}</th>
            <td>${u.profile?.kind === 'student' ? '학생' : '일반인'}</td>
            <td>${u.unlinkedAt ? '<span class="meta">지움</span>' : escapeHtml(u.profile?.name ?? '')}</td>
            <td>${u.unlinkedAt ? '–' : escapeHtml(u.profile?.kind === 'student' ? `${u.profile.year} ${u.profile.studentNo}` : u.profile?.affiliation ?? '')}</td>
            <td>${escapeHtml(u.email || '–')}</td>
            <td>${escapeHtml(u.sessionIds.map(sessionLabelOf).join(', ') || '–')}</td>
            <td>${u.profile?.kind === 'student' ? `<label class="visually-hidden" for="gc-${escapeHtml(u.uid)}">${escapeHtml(u.researchId)} 보호자 동의 날짜</label><input type="date" class="field__input admin-date" id="gc-${escapeHtml(u.uid)}" name="guardian" data-uid="${escapeHtml(u.uid)}" value="${escapeHtml(u.guardianConsent ?? '')}">` : '–'}</td>
            <td>${u.unlinkedAt ? `<span class="meta">${escapeHtml(formatDateTime(u.unlinkedAt))} 지움</span>` : '<button type="button" class="button button--ghost button--small" data-action="unlink">연결 지우기</button>'}</td>
          </tr>`).join('')}</tbody>
        </table></div>` : '<p class="empty-text">아직 가입한 학생·일반인이 없습니다.</p>'}
        <p class="save-status" role="status" data-admin-status>${escapeHtml(status)}</p>
      </section>
    </div>`;
    if (focus) root.querySelector(focus)?.focus();
  };
  const onClick = (event) => {
    const b = event.target.closest('[data-action]');
    if (!b) return;
    const a = b.dataset.action;
    if (a === 'csv') {
      logAction('연결표 내려받기', '', who());
      return download(linkTableCsv(sessionLabelOf), `연결표-${new Date().toISOString().slice(0, 10)}.csv`);
    }
    if (a === 'req-done') {
      const li = b.closest('[data-req]');
      closeRequest(li.dataset.req, li.querySelector('[name="note"]').value, who());
      status = '요청을 처리함으로 바꾸었습니다.';
      return draw('#rq-heading');
    }
    if (a === 'unlink') {
      if (!window.confirm('이 사람의 이름·학번·소속·이메일을 지울까요? 되돌릴 수 없고, 연구 번호와 기록은 남습니다.')) return;
      unlinkUser(b.closest('[data-uid]').dataset.uid);
      status = '연결 정보를 지웠습니다.';
    }
    if (a === 'unlink-all') {
      if (!window.confirm('모든 학생·일반인의 연결 정보를 지울까요? 먼저 연결표를 내려받아 두세요. 되돌릴 수 없습니다.')) return;
      unlinkAll();
      status = '연결 정보를 모두 지웠습니다. 남은 연구 자료는 가명 자료입니다.';
    }
    draw('#lk-table');
  };
  const onChange = (event) => {
    if (event.target.name !== 'guardian') return;
    setGuardianConsent(event.target.dataset.uid, event.target.value);
    status = '보호자 동의 날짜를 저장했습니다.';
    const el = root.querySelector('[data-admin-status]');
    if (el) el.textContent = status;
  };
  draw();
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  return () => {
    root.removeEventListener('click', onClick);
    root.removeEventListener('change', onChange);
  };
}

// ── 연구 윤리 설정 ─────────────────────

const ETHICS_FIELDS = [
  { id: 'studyTitle', label: '연구 제목', irbOnly: false },
  { id: 'piName', label: '연구책임자 (이름, 소속)', irbOnly: false },
  { id: 'piContact', label: '연구책임자 연락처', irbOnly: false },
  { id: 'approvalNo', label: 'IRB 승인번호', irbOnly: true },
  { id: 'irbContact', label: 'IRB 연락처 (기관, 전화)', irbOnly: true },
];

export function renderEthics(root) {
  if (guard(root, '관리자 설정')) return null;
  let status = '';
  const draw = (focus = null) => {
    const e = ethics();
    const del = dataDeleteDate(e);
    const st = retentionState(del);
    const doc = consentDoc();
    const recUntil = retentionUntil();
    root.innerHTML = `<div class="page page--teacher page--admin">
      ${chrome('ethics')}
      <form class="settings-form" data-ethics-form novalidate>
        <section class="panel" aria-labelledby="et-irb">
          <h2 id="et-irb" class="section-title">IRB 심의</h2>
          <fieldset class="choice-group"><legend class="visually-hidden">IRB 심의</legend>
            <label class="check"><input type="radio" name="irb" value="yes"${e.irb ? ' checked' : ''}><span>IRB 심의를 받음 <span class="meta">연구 설명문과 동의서 양식(승인번호·연구책임자·IRB 연락처), 자료 보존은 연구 종료 뒤 ${e.retentionYears}년(IRB가 정한 기간으로 바꿀 수 있음)</span></span></label>
            <label class="check"><input type="radio" name="irb" value="no"${e.irb ? '' : ' checked'}><span>IRB 심의를 받지 않음 (학교 안 수업 개선 연구) <span class="meta">학교 승인과 학생·보호자 안내 중심의 간단한 동의서, 자료 삭제일은 관리자가 정함</span></span></label>
          </fieldset>
          <p class="meta">두 경우 모두 학생 연구 동의, 보호자 동의 확인(연결표에 날짜), 가명 처리(연구 번호), 철회 전 자료 사용 원칙은 같습니다.</p>
        </section>
        <section class="panel" aria-labelledby="et-info">
          <h2 id="et-info" class="section-title">연구 정보</h2>
          <div class="sv-inst">${ETHICS_FIELDS.filter((f) => !f.irbOnly || e.irb).map((f) => `<div class="field"><label class="field__label" for="et-${f.id}">${escapeHtml(f.label)}</label><input type="text" class="field__input" id="et-${f.id}" name="${f.id}" value="${escapeHtml(e[f.id] ?? '')}"></div>`).join('')}</div>
        </section>
        <section class="panel" aria-labelledby="et-keep">
          <h2 id="et-keep" class="section-title">연구 자료 보존</h2>
          ${e.irb
            ? `<div class="account-grid">
                <div class="field"><label class="field__label" for="et-end">연구 종료일</label><input type="date" class="field__input" id="et-end" name="studyEnd" value="${escapeHtml(e.studyEnd)}"></div>
                <div class="field"><label class="field__label" for="et-years">종료 뒤 보존 (년)</label><input type="number" class="field__input" id="et-years" name="retentionYears" min="1" max="10" value="${e.retentionYears}"></div>
              </div>
              <p class="meta">보존 기간은 심의받은 연구계획서에 적은 기간을 따르세요. 기본값 3년은 관련 법령의 연구 기록 보관 기간을 참고한 값이며, IRB에 확인해야 합니다.</p>`
            : `<div class="field field--inline"><label class="field__label" for="et-del">연구 자료 삭제일</label><input type="date" class="field__input" id="et-del" name="deleteBy" value="${escapeHtml(e.deleteBy)}"></div>
              <p class="meta">학교와 학생·보호자에게 안내한 날짜로 정하세요.</p>`}
          <p class="et-delete">${del ? `연구 자료 삭제 예정일: <strong>${escapeHtml(del)}</strong>${st.state === 'over' ? ' <span class="tag tag--warn">지났습니다</span>' : st.state === 'soon' ? ` <span class="tag tag--warn">${st.days}일 남음</span>` : ''}` : '<span class="meta">삭제 예정일을 정하지 않았습니다.</span>'}</p>
          <div class="field field--inline"><label class="field__label" for="et-rec">면담 녹음 보관 기한 (연구 기간)</label><input type="date" class="field__input" id="et-rec" name="recordingUntil" value="${escapeHtml(recUntil ?? '')}"></div>
          <p class="meta">녹음은 기한 14일 전부터 교사 화면에 알림이 나오고, 교사가 내려받은 뒤 <a href="#/teacher/recordings">녹음 관리</a>에서 지웁니다(자동 삭제 없음).</p>
        </section>
        <p class="save-status" role="status" data-admin-status>${escapeHtml(status)}</p>
      </form>
      <section class="panel" aria-labelledby="et-consent">
        <h2 id="et-consent" class="section-title">학생 연구 동의서</h2>
        <p class="meta">학생이 1단계 전에 읽고 동의 여부를 고르는 글입니다. "# "로 시작하는 줄은 소제목입니다. 내용을 바꾸면 판이 바뀌어 학생이 어느 판에 동의했는지 남습니다. 지금 판: ${escapeHtml(doc.version)}${doc.editedAt ? `, ${escapeHtml(formatDateTime(doc.editedAt))} 수정` : ''}</p>
        <div class="actions actions--start"><button type="button" class="button button--secondary" data-action="template">${e.irb ? 'IRB 양식(연구 설명문 + 동의서) 넣기' : '학교 양식 넣기'}</button></div>
        <form class="settings-form rubric-form" data-consent-form novalidate>
          <div class="field"><label class="field__label" for="consent-title">제목</label><input type="text" class="field__input" id="consent-title" name="title" value="${escapeHtml(doc.title)}"></div>
          <div class="field"><label class="field__label" for="consent-body">내용 <span class="field__req">(줄마다 한 문단)</span></label><textarea class="field__input" id="consent-body" name="body" rows="10">${escapeHtml(doc.body)}</textarea></div>
          <div class="actions"><button type="submit" class="button button--primary">동의서 저장</button></div>
        </form>
      </section>
    </div>`;
    if (focus) root.querySelector(focus)?.focus();
  };
  const onChange = (event) => {
    const t = event.target;
    if (!t.closest('[data-ethics-form]')) return;
    if (t.name === 'recordingUntil') setRetentionUntil(t.value);
    else if (t.name === 'irb') {
      saveEthics({ irb: t.value === 'yes' });
      logAction('IRB 설정 변경', t.value === 'yes' ? 'IRB 받음' : 'IRB 받지 않음', who());
    }
    else if (t.name === 'retentionYears') saveEthics({ retentionYears: Math.min(10, Math.max(1, Number(t.value) || 3)) });
    else saveEthics({ [t.name]: t.value.trim() });
    status = '저장했습니다.';
    draw(t.id ? `#${t.id}` : null);
  };
  const onClick = (event) => {
    if (!event.target.closest('[data-action="template"]')) return;
    if (!window.confirm('지금 동의서 글을 양식으로 바꿀까요? 판이 바뀌어 이미 동의한 학생 기록에는 예전 판이 남습니다.')) return;
    const tpl = consentTemplate(ethics());
    saveConsent(tpl);
    logAction('동의서 양식 넣음', tpl.title, who());
    status = `${tpl.title}을(를) 넣었습니다.`;
    draw('[data-action="template"]');
  };
  const onSubmit = (event) => {
    if (!event.target.matches('[data-consent-form]')) return;
    event.preventDefault();
    const f = event.target;
    saveConsent({ title: f.querySelector('[name="title"]').value.trim() || '연구 참여 동의', body: f.querySelector('[name="body"]').value.trim() });
    logAction('동의서 고침', consentDoc().version, who());
    status = '동의서를 저장했습니다.';
    draw('#consent-title');
  };
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


// ── 연구 도구 ─────────────────────

export function renderAdminTools(root) {
  if (guard(root, '관리자 설정')) return null;
  let status = '';
  const draw = (focus = null) => {
    const g = getGrading();
    const th = interviewThresholds();
    const surveys = listSurveys();
    root.innerHTML = `<div class="page page--teacher page--admin">
      ${chrome('tools')}
      <section class="panel" aria-labelledby="tl-edit">
        <h2 id="tl-edit" class="section-title">도구 고치기</h2>
        <ul class="task-grid">
          <li><a class="task-tile" href="#/teacher/rubric"><span class="task-tile__title">채점 루브릭</span><span class="task-tile__desc">기준 ${activeRubric().length}개, 10점 만점. 기준 이름·설명·점수 설명</span></a></li>
          <li><a class="task-tile" href="#/teacher/chat-tags"><span class="task-tile__title">AI 대화 태그</span><span class="task-tile__desc">태그 ${activeChatTags().length}개. 이름·설명, 더하기·지우기</span></a></li>
          <li><a class="task-tile" href="#/teacher/surveys"><span class="task-tile__title">설문 문항·평가도구</span><span class="task-tile__desc">설문 ${surveys.length}개. 하위 요인, 척도, 붙여넣기. 세션마다 쓸 설문은 교사가 고름</span></a></li>
        </ul>
        <p class="meta">학생 연구 동의서는 "연구 윤리" 탭에 있습니다.</p>
      </section>
      <section class="panel" aria-labelledby="tl-rater">
        <h2 id="tl-rater" class="section-title">AI 채점</h2>
        <form class="settings-form" data-tools-form novalidate>
          <label class="check"><input type="checkbox" name="aiAsRater"${g.aiAsRater ? ' checked' : ''}><span>AI를 보조 채점자로 쓰기 <span class="meta">켜면 연구 분석의 점수 출처에 "채점자 1과 AI 평균"이 생기고, 채점 화면에 채점자와 AI의 일치도가 나옵니다. 끄면 AI 채점은 참고로만 남습니다.</span></span></label>
        </form>
      </section>
      <section class="panel" aria-labelledby="tl-iv">
        <h2 id="tl-iv" class="section-title">면담 후보 기준</h2>
        <p class="meta">10점 만점 점수 기준입니다. 면담 화면의 추천 후보가 이 값으로 계산됩니다.</p>
        <form class="iv-criteria" data-threshold-form novalidate>
          ${THRESHOLD_FIELDS.map((f) => `<div class="field iv-criteria__field">
            <label class="field__label" for="th-${f.id}">${escapeHtml(f.label)} <span class="field__req">${f.types.map((t) => `유형 ${t.slice(1)}`).join(', ')}</span></label>
            <span class="iv-criteria__input"><input type="number" class="field__input" id="th-${f.id}" name="${f.id}" value="${th[f.id]}" min="${f.min}" max="${f.max}" step="${f.step}" inputmode="decimal"><span class="meta">${escapeHtml(f.unit)}</span></span>
          </div>`).join('')}
        </form>
        <div class="actions actions--start"><button type="button" class="button button--ghost button--small" data-action="reset-th">기본값으로 (보통 기준)</button></div>
      </section>
      <p class="save-status" role="status" data-admin-status>${escapeHtml(status)}</p>
    </div>`;
    if (focus) root.querySelector(focus)?.focus();
  };
  const onChange = (event) => {
    const t = event.target;
    if (t.name === 'aiAsRater') {
      updateGradingSettings({ aiAsRater: t.checked });
      logAction('AI 보조 채점자', t.checked ? '켬' : '끔', who());
      status = t.checked ? 'AI를 보조 채점자로 씁니다.' : 'AI 채점은 참고로만 남깁니다.';
      return draw('[name="aiAsRater"]');
    }
    if (t.closest('[data-threshold-form]')) {
      const v = Number(t.value);
      if (t.value === '' || Number.isNaN(v)) return;
      saveThresholds({ [t.name]: Math.min(Number(t.max), Math.max(Number(t.min), v)) });
      status = '면담 후보 기준을 저장했습니다.';
      draw(`[name="${t.name}"]`);
    }
  };
  const onClick = (event) => {
    if (!event.target.closest('[data-action="reset-th"]')) return;
    resetThresholds();
    status = '면담 후보 기준을 기본값으로 돌렸습니다.';
    draw('[data-action="reset-th"]');
  };
  draw();
  root.addEventListener('change', onChange);
  root.addEventListener('click', onClick);
  return () => {
    root.removeEventListener('change', onChange);
    root.removeEventListener('click', onClick);
  };
}

// ── 연습 기본값 ─────────────────────

export function renderAdminPractice(root) {
  if (guard(root, '관리자 설정')) return null;
  let status = '';
  const draw = (focus = null) => {
    const p = getAdmin().practice;
    root.innerHTML = `<div class="page page--teacher page--admin">
      ${chrome('practice')}
      <section class="panel" aria-labelledby="pd-heading">
        <h2 id="pd-heading" class="section-title">증명 연습 기본값</h2>
        <form class="settings-form" data-practice-defaults novalidate>
          ${PRACTICE_FIELDS.map((f) => (f.type === 'bool'
            ? `<label class="check"><input type="checkbox" name="${f.id}"${p[f.id] ? ' checked' : ''}><span>${escapeHtml(f.label)} <span class="meta">${escapeHtml(f.help)}</span></span></label>`
            : `<div class="field"><label class="field__label" for="pd-${f.id}">${escapeHtml(f.label)}</label><p class="field__help" id="pd-${f.id}-help">${escapeHtml(f.help)}</p>
              <span class="iv-criteria__input"><input type="number" class="field__input" id="pd-${f.id}" name="${f.id}" min="${f.min}" max="${f.max}" value="${p[f.id]}" aria-describedby="pd-${f.id}-help" inputmode="numeric"><span class="meta">${escapeHtml(f.unit)}</span></span></div>`)).join('')}
        </form>
        <p class="meta">교사는 "교사 설정 > 증명 연습"에서 학급마다 바꿀 수 있습니다. 학급에 속하지 않은 일반인은 이 기본값을 씁니다.</p>
        <p class="save-status" role="status" data-admin-status>${escapeHtml(status)}</p>
      </section>
    </div>`;
    if (focus) root.querySelector(focus)?.focus();
  };
  const onChange = (event) => {
    const t = event.target;
    if (!t.closest('[data-practice-defaults]')) return;
    const f = PRACTICE_FIELDS.find((x) => x.id === t.name);
    if (!f) return;
    if (f.type === 'bool') savePracticeDefaults({ [f.id]: t.checked }, who());
    else {
      const v = Number(t.value);
      if (t.value === '' || Number.isNaN(v)) return;
      savePracticeDefaults({ [f.id]: Math.min(f.max, Math.max(f.min, Math.round(v))) }, who());
    }
    status = '기본값을 저장했습니다.';
    draw(`[name="${t.name}"]`);
  };
  draw();
  root.addEventListener('change', onChange);
  return () => root.removeEventListener('change', onChange);
}

// ── 공지·안내 ─────────────────────

export function renderAdminNotices(root) {
  if (guard(root, '관리자 설정')) return null;
  let status = '';
  const draw = (focus = null) => {
    const d = getAdmin();
    const c = d.contact;
    const today = new Date().toISOString().slice(0, 10);
    root.innerHTML = `<div class="page page--teacher page--admin">
      ${chrome('notices')}
      <section class="panel" aria-labelledby="nt-new">
        <h2 id="nt-new" class="section-title">공지 올리기</h2>
        <form class="settings-form admin-roster" data-notice-form novalidate>
          <div class="field"><label class="field__label" for="nt-title">제목</label><input type="text" class="field__input" id="nt-title" name="title" placeholder="예: 12월 2일 밤 점검으로 30분 쓸 수 없어요"></div>
          <div class="field"><label class="field__label" for="nt-body">내용 <span class="field__req">(선택)</span></label><textarea class="field__input" id="nt-body" name="body" rows="2"></textarea></div>
          <div class="account-grid">
            <div class="field"><label class="field__label" for="nt-aud">보일 사람</label><select class="field__select" id="nt-aud" name="audience">${NOTICE_AUDIENCES.map((a) => `<option value="${a.id}">${a.label}</option>`).join('')}</select></div>
            <div class="field"><label class="field__label" for="nt-until">이날까지 보이기 <span class="field__req">(선택)</span></label><input type="date" class="field__input" id="nt-until" name="until" min="${today}"></div>
          </div>
          <p class="field__error" data-notice-error hidden>제목을 쓰세요.</p>
          <div class="actions actions--start"><button type="submit" class="button button--primary">공지 올리기</button></div>
        </form>
      </section>
      <section class="panel" aria-labelledby="nt-list">
        <h2 id="nt-list" class="section-title">공지 (${d.notices.length})</h2>
        ${d.notices.length ? `<ul class="admin-list" data-notice-list>${d.notices.map((n) => `<li class="admin-row" data-notice="${escapeHtml(n.id)}">
          <div class="admin-row__main"><strong>${escapeHtml(n.title)}</strong> <span class="tag">${escapeHtml(NOTICE_AUDIENCES.find((a) => a.id === n.audience)?.label ?? '')}</span>${n.until && n.until < today ? ' <span class="tag tag--warn">기한 지남</span>' : ''}
            ${n.body ? `<span>${escapeHtml(n.body)}</span>` : ''}<span class="meta">${escapeHtml(formatDateTime(n.createdAt))}${n.until ? `, ${escapeHtml(n.until)}까지` : ''}</span></div>
          <div class="actions actions--start"><button type="button" class="button button--ghost button--small" data-action="notice-remove">내리기</button></div>
        </li>`).join('')}</ul>` : '<p class="empty-text">올린 공지가 없습니다.</p>'}
      </section>
      <section class="panel" aria-labelledby="nt-contact">
        <h2 id="nt-contact" class="section-title">문의처</h2>
        <p class="meta">학생·교사의 "내 설정 > 도움말"에 보입니다.</p>
        <form class="settings-form admin-roster" data-contact-form novalidate>
          <div class="field"><label class="field__label" for="ct-name">담당</label><input type="text" class="field__input" id="ct-name" name="name" value="${escapeHtml(c.name)}" placeholder="예: 수학과 홍길동 선생님"></div>
          <div class="field"><label class="field__label" for="ct-email">연락처</label><input type="text" class="field__input" id="ct-email" name="email" value="${escapeHtml(c.email)}" placeholder="예: 학교 메신저, 이메일"></div>
          <div class="field"><label class="field__label" for="ct-note">안내</label><input type="text" class="field__input" id="ct-note" name="note" value="${escapeHtml(c.note)}" placeholder="예: 수업 시간에는 선생님께 직접 말해 주세요"></div>
        </form>
      </section>
      <p class="save-status" role="status" data-admin-status>${escapeHtml(status)}</p>
    </div>`;
    if (focus) root.querySelector(focus)?.focus();
  };
  const onSubmit = (event) => {
    if (!event.target.matches('[data-notice-form]')) return;
    event.preventDefault();
    const f = event.target;
    const title = f.querySelector('[name="title"]').value.trim();
    if (!title) {
      f.querySelector('[data-notice-error]').hidden = false;
      return f.querySelector('[name="title"]').focus();
    }
    addNotice({ title, body: f.querySelector('[name="body"]').value, audience: f.querySelector('[name="audience"]').value, until: f.querySelector('[name="until"]').value }, who());
    status = '공지를 올렸습니다.';
    draw('#nt-list');
  };
  const onClick = (event) => {
    const b = event.target.closest('[data-action="notice-remove"]');
    if (!b) return;
    removeNotice(b.closest('[data-notice]').dataset.notice, who());
    status = '공지를 내렸습니다.';
    draw('#nt-list');
  };
  const onChange = (event) => {
    if (!event.target.closest('[data-contact-form]')) return;
    saveContact({ [event.target.name]: event.target.value.trim() });
    const el = root.querySelector('[data-admin-status]');
    if (el) el.textContent = '문의처를 저장했습니다.';
  };
  draw();
  root.addEventListener('submit', onSubmit);
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  return () => {
    root.removeEventListener('submit', onSubmit);
    root.removeEventListener('click', onClick);
    root.removeEventListener('change', onChange);
  };
}

// ── 관리 기록 ─────────────────────

export function renderAdminAudit(root) {
  if (guard(root, '관리자 설정')) return null;
  const draw = () => {
    const log = auditLog();
    root.innerHTML = `<div class="page page--teacher page--admin">
      ${chrome('audit')}
      <section class="panel" aria-labelledby="au-heading">
        <div class="section-head">
          <h2 id="au-heading" class="section-title">관리 기록 (${log.length})</h2>
          <button type="button" class="button button--secondary button--small" data-action="audit-csv"${log.length ? '' : ' disabled'}>CSV 내려받기</button>
        </div>
        <p class="meta">${isFirebase ? '가입 승인·역할·명단·연결표·연구 윤리·가입 규칙 기록은 서버가 남겨 고칠 수 없습니다. 그 밖의 기록은 아직 이 브라우저에 남습니다(서버 연결 진행 중).' : '최근 500개까지 남습니다. 서버를 연결하면 서버만 쓸 수 있게 해 고칠 수 없게 합니다.'}</p>
        ${log.length ? `<div class="table-wrap" role="region" aria-labelledby="au-heading" tabindex="0"><table class="data-table grade-table" data-audit-table>
          <thead><tr><th scope="col">시각</th><th scope="col">한 사람</th><th scope="col">작업</th><th scope="col">내용</th></tr></thead>
          <tbody>${log.map((a) => `<tr><td>${escapeHtml(formatDateTime(a.at))}</td><td>${escapeHtml(a.by || '–')}</td><th scope="row">${escapeHtml(a.action)}</th><td>${escapeHtml(a.detail || '')}</td></tr>`).join('')}</tbody>
        </table></div>` : '<p class="empty-text">아직 기록이 없습니다.</p>'}
      </section>
    </div>`;
  };
  const onClick = (event) => {
    if (!event.target.closest('[data-action="audit-csv"]')) return;
    download(auditCsv(), `관리기록-${new Date().toISOString().slice(0, 10)}.csv`);
  };
  draw();
  root.addEventListener('click', onClick);
  return () => root.removeEventListener('click', onClick);
}

/** #/admin/:tab */
export function renderAdmin(root, [tab]) {
  const map = { users: renderAdminUsers, links: renderAdminLinks, ethics: renderEthics, tools: renderAdminTools, practice: renderAdminPractice, notices: renderAdminNotices, audit: renderAdminAudit };
  if (!tab) return renderAdminBoard(root);
  return (map[tab] ?? renderAdminUsers)(root);
}

// ── 관리자 보드 (2026-11-27 사용자 결정): 관리자가 할 일을 한눈에, 항목을 누르면 관리자 설정의 해당 탭으로 ─────

export function renderAdminBoard(root) {
  if (guard(root, '관리자 보드')) return null;
  const d = getAccounts();
  const a = getAdmin();
  const pending = d.users.filter((u) => u.status === 'pending').length;
  const openReq = a.requests.filter((q) => q.status === 'open').length;
  const count = (role) => d.users.filter((u) => u.role === role && u.status === 'approved').length;
  const del = dataDeleteDate(ethics());
  const delSt = retentionState(del);
  const rec = retentionUntil();
  const recSt = retentionState(rec);
  const today = new Date().toISOString().slice(0, 10);
  const liveNotices = a.notices.filter((n) => !n.until || n.until >= today).length;
  const stateText = (date, st) => (!date ? '정하지 않음' : st.state === 'over' ? `${date} (지남)` : st.state === 'soon' ? `${date} (${st.days}일 남음)` : date);
  const tile = (href, title, value, sub, warn = false) => `<li><a class="task-tile board-tile${warn ? ' is-warn' : ''}" href="${href}"><span class="task-tile__desc">${escapeHtml(title)}</span><span class="board-tile__value num">${escapeHtml(String(value))}</span><span class="task-tile__desc">${escapeHtml(sub)}</span></a></li>`;
  root.innerHTML = `<div class="page page--teacher page--admin">
    ${breadcrumb([{ label: '홈', href: '#/' }, { label: '관리자 보드' }])}
    <header class="page-intro board-head">
      <div><h1>관리자 보드</h1><p class="lead">관리자가 처리할 일을 모았습니다. 항목을 누르면 관리자 설정의 해당 탭이 열립니다.</p></div>
      <a class="button button--secondary" href="#/admin/users">관리자 설정</a>
    </header>
    ${previewNote()}
    <section class="panel" aria-labelledby="ab-todo">
      <h2 id="ab-todo" class="section-title">할 일</h2>
      <ul class="task-grid">
        ${tile('#/admin/users', '가입 승인 대기', `${pending}명`, pending ? '승인하거나 거절하세요' : '기다리는 사람이 없습니다', pending > 0)}
        ${tile('#/admin/links', '처리 전 개인정보 요청', `${openReq}건`, openReq ? '기록 삭제·탈퇴 요청' : '받은 요청이 없습니다', openReq > 0)}
        ${tile('#/admin/ethics', '연구 자료 삭제 예정일', stateText(del, delSt), ethics().irb ? 'IRB: 연구 종료 뒤 보존' : '관리자가 정한 날', delSt.state === 'over' || delSt.state === 'soon')}
        ${tile('#/admin/ethics', '면담 녹음 보관 기한', stateText(rec, recSt), '지나면 녹음 관리에서 지움', recSt.state === 'over' || recSt.state === 'soon')}
      </ul>
    </section>
    <section class="panel" aria-labelledby="ab-now">
      <h2 id="ab-now" class="section-title">현황</h2>
      <ul class="task-grid">
        ${tile('#/admin/users', '사용자', `${d.users.filter((u) => u.status === 'approved').length}명`, `학생 ${count('student')} · 교사 ${count('teacher')} · 일반인 ${count('guest')} · 관리자 ${count('admin')}`)}
        ${tile('#/admin/users', '학생 명단', `${d.roster.length}명`, `명단 자동 승인 ${a.signup.rosterAutoApprove ? '켬' : '끔'} · 일반인 가입 ${a.signup.allowGuests ? '받음' : '안 받음'}`)}
        ${tile('#/admin/notices', '게시 중인 공지', `${liveNotices}개`, a.contact.name ? `문의처: ${a.contact.name}` : '문의처를 아직 정하지 않았습니다')}
        ${tile('#/admin/tools', '연구 도구', `설문 ${listSurveys().length}개`, `AI 보조 채점자 ${getGrading().aiAsRater ? '켬' : '끔'}`)}
      </ul>
    </section>
    <section class="panel" aria-labelledby="ab-log">
      <div class="section-head"><h2 id="ab-log" class="section-title">최근 관리 기록</h2><a class="an-link" href="#/admin/audit">전체 보기</a></div>
      ${auditLog().length ? `<ul class="answer-list">${auditLog().slice(0, 5).map((x) => `<li><strong>${escapeHtml(x.action)}</strong><span class="meta">${escapeHtml(formatDateTime(x.at))}, ${escapeHtml(x.by || '–')}${x.detail ? `, ${escapeHtml(x.detail)}` : ''}</span></li>`).join('')}</ul>` : '<p class="empty-text">아직 기록이 없습니다.</p>'}
    </section>
  </div>`;
  return null;
}
