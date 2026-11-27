// 해시 기반 화면 이동
//   #/                                   학생 홈 (활동 선택 타일)
//   #/practice                           증명법 선택
//   #/practice/:method                   활동 단계 선택
//   #/practice/:method/:level            명제 선택
//   #/practice/:method/:level/:problem   활동 화면
//   #/records                            내 기록
//   #/research                           AI와 탐구하기(연구 모드): 명제와 4단계 지도
//   #/research/:stage(/:index)           연구 단계 화면 (stage 1~4, index는 명제 순서)
//   #/research/consent                   연구 참여 동의
//   #/research/principle                 "AI는 어떻게 답할까?" 원리 활동
//   #/research/survey/(pre|post)         사전·사후 설문
//   #/teacher                            교사 화면 미리보기
//   #/teacher/grading(/:key)             증명 채점 목록 / 증명 하나 채점 (key = 학생 id~단계~명제 id)
//   #/teacher/rubric                     채점 루브릭 보기·고치기
//   #/teacher/chats(/:key)               AI 대화 태그 목록 / 대화 하나에 태그 붙이기 (key = 학생 id~명제 id)
//   #/teacher/chat-tags                  대화 태그 목록 보기·고치기
//   #/teacher/analysis(/:student)        연구 분석 개요 / 학생별 대시보드
//   #/teacher/surveys(/:id)              설문과 연구 동의서 / 설문 문항 고치기
//   #/teacher/principle                  원리 활동 진행(설명 띄우기, 학생에게 열 화면 정하기)
//   #/teacher/interviews(/:student)      면담 후보와 기록 목록 / 학생 한 명의 면담
//   #/teacher/recordings                 면담 녹음 관리(보관 기한, 듣기·내려받기·지우기)
//   #/account                            계정(시연 로그인, 처음 정보 입력, 승인 대기, 세션 코드)
//   #/settings(/:tab)                    내 설정: 계정, 화면·입력, 개인정보, 도움말 (학생·일반인, 교사·관리자의 개인 설정)
//   #/teacher/settings(/:tab)            교사 설정: 학급·세션, 탐구 진행, 증명 연습(학급별), 채점·분석 보기
//   #/admin(/:tab)                       관리자 설정: 사용자·가입, 연결표·요청, 연구 윤리, 연구 도구, 연습 기본값, 공지·안내, 관리 기록
//                                        (예전 주소 #/teacher/admin(/links|/ethics)도 열림)
//   #/practice/guide                     증명법 한눈에 보기(직접·간접 증명법 설명)
//   #/demo-data                          시연 데이터: 이 브라우저의 기록을 파일로 내보내기·불러오기(시연 모드는 demo.html)
// 해시 방식은 배포 환경(Vercel)에서 별도 rewrite 설정 없이 동작한다.
// TODO: 라우팅 방식(해시 / History API)은 AGENTS.md의 결정 필요 항목이다.

import { renderHub } from './views/hubView.js';
import { renderMethodSelect } from './views/practice/methodSelectView.js';
import { renderLevelSelect } from './views/practice/levelSelectView.js';
import { renderProblemSelect } from './views/practice/problemSelectView.js';
import { renderActivity } from './views/practice/activityView.js';
import { renderRecords } from './views/recordsView.js';
import { renderResearchHome } from './views/research/researchHomeView.js';
import { renderResearchStage } from './views/research/stageView.js';
import { renderConsent } from './views/research/consentView.js';
import { renderSurvey } from './views/research/surveyView.js';
import { renderPrinciple } from './views/research/principleView.js';
import { renderTeacher } from './views/teacherView.js';
import { renderGradingHome } from './views/teacher/gradingHomeView.js';
import { renderGrade } from './views/teacher/gradeView.js';
import { renderRubric } from './views/teacher/rubricView.js';
import { renderChatTagHome } from './views/teacher/chatTagHomeView.js';
import { renderChatTag } from './views/teacher/chatTagView.js';
import { renderChatTagList } from './views/teacher/chatTagListView.js';
import { renderAnalysisHome } from './views/teacher/analysisHomeView.js';
import { renderAnalysisStudent } from './views/teacher/analysisStudentView.js';
import { renderSurveyList } from './views/teacher/surveyListView.js';
import { renderSurveyEdit } from './views/teacher/surveyEditView.js';
import { renderPrinciplePace } from './views/teacher/principlePaceView.js';
import { renderInterviewHome } from './views/teacher/interviewHomeView.js';
import { renderInterview } from './views/teacher/interviewView.js';
import { renderRecordings } from './views/teacher/recordingsView.js';
import { renderAccount } from './views/accountView.js';
import { renderAdmin } from './views/teacher/adminView.js';
import { renderTeacherSettings } from './views/teacher/teacherSettingsView.js';
import { renderSettings } from './views/settingsView.js';
import { canTeach, currentUser, displayName, isAdmin } from './state/accountStore.js';
import { icons } from './ui/icons.js';
import { activeNotices } from './state/adminStore.js';
import { dismissNotice, getPrefs } from './state/prefsStore.js';
import { renderMethodGuide } from './views/practice/methodGuideView.js';
import { renderDemoData } from './views/demoDataView.js';
import { renderNotFound } from './ui/components.js';
import { escapeHtml } from './ui/dom.js';

