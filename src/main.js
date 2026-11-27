import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './styles/app.css';

import { startRouter } from './router.js';
import { applyPrefs } from './state/prefsStore.js';
import { isFirebase } from './state/appMode.js';

// 내 설정의 화면 설정(글자 크기, 대비, 움직임)을 먼저 건다
applyPrefs();

const main = document.querySelector('#main');

// 해시 라우팅과 충돌하지 않도록 "본문으로 건너뛰기"는 초점 이동으로 처리한다.
document.querySelector('.skip-link')?.addEventListener('click', (event) => {
  event.preventDefault();
  main.focus();
});

// firebase 모드(설정값이 있을 때): 로그인 상태와 내 계정 문서를 먼저 받고 화면을 그린다.
// Firebase SDK는 이때만 따로 불러온다(프로토타입·시연 모드에서는 받지 않음).
async function start() {
  if (isFirebase) {
    main.innerHTML = '<div class="page"><p class="meta" role="status">계정 정보를 불러오는 중…</p></div>';
    const tag = document.querySelector('.app-bar .tag--proto');
    if (tag) tag.textContent = '시범';
    const foot = document.querySelector('.app-foot p');
    if (foot) foot.textContent = '시범 운영 중입니다. 계정은 서버에 저장하고, 세션과 탐구·연습 기록은 아직 이 브라우저에만 보관합니다(서버 연결 진행 중). AI는 예시 응답입니다.';
    try {
      const { initAccountSync } = await import('./firebase/accountSync.js');
      await initAccountSync();
    } catch (error) {
      console.error(error);
      window.dispatchEvent(new window.CustomEvent('checkyourprove:remote-error', { detail: { message: `서버에 연결하지 못했어요: ${error.message}` } }));
    }
  }
  startRouter(main);
}

start();
