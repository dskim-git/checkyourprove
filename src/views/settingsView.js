// 내 설정 (설정 정리 작업, 2026-11-27 사용자 결정): 학생·일반인의 설정이자, 교사·관리자의 개인 설정. 위쪽 탭, 탭마다 주소.
//   #/settings/account  계정: 내 정보, 역할·상태, 참여한 세션과 세션 코드 입력, 로그아웃
//   #/settings/display  화면·입력: 글자 크기, 대비 높이기, 움직임 줄이기, 증명 칸 기본 입력 방식, 손가락으로도 쓰기
//   #/settings/privacy  개인정보: 연구 참여(동의) 상태, 내 기록 내려받기, 기록 삭제·탈퇴 요청과 처리 상황, 개인정보 처리 안내
//   #/settings/help     도움말: 역할별 사용 안내, 문의처(관리자가 정함), 앱 정보

import { addRequest, getAdmin, REQUEST_TYPES, requestsOf } from '../state/adminStore.js';
import {
  canTeach, currentUser, displayName, ethics, isAdmin, roleLabel, signOut, STATUS_LABELS,
} from '../state/accountStore.js';
import { FONT_SCALES, getPrefs, INPUT_MODES, resetPrefs, savePrefs } from '../state/prefsStore.js';
import { listAttempts } from '../state/attemptStore.js';
import { getConsent, getResearch } from '../state/researchStore.js';
import { findSession, formatCode, getSessions, sessionLabel } from '../state/sessionStore.js';
import { getClassroom } from '../state/classroomStore.js';
import { APP_INFO } from '../data/appInfo.js';
import { isBrowserOnly, isDemo, isFirebase } from '../state/appMode.js';
import { breadcrumb, notice } from '../ui/components.js';
import { escapeHtml, formatDateTime } from '../ui/dom.js';
import { settingsTabs } from '../ui/settingsTabs.js';
import { joinByCode, sessionCodeForm } from './accountView.js';

export const MY_TABS = [
  { id: 'account', label: '계정', href: '#/settings/account' },
  { id: 'display', label: '화면·입력', href: '#/settings/display' },
  { id: 'privacy', label: '개인정보', href: '#/settings/privacy' },
  { id: 'help', label: '도움말', href: '#/settings/help' },
];

const radioRow = (name, options, value) => `<div class="pick-group__options">${options.map((o) => `<label class="pick pick--tag"><input type="radio" name="${name}" value="${o.id}"${o.id === value ? ' checked' : ''}><span>${escapeHtml(o.label)}</span></label>`).join('')}</div>`;

