// 계정 화면 (로드맵 3단계 프로토타입): 구글 로그인(시연) → 처음 한 번 정보 입력 → 승인 대기 / 승인됨(세션 코드 입력)
// 사용자 결정(2026-11-27): 학생은 학년도·학번·이름, 일반인은 이름·소속·가입 이유. 명단과 맞는 학생은 바로 승인.
// 증명 연습은 승인되면 바로, AI와 탐구하기는 세션 코드로 들어간다.
// firebase 모드(4-1): 구글 로그인(팝업) → 서버가 사용자 문서를 만든다. 정보 입력·승인은 서버 함수(api/account.js)가 처리한다.

import {
  canTeach, currentUser, displayName, ethics, isAdmin, joinSession, joinSessionByCode, roleLabel, signInDemo, signInDemoRole, signInWithGoogle, signOut,
  STATUS_LABELS, submitProfile,
} from '../state/accountStore.js';
import { isFirebase } from '../state/appMode.js';
import { researchReady } from '../state/researchStore.js';
import { googleErrorText } from './landingView.js';
import { STUDENT_NO_HELP, studentNoLabel } from '../data/studentNo.js';
import { findSession, findSessionByCode, formatCode, sessionLabel, setActiveSession } from '../state/sessionStore.js';
import { breadcrumb, notice } from '../ui/components.js';
import { getAdmin } from '../state/adminStore.js';
import { escapeHtml } from '../ui/dom.js';

const THIS_YEAR = new Date().getFullYear();

/** 세션 코드 입력 칸 (계정 화면과 탐구 홈이 함께 쓴다) */
export function sessionCodeForm({ error = '' } = {}) {
  return `<form class="code-form" data-code-form novalidate>
    <div class="field">
      <label class="field__label" for="session-code">세션 코드</label>
      <p class="field__help" id="session-code-help">선생님이 알려 준 6자리 코드를 입력하세요(예: K7P-4QX).</p>
      <input type="text" class="field__input code-form__input" id="session-code" name="code" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="8" aria-describedby="session-code-help${error ? ' session-code-error' : ''}"${error ? ' aria-invalid="true"' : ''}>
      ${error ? `<p class="field__error" id="session-code-error" role="alert">${escapeHtml(error)}</p>` : ''}
    </div>
    <div class="actions actions--start"><button type="submit" class="button button--primary">들어가기</button></div>
  </form>`;
}

const goResearch = () => {
  // 이미 탐구 홈에 있으면 주소가 같아 다시 그려지지 않으므로 직접 알린다
  if (window.location.hash === '#/research') window.dispatchEvent(new Event('hashchange'));
  else window.location.hash = '#/research';
};

/**
 * 세션 코드 제출 처리: 성공하면 그 세션을 진행 세션으로 하고 탐구 홈으로. 실패하면 오류 글을 돌려준다.
 * 서버 모드는 서버 함수가 코드를 확인하므로 Promise(오류 글)를 돌려준다.
 */
export function joinByCode(code) {
  const user = currentUser();
  if (!user) return '먼저 로그인하세요.';
  if (isFirebase) {
    return joinSessionByCode(code).then(async (r) => {
      if (r.error) return r.error;
      // 서버가 들어간 세션을 알려 줄 때까지(최대 8초) 기다렸다가 탐구 홈으로
      for (let i = 0; i < 40 && !(findSession(r.sessionId) && researchReady(r.sessionId)); i += 1) await new Promise((ok) => setTimeout(ok, 200));
      goResearch();
      return '';
    });
  }
  const found = findSessionByCode(code);
  if (found.error === 'none') return '그런 세션 코드가 없어요. 선생님이 알려 준 코드를 다시 확인해 주세요.';
  if (found.error === 'closed') return '이 세션 코드는 지금 닫혀 있어요. 선생님께 여쭤보세요.';
  joinSession(user.uid, found.session.id);
  // 프로토타입: 이 브라우저(기기)의 학생 화면을 그 세션으로 바꾼다. 서버 연결 뒤에는 사용자마다 참여 세션을 고른다.
  setActiveSession(found.session.id);
  goResearch();
  return '';
}

