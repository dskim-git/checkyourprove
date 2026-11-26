// 해시 기반 화면 이동
//   #/                                   학생 홈 (활동 선택 타일)
//   #/practice                           증명법 선택
//   #/practice/:method                   활동 단계 선택
//   #/practice/:method/:level            명제 선택
//   #/practice/:method/:level/:problem   활동 화면
//   #/records                            내 기록
//   #/research/:problem                  AI와 탐구하기(연구 모드)
//   #/teacher                            교사 화면 미리보기
// 해시 방식은 배포 환경(Vercel)에서 별도 rewrite 설정 없이 동작한다.
// TODO: 라우팅 방식(해시 / History API)은 AGENTS.md의 결정 필요 항목이다.

import { renderHub } from './views/hubView.js';
import { renderMethodSelect } from './views/practice/methodSelectView.js';
import { renderLevelSelect } from './views/practice/levelSelectView.js';
import { renderProblemSelect } from './views/practice/problemSelectView.js';
import { renderActivity } from './views/practice/activityView.js';
import { renderRecords } from './views/recordsView.js';
import { renderResearch } from './views/researchView.js';
import { renderTeacher } from './views/teacherView.js';
import { renderNotFound } from './ui/components.js';

const ID = '([\\w-]+)';
const ROUTES = [
  { section: 'student', title: null, pattern: /^\/$/, render: renderHub },
  { section: 'student', title: '증명 연습하기', pattern: /^\/practice$/, render: renderMethodSelect },
  { section: 'student', title: '증명 연습하기', pattern: new RegExp(`^/practice/${ID}$`), render: renderLevelSelect },
  { section: 'student', title: '증명 연습하기', pattern: new RegExp(`^/practice/${ID}/${ID}$`), render: renderProblemSelect },
  { section: 'student', title: '증명 연습하기', pattern: new RegExp(`^/practice/${ID}/${ID}/${ID}$`), render: renderActivity },
  { section: 'student', title: '내 기록', pattern: /^\/records$/, render: renderRecords },
  { section: 'student', title: 'AI와 탐구하기', pattern: new RegExp(`^/research/${ID}$`), render: renderResearch },
  { section: 'teacher', title: '교사 화면 미리보기', pattern: /^\/teacher$/, render: renderTeacher },
];

const APP_TITLE = '증명 연습실';

function currentPath() {
  const hash = window.location.hash.replace(/^#/, '');
  return hash.startsWith('/') ? hash : '/';
}

export function startRouter(root) {
  let cleanup = null;
  let firstRender = true;

  const render = () => {
    cleanup?.();
    cleanup = null;

    const path = currentPath();
    let params = [];
    const route = ROUTES.find((candidate) => {
      const match = path.match(candidate.pattern);
      if (match) params = match.slice(1);
      return Boolean(match);
    });

    root.innerHTML = '';
    if (route) {
      cleanup = route.render(root, params) ?? null;
    } else {
      renderNotFound(root);
    }

    document.title = route?.title ? `${route.title} · ${APP_TITLE}` : APP_TITLE;
    document.querySelectorAll('[data-nav]').forEach((link) => {
      if (link.dataset.nav === route?.section) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });

    // 화면이 바뀌면 맨 위로 올리고, 화면 읽기 프로그램 사용자를 위해 제목으로 초점을 옮긴다.
    if (!firstRender) {
      window.scrollTo(0, 0);
      const heading = root.querySelector('h1');
      if (heading) {
        heading.setAttribute('tabindex', '-1');
        heading.focus({ preventScroll: true });
      }
    }
    firstRender = false;
  };

  window.addEventListener('hashchange', render);
  render();
}