export function renderSettings(root, [tabParam]) {
  const tab = MY_TABS.some((t) => t.id === tabParam) ? tabParam : 'account';
  let status = '';
  let codeError = '';

  function accountTab(user) {
    if (!user) {
      return `<section class="panel account-box"><h2 class="section-title">로그인하지 않았어요</h2>
        <p>구글 계정으로 로그인하면 기기를 바꿔도 기록이 이어지고(서버 연결 뒤), 세션 코드로 AI와 탐구하기에 들어갈 수 있어요.</p>
        <p><a class="button button--primary" href="#/account">${isFirebase ? '구글로 로그인' : '로그인 (시연)'}</a></p></section>`;
    }
    const p = user.profile ?? {};
    const joined = user.sessionIds.map(findSession).filter(Boolean);
    const rows = [['이메일', user.email], ['역할', roleLabel(user.role)], ['상태', STATUS_LABELS[user.status]],
      ...(p.kind === 'student' ? [['학년도·학번', `${p.year} ${p.studentNo}`], ['이름', p.name]] : p.kind ? [['이름', p.name], ['소속', p.affiliation]] : [])];
    return `<section class="panel account-box" aria-labelledby="st-me">
        <h2 id="st-me" class="section-title">${escapeHtml(displayName(user))}</h2>
        <dl class="read-list account-list">${rows.map(([k, v]) => `<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v ?? '')}</dd></div>`).join('')}</dl>
        <p class="meta">이름·학번을 바꾸려면 관리자에게 말해 주세요(승인 전이면 <a href="#/account">계정 화면</a>에서 고칠 수 있어요).</p>
        <div class="actions actions--start">
          ${canTeach(user) ? '<a class="button button--secondary" href="#/teacher">교사 업무판</a>' : ''}
          ${isAdmin(user) ? '<a class="button button--secondary" href="#/admin">관리자 설정</a>' : ''}
          <button type="button" class="button button--ghost" data-action="signout">로그아웃</button>
        </div>
      </section>
      ${user.role === 'student' || user.role === 'guest' ? `<section class="panel account-box" aria-labelledby="st-sess">
        <h2 id="st-sess" class="section-title">AI와 탐구하기 세션</h2>
        ${joined.length ? `<ul class="answer-list">${joined.map((s) => `<li><strong>${escapeHtml(sessionLabel(s))}</strong><span class="meta">코드 ${escapeHtml(formatCode(s.code))}</span></li>`).join('')}</ul>` : '<p class="meta">아직 들어간 세션이 없어요.</p>'}
        ${sessionCodeForm({ error: codeError })}
      </section>` : ''}`;
  }

  function displayTab() {
    const p = getPrefs();
    return `<form class="settings-form" data-prefs-form novalidate>
      <section class="panel" aria-labelledby="dp-screen">
        <h2 id="dp-screen" class="section-title">화면</h2>
        <fieldset class="choice-group"><legend class="field__label">글자 크기</legend>${radioRow('fontScale', FONT_SCALES, p.fontScale)}</fieldset>
        <label class="check"><input type="checkbox" name="contrast"${p.contrast === 'high' ? ' checked' : ''}><span>대비 높이기 <span class="meta">흐린 글씨와 선을 더 진하게 합니다.</span></span></label>
        <label class="check"><input type="checkbox" name="motion"${p.motion === 'reduce' ? ' checked' : ''}><span>움직임 줄이기 <span class="meta">화면이 바뀔 때의 움직임과 원리 설명의 움직이는 그림을 줄입니다. 꺼 두면 기기 설정을 따릅니다.</span></span></label>
        <p class="prefs-preview">미리 보기: 모든 자연수 n에 대하여 n² + n은 짝수이다.</p>
      </section>
      <section class="panel" aria-labelledby="dp-input">
        <h2 id="dp-input" class="section-title">입력</h2>
        <fieldset class="choice-group"><legend class="field__label">증명 칸의 처음 입력 방식</legend><p class="field__help">AI와 탐구하기의 증명 칸을 처음 열 때 쓸 방식입니다. 칸마다 언제든 바꿀 수 있어요.</p>${radioRow('inputMode', INPUT_MODES, p.inputMode)}</fieldset>
        <label class="check"><input type="checkbox" name="fingerDefault"${p.fingerDefault ? ' checked' : ''}><span>손가락으로도 쓰기를 처음부터 켜기 <span class="meta">펜이 없는 기기에서 씁니다. 손바닥이 닿아 선이 그어질 수 있어요.</span></span></label>
      </section>
      <div class="actions actions--start"><button type="button" class="button button--ghost" data-action="reset-prefs">기본값으로</button></div>
      <p class="meta">이 설정은 이 기기에 저장됩니다.</p>
    </form>`;
  }

  function privacyTab(user) {
    const classroom = getClassroom();
    const reqs = user ? requestsOf(user.uid) : [];
    // 연구 이야기는 AI와 탐구하기 세션에 들어간 사람에게만(2026-11-28 사용자 요청: 연습만 하는 사람에게는 연구를 말하지 않는다)
    const inResearch = Boolean(user && (user.role === 'student' || user.role === 'guest') && user.sessionIds.length && classroom.sessionId);
    const consent = inResearch ? getConsent() : null;
    const consentText = !inResearch ? '' : !classroom.consentRequired ? '이 세션은 연구 동의를 받지 않아요.' : consent.agreed === true ? `연구 참여에 동의했어요 (${formatDateTime(consent.at)}).` : consent.agreed === false ? '연구에 참여하지 않아요. 그만두기 전에 모은 자료는 연구에 쓰여요.' : '아직 답하지 않았어요.';
    return `${inResearch ? `<section class="panel" aria-labelledby="pv-consent">
        <h2 id="pv-consent" class="section-title">AI와 탐구하기 연구 참여</h2>
        <p>${escapeHtml(classroom.sessionLabel)}: ${escapeHtml(consentText)}</p>
        ${classroom.consentRequired ? '<p><a class="button button--secondary" href="#/research/consent">동의 바꾸기</a></p>' : ''}
      </section>` : ''}
      <section class="panel" aria-labelledby="pv-data">
        <h2 id="pv-data" class="section-title">내 기록 내려받기</h2>
        <p class="meta">이 기기에 저장된 내 증명 연습 기록과 AI와 탐구하기 기록을 파일(JSON)로 받습니다.</p>
        <div class="actions actions--start"><button type="button" class="button button--secondary" data-action="export">내 기록 내려받기</button></div>
      </section>
      <section class="panel" aria-labelledby="pv-req">
        <h2 id="pv-req" class="section-title">삭제·탈퇴 요청</h2>
        ${user ? `<form class="settings-form admin-roster" data-request-form novalidate>
            <div class="field"><label class="field__label" for="rq-type">요청</label><select class="field__select" id="rq-type" name="type">${REQUEST_TYPES.map((t) => `<option value="${t.id}">${escapeHtml(t.label)}</option>`).join('')}</select></div>
            <div class="field"><label class="field__label" for="rq-reason">이유 <span class="field__req">(선택)</span></label><input type="text" class="field__input" id="rq-reason" name="reason"></div>
            <p class="field__help">관리자가 확인한 뒤 처리합니다.${inResearch ? ' AI와 탐구하기에서 연구에 동의했던 기간의 자료는 연구 동의서에 적힌 대로 연구에 쓰일 수 있어요.' : ''}</p>
            <div class="actions actions--start"><button type="submit" class="button button--secondary">요청 보내기</button></div>
          </form>
          ${reqs.length ? `<ul class="answer-list" data-my-requests>${reqs.map((q) => `<li><strong>${escapeHtml(REQUEST_TYPES.find((t) => t.id === q.type)?.label ?? q.type)}</strong><span class="meta">${escapeHtml(formatDateTime(q.at))} 보냄, ${q.status === 'done' ? `처리함${q.note ? `: ${escapeHtml(q.note)}` : ''}` : '처리 전'}</span></li>`).join('')}</ul>` : ''}`
          : '<p class="meta">로그인하면 요청할 수 있어요.</p>'}
      </section>
      <section class="panel" aria-labelledby="pv-info">
        <h2 id="pv-info" class="section-title">개인정보 처리 안내</h2>
        <ul class="answer-list">
          <li>이름·학번·이메일은 관리자만 볼 수 있어요.</li>
          <li>저장하는 것: 증명 연습의 답과 결과, 활동 시간. 위치·사진·연락처는 모으지 않아요.</li>
          ${inResearch ? `<li>AI와 탐구하기에서는 쓴 증명(글과 필기), AI와 나눈 대화, 설문 응답, 작성 과정을 연구 자료로 모으고, 연구 자료에는 이름 대신 연구 번호를 써요.</li>
          <li>연구 자료는 정해진 날짜가 지나면 지워요.${ethics().irb && ethics().approvalNo ? ` 이 연구는 기관생명윤리위원회 승인(${escapeHtml(ethics().approvalNo)})을 받았어요.` : ''}</li>` : ''}
        </ul>
      </section>`;
  }

  function helpTab(user) {
    const c = getAdmin().contact;
    const teacher = canTeach(user) || !user;
    return `<section class="panel" aria-labelledby="hp-guide">
        <h2 id="hp-guide" class="section-title">사용 안내</h2>
        <details class="ref-card" open><summary>학생</summary><ul class="answer-list">
          <li><strong>증명 연습하기</strong>: 증명법을 고르고 쉬운 활동부터 명제를 통과하면 인증 배지를 받아요. 몇 번 시도하면 정답·예시 보기가 나와요.</li>
          <li><strong>AI와 탐구하기</strong>: 선생님 수업에서 열리면 들어가요(우리 반이면 자동, 아니면 선생님이 알려 준 세션 코드). 내 증명과 AI의 증명을 비교하며 다듬는 1~4단계 활동이에요.</li>
          <li><strong>펜으로 쓰기</strong>: 증명 칸에서 "펜"을 고르세요. 의견 칸은 손가락으로 눌러 키보드로 써요.</li>
        </ul></details>
        ${teacher ? `<details class="ref-card"><summary>교사</summary><ul class="answer-list">
          <li><strong>교사 업무판</strong>: 진행 중 세션의 세션 코드, 탐구 열기·단계 열기, 채점·태그·분석·면담 바로가기.</li>
          <li><strong>교사 설정</strong>: 학급·세션, 탐구 진행(동의·설문·원리 활동·명제), 증명 연습(학급별), 채점·분석 보기.</li>
          <li><strong>관리자 설정</strong>(관리자): 가입 승인, 연결표, 연구 윤리, 연구 도구, 연습 기본값, 공지, 관리 기록.</li>
        </ul></details>` : ''}
      </section>
      <section class="panel" aria-labelledby="hp-contact">
        <h2 id="hp-contact" class="section-title">문의</h2>
        ${c.name || c.email ? `<dl class="read-list">${[['담당', c.name], ['연락처', c.email], ['안내', c.note]].filter(([, v]) => v).map(([k, v]) => `<div><dt>${k}</dt><dd>${escapeHtml(v)}</dd></div>`).join('')}</dl>` : '<p class="meta">문의처가 아직 정해지지 않았어요. 수업 시간에 선생님께 말해 주세요.</p>'}
      </section>
      <section class="panel" aria-labelledby="hp-app">
        <h2 id="hp-app" class="section-title">앱 정보</h2>
        <dl class="read-list">
          <div><dt>이름</dt><dd>${escapeHtml(APP_INFO.name)}</dd></div>
          <div><dt>버전</dt><dd>${escapeHtml(APP_INFO.version)} (${escapeHtml(APP_INFO.stage)})</dd></div>
          <div><dt>저장 위치</dt><dd>${escapeHtml(isDemo ? '시연 모드: 이 브라우저에만 (서버와 따로)' : isFirebase ? '서버(계정, 학급·세션, 탐구·연습 기록). 교사의 채점·면담 기록 일부는 아직 이 브라우저(서버 연결 진행 중)' : APP_INFO.storage)}</dd></div>
        </dl>
        ${isBrowserOnly ? '<p class="meta"><a href="#/demo-data">시연 데이터</a>: 이 브라우저의 기록을 파일로 내보내거나 불러와요.</p>' : ''}
      </section>`;
  }

  const draw = (focus = null) => {
    const user = currentUser();
    const bodies = { account: accountTab, display: displayTab, privacy: privacyTab, help: helpTab };
    root.innerHTML = `<div class="page page--settings">
      ${breadcrumb([{ label: '홈', href: '#/' }, { label: '내 설정' }])}
      <header class="page-intro"><h1>내 설정</h1></header>
      ${settingsTabs(MY_TABS, tab, '내 설정')}
      ${bodies[tab](user)}
      <p class="save-status" role="status" data-my-status>${escapeHtml(status)}</p>
    </div>`;
    if (focus) root.querySelector(focus)?.focus();
  };

  const onChange = (event) => {
    const t = event.target;
    if (!t.closest('[data-prefs-form]')) return;
    if (t.name === 'fontScale' || t.name === 'inputMode') savePrefs({ [t.name]: t.value });
    if (t.name === 'contrast') savePrefs({ contrast: t.checked ? 'high' : 'normal' });
    if (t.name === 'motion') savePrefs({ motion: t.checked ? 'reduce' : 'system' });
    if (t.name === 'fingerDefault') savePrefs({ fingerDefault: t.checked });
    status = '저장했습니다.';
    draw(`[name="${t.name}"]${t.type === 'radio' ? `[value="${t.value}"]` : ''}`);
  };

  const onClick = (event) => {
    const a = event.target.closest('[data-action]')?.dataset.action;
    if (a === 'signout') {
      signOut();
      status = '로그아웃했습니다.';
      return draw();
    }
    if (a === 'reset-prefs') {
      resetPrefs();
      status = '기본값으로 돌렸습니다.';
      return draw('[data-action="reset-prefs"]');
    }
    if (a === 'export') {
      const user = currentUser();
      const data = {
        exportedAt: new Date().toISOString(),
        app: `${APP_INFO.name} ${APP_INFO.version}`,
        account: user ? { researchId: user.researchId, role: user.role, profile: user.profile, sessions: user.sessionIds } : null,
        practice: listAttempts(),
        research: getSessions().sessions.map((s) => ({ session: sessionLabel(s), record: getResearch(s.id) })),
        prefs: getPrefs(),
      };
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `내기록-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      status = '내 기록 파일을 내려받았습니다.';
      const el = root.querySelector('[data-my-status]');
      if (el) el.textContent = status;
    }
  };

  const onSubmit = (event) => {
    const f = event.target;
    if (f.matches('[data-code-form]')) {
      event.preventDefault();
      const result = joinByCode(f.querySelector('[name="code"]').value);
      const done = (err) => {
        codeError = err;
        if (err) draw('#session-code');
      };
      if (typeof result === 'string') done(result);
      else result.then(done);
      return;
    }
    if (f.matches('[data-request-form]')) {
      event.preventDefault();
      const user = currentUser();
      addRequest({ uid: user.uid, researchId: user.researchId, type: f.querySelector('[name="type"]').value, reason: f.querySelector('[name="reason"]').value });
      status = '요청을 보냈습니다. 관리자가 확인한 뒤 처리합니다.';
      draw('#pv-req');
    }
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
