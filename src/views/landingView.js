// 첫 화면 (2026-11-27 사용자 요청): 로그인하지 않은 사람에게 앱 이름·소개·로그인만 보여 준다.
//   서버 모드: 어떤 주소로 들어와도 이 화면. 로그인하면 원래 가려던 화면으로(승인 전이면 계정 화면).
//   시연 모드(demo.html): 구글 로그인 대신 "학생·교사·관리자로 보기"와 시연 데이터.
//   프로토타입 모드(설정값 없음, 동작 테스트)는 지금처럼 로그인 없이 미리보기(router.js의 GATED).

import { signInDemoRole, signInWithGoogle } from '../state/accountStore.js';
import { isDemo } from '../state/appMode.js';
import { escapeHtml } from '../ui/dom.js';
import { icons } from '../ui/icons.js';

/** 구글 로그인 실패를 화면 글로 (닫기·취소는 빈 글) */
export function googleErrorText(error) {
  const code = error?.code ?? '';
  if (code === 'auth/cancelled-popup-request') return '';
  // 계정을 골랐는데도 결과가 늦게 와서 "창이 닫힘"으로 끝나는 경우가 있어, 조용히 넘어가지 않고 알린다
  if (code === 'auth/popup-closed-by-user') return '로그인을 마치지 못했어요. 다시 한 번 눌러 주세요.';
  if (code === 'auth/popup-blocked') return '팝업이 막혀 있어요. 브라우저에서 이 사이트의 팝업을 허용한 뒤 다시 눌러 주세요.';
  if (code === 'auth/unauthorized-domain') return '이 주소에서는 로그인할 수 없어요(Firebase 승인된 도메인 확인 필요).';
  if (code === 'auth/network-request-failed') return '인터넷 연결을 확인한 뒤 다시 눌러 주세요.';
  return `로그인하지 못했어요. 잠시 뒤 다시 해 보세요. (${code || error?.message || '오류'})`;
}

const FEATURES = [
  { icon: 'pencil', title: '증명 연습하기', text: '빈칸 채우기부터 혼자 증명하기까지, 증명법마다 단계별로 연습해요.' },
  { icon: 'chat', title: 'AI와 탐구하기', text: '수업 세션 코드로 들어가 내 증명과 AI의 증명을 비교하며 다듬어요.' },
  { icon: 'records', title: '내 기록', text: '통과한 활동과 인증 배지가 쌓여요.' },
];

export function renderLanding(root) {
  let error = '';
  let busy = false;

  const draw = () => {
    root.innerHTML = `<div class="page landing">
      <header class="landing__head">
        <p class="landing__kicker">고등학교 수학 증명</p>
        <h1 class="landing__title">증명 연습실</h1>
        <p class="lead">증명을 한 단계씩 연습하고, AI와 함께 내 증명을 탐구해요.</p>
      </header>
      <ul class="landing__features" aria-label="할 수 있는 것">
        ${FEATURES.map((f) => `<li class="landing__feature"><span class="landing__icon" aria-hidden="true">${icons[f.icon]}</span>
          <span><strong>${escapeHtml(f.title)}</strong><span class="landing__text">${escapeHtml(f.text)}</span></span></li>`).join('')}
      </ul>
      <section class="panel landing__login" aria-labelledby="landing-login">
        ${isDemo
          ? `<h2 id="landing-login" class="section-title">시연용 역할로 보기</h2>
            <p class="meta">시연 모드입니다. 고른 역할의 시연 계정으로 들어가요. 기록은 이 브라우저에만 남아요.</p>
            <div class="actions actions--start">
              <button type="button" class="button button--primary" data-demo-role="student">학생으로 보기</button>
              <button type="button" class="button button--secondary" data-demo-role="teacher">교사로 보기</button>
              <button type="button" class="button button--secondary" data-demo-role="admin">관리자로 보기</button>
            </div>
            <p class="meta"><a href="#/demo-data">시연 데이터</a>: 발표용 기록 파일을 불러오거나 내보내요.</p>`
          : `<h2 id="landing-login" class="section-title">로그인</h2>
            <p>구글 계정으로 로그인해요.<br>처음이면 한 번만 정보를 입력하고, 승인되면 바로 쓸&nbsp;수&nbsp;있어요.</p>
            <p class="field__error" role="alert"${error ? '' : ' hidden'}>${escapeHtml(error)}</p>
            <div class="actions actions--start"><button type="button" class="button button--primary" data-action="google"${busy ? ' disabled' : ''}>${busy ? '로그인하는 중…' : '구글로 로그인'}</button></div>`}
      </section>
    </div>`;
  };

  const onClick = (event) => {
    const role = event.target.closest('[data-demo-role]')?.dataset.demoRole;
    if (role) {
      signInDemoRole(role);
      window.location.hash = role === 'admin' ? '#/admin' : role === 'teacher' ? '#/teacher' : '#/';
      window.dispatchEvent(new Event('hashchange'));
      return;
    }
    if (event.target.closest('[data-action="google"]')) {
      busy = true;
      error = '';
      draw();
      // 로그인되면 서버 값이 들어와 라우터가 원래 가려던 화면을 그린다
      signInWithGoogle().catch((e) => {
        busy = false;
        error = googleErrorText(e);
        draw();
        root.querySelector('[data-action="google"]')?.focus();
      });
    }
  };

  draw();
  root.addEventListener('click', onClick);
  return () => root.removeEventListener('click', onClick);
}
