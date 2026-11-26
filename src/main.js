import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './styles/app.css';

import { startRouter } from './router.js';

const main = document.querySelector('#main');

// 해시 라우팅과 충돌하지 않도록 "본문으로 건너뛰기"는 초점 이동으로 처리한다.
document.querySelector('.skip-link')?.addEventListener('click', (event) => {
  event.preventDefault();
  main.focus();
});

startRouter(main);