export function renderAccount(root) {
  let codeError = '';
  let kind = null;
  let loginError = '';
  let signingIn = false;
  /** 입력 오류: 다시 그리지 않고 오류 칸에만 쓴다(입력한 값을 지키려고) */
  const showError = (form, msg) => {
    const el = form.querySelector('[data-form-error]');
    el.textContent = msg;
    el.hidden = false;
  };

  const draw = () => {
    const user = currentUser();
    const crumbs = [{ label: '홈', href: '#/' }, { label: '계정' }];
    let body;
    if (!user && isFirebase) {
      body = `<section class="panel account-box" aria-labelledby="acc-login">
        <h2 id="acc-login" class="section-title">로그인</h2>
        <p>구글 계정으로 로그인합니다. 비밀번호를 따로 만들 필요가 없어요. 처음 로그인하면 한 번만 정보를 입력해요.</p>
        <p class="field__error" data-google-error role="alert"${loginError ? '' : ' hidden'}>${escapeHtml(loginError)}</p>
        <div class="actions actions--start"><button type="button" class="button button--primary" data-action="google"${signingIn ? ' disabled' : ''}>${signingIn ? '로그인하는 중…' : '구글로 로그인'}</button></div>
        <p class="meta">학교 구글 계정으로 로그인이 안 되면 학교에서 외부 앱 로그인을 막아 둔 것일 수 있어요. 선생님께 말해 주세요.</p>
      </section>`;
    } else if (!user) {
      body = `<section class="panel account-box" aria-labelledby="acc-login">
        <h2 id="acc-login" class="section-title">로그인</h2>
        <p>구글 계정으로 로그인합니다. 비밀번호를 따로 만들 필요가 없어요.</p>
        ${notice('warn', '시연용 로그인입니다', '서버를 연결하기 전이라 구글 대신 이메일을 입력해 로그인을 흉내 냅니다. 이 브라우저에서 처음 로그인한 계정은 관리자가 됩니다.')}
        <form class="account-form" data-login-form novalidate>
          <div class="field"><label class="field__label" for="acc-email">구글 이메일 (시연)</label><input type="email" class="field__input" id="acc-email" name="email" autocomplete="email" placeholder="예: student@gmail.com"></div>
          <p class="field__error" data-form-error role="alert" hidden></p>
          <div class="actions actions--start"><button type="submit" class="button button--primary">구글로 로그인 (시연)</button></div>
        </form>
      </section>
      <section class="panel account-box" aria-labelledby="acc-demo">
        <h2 id="acc-demo" class="section-title">시연용 역할로 보기</h2>
        <p class="meta">서버를 연결하기 전 확인용입니다. 고른 역할의 시연 계정으로 들어가 그 역할의 화면을 봅니다(서버 연결 때 없앰).</p>
        <div class="actions actions--start" data-demo-roles>
          <button type="button" class="button button--secondary" data-demo-role="student">학생으로 보기</button>
          <button type="button" class="button button--secondary" data-demo-role="teacher">교사로 보기</button>
          <button type="button" class="button button--secondary" data-demo-role="admin">관리자로 보기</button>
        </div>
        <p class="meta"><a href="#/demo-data">시연 데이터</a>: 이 브라우저의 기록을 파일로 내보내거나 불러와요.</p>
      </section>`;
    } else if (user.status === 'profile' || (user.status === 'pending' && kind)) {
      const k = kind ?? user.profile?.kind ?? 'student';
      const p = user.profile ?? {};
      body = `<section class="panel account-box" aria-labelledby="acc-profile">
        <h2 id="acc-profile" class="section-title">처음 한 번만 정보를 입력해 주세요</h2>
        <p class="meta">${escapeHtml(user.email)}(으)로 로그인했습니다. 입력한 정보는 관리자만 볼 수 있어요.</p>
        <form class="account-form" data-profile-form novalidate>
          <fieldset class="choice-group"><legend>가입 구분</legend><div class="pick-group__options">
            <label class="pick pick--tag"><input type="radio" name="kind" value="student"${k === 'student' ? ' checked' : ''}><span>학생</span></label>
            ${getAdmin().signup.allowGuests || k === 'guest' ? `<label class="pick pick--tag"><input type="radio" name="kind" value="guest"${k === 'guest' ? ' checked' : ''}><span>일반인 (교사·연수 참가자 등)</span></label>` : ''}
          </div></fieldset>
          ${k === 'student'
            ? `<div class="account-grid">
                <div class="field"><label class="field__label" for="acc-year">학년도</label><input type="number" class="field__input" id="acc-year" name="year" value="${escapeHtml(p.year ?? THIS_YEAR)}" inputmode="numeric"></div>
                <div class="field"><label class="field__label" for="acc-no">학번</label><input type="text" class="field__input" id="acc-no" name="studentNo" value="${escapeHtml(p.studentNo ?? '')}" inputmode="numeric" placeholder="예: 10203" maxlength="5" pattern="[0-9]*" aria-describedby="acc-no-help"><p class="meta" data-no-label aria-live="polite">${escapeHtml(studentNoLabel(p.studentNo ?? ''))}</p></div>
                <div class="field"><label class="field__label" for="acc-name">이름</label><input type="text" class="field__input" id="acc-name" name="name" value="${escapeHtml(p.name ?? '')}" autocomplete="name"></div>
              </div>
              <p class="field__help" id="acc-no-help">${escapeHtml(STUDENT_NO_HELP)} 학교 명단과 같으면 바로 쓸 수 있고, 다르면 관리자가 확인한 뒤에 쓸 수 있어요. 선생님이 만든 반에는 자동으로 들어가요.</p>`
            : `<div class="field"><label class="field__label" for="acc-name">이름</label><input type="text" class="field__input" id="acc-name" name="name" value="${escapeHtml(p.name ?? '')}" autocomplete="name"></div>
              <div class="field"><label class="field__label" for="acc-aff">소속</label><input type="text" class="field__input" id="acc-aff" name="affiliation" value="${escapeHtml(p.affiliation ?? '')}" placeholder="예: ○○고등학교 수학 교사"></div>
              <div class="field"><label class="field__label" for="acc-reason">가입 이유</label><textarea class="field__input" id="acc-reason" name="reason" rows="2" placeholder="예: 연수에서 소개받아 증명 연습을 체험해 보려고">${escapeHtml(p.reason ?? '')}</textarea></div>
              <p class="field__help">관리자가 확인한 뒤에 쓸 수 있어요.</p>`}
          <p class="field__error" data-form-error role="alert" hidden></p>
          <div class="actions actions--start"><button type="submit" class="button button--primary">가입 신청</button><button type="button" class="button button--ghost" data-action="signout">로그아웃</button></div>
        </form>
      </section>`;
    } else if (user.status === 'pending') {
      body = `<section class="panel account-box" aria-labelledby="acc-pending">
        <h2 id="acc-pending" class="section-title">관리자 승인을 기다리고 있어요</h2>
        <p>승인되면 증명 연습을 할 수 있어요. 잠시 뒤에 다시 들어와 주세요.</p>
        ${profileList(user)}
        <div class="actions actions--start"><button type="button" class="button button--secondary" data-action="edit-profile">입력한 정보 고치기</button><button type="button" class="button button--ghost" data-action="signout">로그아웃</button></div>
      </section>`;
    } else if (user.status === 'rejected') {
      body = `<section class="panel account-box">${notice('warn', '가입이 승인되지 않았어요', '관리자에게 문의해 주세요.')}<div class="actions actions--start"><button type="button" class="button button--ghost" data-action="signout">로그아웃</button></div></section>`;
    } else {
      const joined = user.sessionIds.map(findSession).filter(Boolean);
      body = `<section class="panel account-box" aria-labelledby="acc-me">
          <h2 id="acc-me" class="section-title">${escapeHtml(displayName(user))}</h2>
          <p class="grade-who"><span class="tag tag--strong">${escapeHtml(roleLabel(user.role))}</span><span class="tag tag--mint">${escapeHtml(STATUS_LABELS[user.status])}</span>${user.autoApproved ? '<span class="tag">명단으로 바로 승인</span>' : ''}</p>
          ${profileList(user)}
          <div class="actions actions--start">
            <a class="button button--primary" href="#/practice">증명 연습하기</a>
            ${canTeach(user) ? '<a class="button button--secondary" href="#/teacher">교사 화면</a>' : ''}
            ${isAdmin(user) ? '<a class="button button--secondary" href="#/admin">관리자 설정</a>' : ''}
            <button type="button" class="button button--ghost" data-action="signout">로그아웃</button>
          </div>
        </section>
        <section class="panel account-box" aria-labelledby="acc-code">
          <h2 id="acc-code" class="section-title">AI와 탐구하기 세션</h2>
          ${joined.length ? `<ul class="answer-list">${joined.map((s) => `<li><strong>${escapeHtml(sessionLabel(s))}</strong><span class="meta">코드 ${escapeHtml(formatCode(s.code))}</span></li>`).join('')}</ul>` : '<p class="meta">아직 들어간 세션이 없어요.</p>'}
          ${sessionCodeForm({ error: codeError })}
        </section>`;
    }
    const e = ethics();
    root.innerHTML = `<div class="page page--account">
      ${breadcrumb(crumbs)}
      <header class="page-intro"><h1>계정</h1></header>
      ${body}
      <p class="meta">개인정보: 이름·학번·이메일은 관리자만 볼 수 있어요.</p>
    </div>`;
  };

  function profileList(user) {
    const p = user.profile ?? {};
    const rows = p.kind === 'student'
      ? [['구분', '학생'], ['학년도', p.year], ['학번', `${p.studentNo ?? ''}${studentNoLabel(p.studentNo) ? ` (${studentNoLabel(p.studentNo)})` : ''}`], ['이름', p.name]]
      : [['구분', '일반인'], ['이름', p.name], ['소속', p.affiliation], ['가입 이유', p.reason]];
    return `<dl class="read-list account-list">${[['이메일', user.email], ...rows].map(([k, v]) => `<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v ?? '')}</dd></div>`).join('')}</dl>`;
  }

  const onSubmit = (event) => {
    event.preventDefault();
    const form = event.target;
    const val = (n) => form.querySelector(`[name="${n}"]`)?.value ?? '';
    if (form.matches('[data-login-form]')) {
      const u = signInDemo(val('email'));
      if (!u) return showError(form, '이메일을 바르게 입력하세요.');
      kind = null;
      return draw();
    }
    if (form.matches('[data-profile-form]')) {
      const k = form.querySelector('[name="kind"]:checked')?.value ?? 'student';
      const result = submitProfile(currentUser().uid, { kind: k, year: val('year'), studentNo: val('studentNo'), name: val('name'), affiliation: val('affiliation'), reason: val('reason') });
      if (!result) return showError(form, k === 'student' ? '학년도, 학번(다섯 자리: 학년·반·번호, 예: 10203), 이름을 모두 입력하세요.' : '이름, 소속, 가입 이유를 모두 입력하세요.');
      kind = null;
      return draw();
    }
    if (form.matches('[data-code-form]')) {
      const result = joinByCode(val('code'));
      if (typeof result === 'string') {
        codeError = result;
        if (codeError) draw();
      } else {
        form.querySelector('button[type="submit"]')?.setAttribute('disabled', '');
        result.then((err) => {
          codeError = err;
          if (err) draw();
        });
      }
    }
  };
  const onInput = (event) => {
    if (event.target.name !== 'studentNo') return;
    const out = root.querySelector('[data-no-label]');
    if (out) out.textContent = studentNoLabel(event.target.value);
  };
  const onChange = (event) => {
    if (event.target.name !== 'kind') return;
    kind = event.target.value;
    draw();
    root.querySelector(`[name="kind"][value="${kind}"]`)?.focus();
  };
  const onClick = (event) => {
    const demo = event.target.closest('[data-demo-role]')?.dataset.demoRole;
    if (demo) {
      signInDemoRole(demo);
      window.location.hash = demo === 'admin' ? '#/admin' : demo === 'teacher' ? '#/teacher' : '#/';
      return;
    }
    const a = event.target.closest('[data-action]')?.dataset.action;
    if (a === 'google') {
      signingIn = true;
      loginError = '';
      draw();
      signInWithGoogle().then(() => {
        signingIn = false; // 로그인되면 서버 값이 들어와 라우터가 다시 그린다
      }).catch((error) => {
        signingIn = false;
        loginError = googleErrorText(error);
        draw();
      });
      return;
    }
    if (a === 'signout') {
      signOut();
      kind = null;
      draw();
    }
    if (a === 'edit-profile') {
      kind = currentUser().profile?.kind ?? 'student';
      draw();
    }
  };

  draw();
  root.addEventListener('submit', onSubmit);
  root.addEventListener('change', onChange);
  root.addEventListener('input', onInput);
  root.addEventListener('click', onClick);
  return () => {
    root.removeEventListener('submit', onSubmit);
    root.removeEventListener('input', onInput);
    root.removeEventListener('change', onChange);
    root.removeEventListener('click', onClick);
  };
}
