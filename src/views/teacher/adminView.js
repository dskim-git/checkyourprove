// 관리자 화면 (로드맵 3단계 프로토타입): 가입 승인, 학생 명단, 사용자와 역할 / 연결표 / 연구 윤리 설정
//   #/teacher/admin          가입 승인 대기(하나씩·모두 승인, 거절), 학생 명단 올리기(명단과 맞으면 바로 승인), 사용자 목록·역할 바꾸기
//   #/teacher/admin/links    연결표(연구 번호 ↔ 이름·학번·소속·이메일): 보기, 보호자 동의 날짜, CSV 내려받기, 연결 지우기(하나·모두)
//   #/teacher/admin/ethics   연구 윤리 설정: IRB 받음/안 받음과 그에 따른 동의서 양식·보존 기간, AI 보조 채점자는 채점 화면에서
// 프로토타입: 로그인한 사람이 관리자가 아니면 막는다. 로그인하지 않은 미리보기에서는 볼 수 있게 두고 알린다.
// TODO(Firebase): 이 화면의 읽기·쓰기는 서버 규칙으로 관리자만 허용한다(사용자 지정 클레임 role=admin).

import {
  addRoster, approveUsers, currentUser, dataDeleteDate, displayName, ethics, getAccounts, isAdmin, linkTableCsv, rejectUser, removeRosterEntry,
  ROLES, saveEthics, setGuardianConsent, setRole, STATUS_LABELS, unlinkAll, unlinkUser,
} from '../../state/accountStore.js';
import { consentDoc, saveConsent } from '../../state/surveyStore.js';
import { findSession, sessionLabel } from '../../state/sessionStore.js';
import { retentionState } from '../../state/recordingStore.js';
import { breadcrumb, notice } from '../../ui/components.js';
import { escapeHtml, formatDateTime } from '../../ui/dom.js';
import { consentTemplate } from '../../data/consentTemplates.js';

const THIS_YEAR = new Date().getFullYear();
const tabs = (here) => `<nav class="an-nav admin-tabs" aria-label="관리자 화면">
  ${[['#/teacher/admin', 'users', '가입 승인·명단'], ['#/teacher/admin/links', 'links', '연결표'], ['#/teacher/admin/ethics', 'ethics', '연구 윤리 설정']]
    .map(([href, id, label]) => `<a class="button button--${id === here ? 'primary' : 'ghost'} button--small" href="${href}"${id === here ? ' aria-current="page"' : ''}>${label}</a>`).join('')}
</nav>`;

/** 관리자가 아니면 막는 화면 (막았으면 true) */
function guard(root, title) {
  const user = currentUser();
  if (user && !isAdmin(user)) {
    root.innerHTML = `<div class="page page--teacher">${breadcrumb([{ label: '교사 화면', href: '#/teacher' }, { label: title }])}<h1>${escapeHtml(title)}</h1>${notice('lock', '관리자만 볼 수 있어요', '이 화면은 관리자 계정으로 로그인해야 볼 수 있습니다.')}</div>`;
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
  if (guard(root, '관리자')) return null;
  let status = '';
  let rosterYear = THIS_YEAR;

  const draw = (focus = null) => {
    const d = getAccounts();
    const pending = d.users.filter((u) => u.status === 'pending');
    const others = d.users.filter((u) => u.status !== 'pending');
    root.innerHTML = `<div class="page page--teacher page--admin">
      ${breadcrumb([{ label: '교사 화면', href: '#/teacher' }, { label: '관리자' }])}
      <header class="page-intro"><h1>관리자</h1><p class="lead">가입 신청을 승인하고, 학생 명단과 역할을 관리합니다.</p></header>
      ${tabs('users')}
      ${previewNote()}
      ${notice('warn', '프로토타입 상태입니다', '계정은 이 브라우저에만 저장됩니다. 서버를 연결하면 구글 로그인과 서버 저장으로 바뀝니다.')}
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
  if (guard(root, '연결표')) return null;
  let status = '';
  const draw = (focus = null) => {
    const users = getAccounts().users.filter((u) => u.role === 'student' || u.role === 'guest');
    root.innerHTML = `<div class="page page--teacher page--admin">
      ${breadcrumb([{ label: '교사 화면', href: '#/teacher' }, { label: '관리자', href: '#/teacher/admin' }, { label: '연결표' }])}
      <header class="page-intro"><h1>연결표</h1><p class="lead">연구 자료에는 이름 대신 연구 번호를 씁니다. 연구 번호와 실제 사람을 잇는 이 표는 관리자만 보고, 연구가 끝나면 지웁니다.</p></header>
      ${tabs('links')}
      ${previewNote()}
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
    if (a === 'csv') return download(linkTableCsv(sessionLabelOf), `연결표-${new Date().toISOString().slice(0, 10)}.csv`);
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
  if (guard(root, '연구 윤리 설정')) return null;
  let status = '';
  const draw = (focus = null) => {
    const e = ethics();
    const del = dataDeleteDate(e);
    const st = retentionState(del);
    root.innerHTML = `<div class="page page--teacher page--admin">
      ${breadcrumb([{ label: '교사 화면', href: '#/teacher' }, { label: '관리자', href: '#/teacher/admin' }, { label: '연구 윤리 설정' }])}
      <header class="page-intro"><h1>연구 윤리 설정</h1><p class="lead">기관생명윤리위원회(IRB) 심의를 받는지에 따라 동의서 양식과 자료 보존 기간이 달라집니다.</p></header>
      ${tabs('ethics')}
      ${previewNote()}
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
          <p class="meta">면담 녹음은 따로 <a href="#/teacher/recordings">녹음 관리</a>에서 보관 기한을 정합니다.</p>
        </section>
        <section class="panel" aria-labelledby="et-consent">
          <h2 id="et-consent" class="section-title">학생 연구 동의서</h2>
          <p class="meta">지금 동의서: ${escapeHtml(consentDoc().title)} (판 ${escapeHtml(consentDoc().version)}). 양식을 넣으면 위의 연구 정보로 채운 동의서로 바뀌고, 판이 바뀌어 학생이 어느 판에 동의했는지 남습니다. 넣은 뒤 <a href="#/teacher/surveys">설문과 연구 동의</a>에서 고칠 수 있습니다.</p>
          <div class="actions actions--start"><button type="button" class="button button--secondary" data-action="template">${e.irb ? 'IRB 양식(연구 설명문 + 동의서) 넣기' : '학교 양식 넣기'}</button></div>
        </section>
        <p class="save-status" role="status" data-admin-status>${escapeHtml(status)}</p>
      </form>
    </div>`;
    if (focus) root.querySelector(focus)?.focus();
  };
  const onChange = (event) => {
    const t = event.target;
    if (!t.closest('[data-ethics-form]')) return;
    if (t.name === 'irb') saveEthics({ irb: t.value === 'yes' });
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
    status = `${tpl.title}을(를) 넣었습니다.`;
    draw('[data-action="template"]');
  };
  draw();
  root.addEventListener('change', onChange);
  root.addEventListener('click', onClick);
  return () => {
    root.removeEventListener('change', onChange);
    root.removeEventListener('click', onClick);
  };
}

