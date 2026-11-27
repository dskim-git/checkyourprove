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
//   #/practice/guide                     증명법 한눈에 보기(직접·간접 증명법 설명)
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
import { renderMethodGuide } from './views/practice/methodGuideView.js';
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
  { section: 'teacher', tab: null, view: 'wide', title: '교사 화면 미리보기', pattern: /^\/teacher$/, render: renderTeacher },
  { section: 'teacher', tab: null, view: 'wide', title: '증명 채점', pattern: /^\/teacher\/grading$/, render: renderGradingHome },
  { section: 'teacher', tab: null, view: 'wide', title: '증명 채점', pattern: /^\/teacher\/grading\/([\w~-]+)$/, render: renderGrade },
  { section: 'teacher', tab: null, view: 'wide', title: '채점 루브릭', pattern: /^\/teacher\/rubric$/, render: renderRubric },
  { section: 'teacher', tab: null, view: 'wide', title: 'AI 대화 태그', pattern: /^\/teacher\/chats$/, render: renderChatTagHome },
  { section: 'teacher', tab: null, view: 'wide', title: 'AI 대화 태그', pattern: /^\/teacher\/chats\/([\w~-]+)$/, render: renderChatTag },
  { section: 'teacher', tab: null, view: 'wide', title: '대화 태그 목록', pattern: /^\/teacher\/chat-tags$/, render: renderChatTagList },
  { section: 'teacher', tab: null, view: 'wide', title: '연구 분석', pattern: /^\/teacher\/analysis$/, render: renderAnalysisHome },
  { section: 'teacher', tab: null, view: 'wide', title: '연구 분석', pattern: /^\/teacher\/analysis\/([\w-]+)$/, render: renderAnalysisStudent },
  { section: 'teacher', tab: null, view: 'wide', title: '설문과 연구 동의', pattern: /^\/teacher\/surveys$/, render: renderSurveyList },
  { section: 'teacher', tab: null, view: 'wide', title: '원리 활동 진행', pattern: /^\/teacher\/principle$/, render: renderPrinciplePace },
  { section: 'teacher', tab: null, view: 'wide', title: '설문 문항', pattern: /^\/teacher\/surveys\/([\w-]+)$/, render: renderSurveyEdit },
  { section: 'teacher', tab: null, view: 'wide', title: '면담', pattern: /^\/teacher\/interviews$/, render: renderInterviewHome },
  { section: 'teacher', tab: null, view: 'wide', title: '면담', pattern: /^\/teacher\/interviews\/([\w-]+)$/, render: renderInterview },
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
    try {
      if (route) {
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