const ID = '([\\w-]+)';
// tab: 아래 탭 바에서 표시할 탭 · view: 'lesson'이면 활동에 집중하도록 탭 바를 숨긴다
const ROUTES = [
  { section: 'student', tab: 'home', title: null, pattern: /^\/$/, render: renderHub },
  { section: 'student', tab: 'practice', title: '증명 연습하기', pattern: /^\/practice$/, render: renderMethodSelect },
  { section: 'student', tab: 'practice', title: '증명법 한눈에 보기', pattern: /^\/practice\/guide$/, render: renderMethodGuide },
  { section: 'student', tab: 'practice', title: '증명 연습하기', pattern: new RegExp(`^/practice/${ID}$`), render: renderLevelSelect },
  { section: 'student', tab: 'practice', title: '증명 연습하기', pattern: new RegExp(`^/practice/${ID}/${ID}$`), render: renderProblemSelect },
  { section: 'student', tab: 'practice', view: 'lesson', title: '증명 연습하기', pattern: new RegExp(`^/practice/${ID}/${ID}/${ID}$`), render: renderActivity },
  { section: 'student', tab: 'records', title: '내 기록', pattern: /^\/records$/, render: renderRecords },
  { section: 'student', tab: 'research', title: 'AI와 탐구하기', pattern: /^\/research$/, render: renderResearchHome },
  { section: 'student', tab: 'research', view: 'lesson', title: 'AI와 탐구하기', pattern: /^\/research\/([1-4])(?:\/(\d+))?$/, render: renderResearchStage },
  { section: 'student', tab: 'research', title: '연구 참여 동의', pattern: /^\/research\/consent$/, render: renderConsent },
  { section: 'student', tab: 'research', view: 'lesson', title: 'AI는 어떻게 답할까?', pattern: /^\/research\/principle$/, render: renderPrinciple },
  { section: 'student', tab: 'research', view: 'lesson', title: '설문', pattern: /^\/research\/survey\/(pre|post)$/, render: renderSurvey },
  { section: 'teacher', role: 'teacher', tab: null, view: 'wide', title: '교사 업무판', pattern: /^\/teacher$/, render: renderTeacher },
  { section: 'teacher', role: 'teacher', tab: null, view: 'wide', title: '증명 채점', pattern: /^\/teacher\/grading$/, render: renderGradingHome },
  { section: 'teacher', role: 'teacher', tab: null, view: 'wide', title: '증명 채점', pattern: /^\/teacher\/grading\/([\w~-]+)$/, render: renderGrade },
  { section: 'admin', role: 'admin', tab: null, view: 'wide', title: '채점 루브릭', pattern: /^\/teacher\/rubric$/, render: renderRubric },
  { section: 'teacher', role: 'teacher', tab: null, view: 'wide', title: 'AI 대화 태그', pattern: /^\/teacher\/chats$/, render: renderChatTagHome },
  { section: 'teacher', role: 'teacher', tab: null, view: 'wide', title: 'AI 대화 태그', pattern: /^\/teacher\/chats\/([\w~-]+)$/, render: renderChatTag },
  { section: 'admin', role: 'admin', tab: null, view: 'wide', title: '대화 태그 목록', pattern: /^\/teacher\/chat-tags$/, render: renderChatTagList },
  { section: 'teacher', role: 'teacher', tab: null, view: 'wide', title: '연구 분석', pattern: /^\/teacher\/analysis$/, render: renderAnalysisHome },
  { section: 'teacher', role: 'teacher', tab: null, view: 'wide', title: '연구 분석', pattern: /^\/teacher\/analysis\/([\w-]+)$/, render: renderAnalysisStudent },
  { section: 'admin', role: 'admin', tab: null, view: 'wide', title: '설문 문항', pattern: /^\/teacher\/surveys$/, render: renderSurveyList },
  { section: 'teacher', role: 'teacher', tab: null, view: 'wide', title: '원리 활동 진행', pattern: /^\/teacher\/principle$/, render: renderPrinciplePace },
  { section: 'admin', role: 'admin', tab: null, view: 'wide', title: '설문 문항', pattern: /^\/teacher\/surveys\/([\w-]+)$/, render: renderSurveyEdit },
  { section: 'teacher', role: 'teacher', tab: null, view: 'wide', title: '면담', pattern: /^\/teacher\/interviews$/, render: renderInterviewHome },
  { section: 'teacher', role: 'teacher', tab: null, view: 'wide', title: '면담', pattern: /^\/teacher\/interviews\/([\w-]+)$/, render: renderInterview },
  { section: 'teacher', role: 'teacher', tab: null, view: 'wide', title: '녹음 관리', pattern: /^\/teacher\/recordings$/, render: renderRecordings },
  { section: 'account', tab: null, title: '계정', pattern: /^\/account$/, render: renderAccount },
  { section: 'account', tab: null, title: '시연 데이터', pattern: /^\/demo-data$/, render: renderDemoData },
  { section: 'account', tab: null, title: '내 설정', pattern: /^\/settings(?:\/(account|display|privacy|help))?$/, render: renderSettings },
  { section: 'teacher', role: 'teacher', tab: null, view: 'wide', title: '교사 설정', pattern: /^\/teacher\/settings(?:\/(sessions|research|practice|grading))?$/, render: renderTeacherSettings },
  { section: 'admin', role: 'admin', tab: null, view: 'wide', title: '관리자 설정', pattern: /^\/admin(?:\/(users|links|ethics|tools|practice|notices|audit))?$/, render: renderAdmin },
  { section: 'admin', role: 'admin', tab: null, view: 'wide', title: '관리자 설정', pattern: /^\/teacher\/admin(?:\/(links|ethics))?$/, render: (root, [tab]) => renderAdmin(root, [tab ?? 'users']) },
];

const APP_TITLE = '증명 연습실';

function currentPath() {
  const hash = window.location.hash.replace(/^#/, '');
  return hash.startsWith('/') ? hash : '/';
}

/** 역할에 맞지 않는 화면이면 막는 글 (서버 연결 뒤에는 보안 규칙이 실제로 막는다) */
function roleBlock(route) {
  if (!route.role) return null;
  const u = currentUser();
  const ok = route.role === 'admin' ? isAdmin(u) : canTeach(u);
  if (ok) return null;
  const who = route.role === 'admin' ? '관리자' : '교사';
  return `<div class="page">
    <h1>${who}만 볼 수 있어요</h1>
    <div class="notice notice--lock" role="note"><div class="notice__body"><p class="notice__title">${u ? `${escapeHtml(displayName(u))} 계정은 ${who} 화면을 볼 수 없어요.` : '로그인하지 않았어요.'}</p>
      <p>${u ? '역할이 잘못되었다면 관리자에게 말해 주세요.' : `${who} 계정으로 로그인하세요. 서버 연결 전에는 로그인 화면의 "시연용 역할로 보기"를 쓸 수 있어요.`}</p></div></div>
    <p><a class="button button--secondary" href="${u ? '#/' : '#/account'}">${u ? '홈으로' : '로그인'}</a></p>
  </div>`;
}

/** 머리글 오른쪽: 로그인 전 [로그인] / 학생·일반인 [⚙] / 교사 [교사 업무판][⚙] / 관리자 [교사][관리자][⚙] */
function drawAppNav(user) {
  const nav = document.querySelector('[data-app-nav]');
  if (!nav) return;
  const link = (href, sec, text, extra = '') => `<a class="app-bar__link" href="${href}" data-nav="${sec}"${extra}>${text}</a>`;
  if (!user) {
    nav.innerHTML = link('#/account', 'account', '로그인', ' data-account-chip');
    return;
  }
  const admin = isAdmin(user);
  const teach = canTeach(user);
  nav.innerHTML = [
    teach ? link('#/teacher', 'teacher', admin ? '<span class="app-bar__short">교사</span><span class="app-bar__long">교사 업무판</span>' : '교사 업무판', ' aria-label="교사 업무판"') : '',
    admin ? link('#/admin', 'admin', '<span class="app-bar__short">관리자</span><span class="app-bar__long">관리자 보드</span>', ' aria-label="관리자 보드"') : '',
    link('#/settings', 'account', icons.gear, ` data-account-chip aria-label="내 설정 (${escapeHtml(displayName(user))})" title="내 설정"`),
  ].join('');
}

/** 앱 위쪽 공지 (관리자가 올린 공지 중 내 역할에 맞고 기한이 지나지 않은 것, 닫으면 이 기기에서 숨김) */
function drawNoticeBar(user) {
  const bar = document.querySelector('[data-notice-bar]');
  if (!bar) return;
  const hidden = getPrefs().dismissedNotices;
  const list = activeNotices(user?.role ?? null).filter((n) => !hidden.includes(n.id));
  bar.innerHTML = list.map((n) => `<div class="notice-bar__item" role="status" data-notice-id="${escapeHtml(n.id)}">
    <p><strong>${escapeHtml(n.title)}</strong>${n.body ? ` <span>${escapeHtml(n.body)}</span>` : ''}</p>
    <button type="button" class="button button--ghost button--small" data-dismiss-notice aria-label="공지 닫기: ${escapeHtml(n.title)}">닫기</button>
  </div>`).join('');
  bar.hidden = !list.length;
}

document.addEventListener('click', (event) => {
  const b = event.target.closest?.('[data-dismiss-notice]');
  if (!b) return;
  dismissNotice(b.closest('[data-notice-id]').dataset.noticeId);
  drawNoticeBar(currentUser());
});

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
    try {
      const blocked = route ? roleBlock(route) : null;
      if (blocked) {
        root.innerHTML = blocked;
      } else if (route) {
        cleanup = route.render(root, params) ?? null;
      } else {
        renderNotFound(root);
      }
    } catch (error) {
      // 화면을 그리다 오류가 나면 빈 화면 대신 오류 내용을 보여 준다(저장된 기록이 예상과 다를 때 원인을 찾기 위해)
      console.error(error);
      cleanup = null;
      const where = String(error?.stack ?? '').split('\n').find((line) => line.includes('/src/')) ?? '';
      root.innerHTML = `<div class="page">
        <h1>화면을 열지 못했어요</h1>
        <div class="notice notice--warn" role="alert"><div class="notice__body">
          <p class="notice__title">${escapeHtml(error?.message ?? String(error))}</p>
          ${where ? `<p class="meta">${escapeHtml(where.trim())}</p>` : ''}
        </div></div>
        <p>이 내용을 알려 주시면 원인을 찾을 수 있어요. 새로 고침(Ctrl + Shift + R)을 한 뒤에도 같으면 저장된 기록 때문일 수 있어요.</p>
        <p><a class="button button--secondary" href="#/">홈으로</a></p>
      </div>`;
    }

    document.title = route?.title ? `${route.title} - ${APP_TITLE}` : APP_TITLE;
    // 머리글의 계정 링크: 로그인했으면 이름, 아니면 "로그인"
    const u = currentUser();
    drawAppNav(u);
    drawNoticeBar(u);
    document.body.dataset.view = route?.view ?? 'app';
    document.querySelectorAll('[data-nav]').forEach((link) => {
      if (link.dataset.nav === route?.section) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    document.querySelectorAll('[data-tab]').forEach((link) => {
      if (link.dataset.tab === route?.tab) link.setAttribute('aria-current', 'page');
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
