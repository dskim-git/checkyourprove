# 프로젝트 작업 규칙

이 프로젝트는 Vanilla JavaScript 기반 Vite 프로젝트이며, GitHub에 업로드 후 Vercel과 연동하여 배포합니다. (2026-11-26 Netlify에서 Vercel로 변경)
전체 개발 원칙과 개발 로드맵은 `AGENTS.md`(특히 10절 "개발 로드맵")를 기준으로 합니다.
코드 작업 전에 반드시 아래 규칙을 확인하세요.

## 작업 규칙

1. HTML, CSS, JavaScript 코드는 각각 분리된 파일로 작성합니다.
2. `index.html`은 프로젝트 루트에, 애플리케이션의 CSS와 JavaScript 파일은 `src` 폴더에 작성합니다. `vite.config.js` 등 설정 파일은 프로젝트 루트에 둡니다.
3. JavaScript는 모듈 방식(`<script type="module">`)으로 연결하고, CSS는 JavaScript 진입 파일(`src/main.js`)에서 import하여 Vite 빌드에 포함되도록 합니다.
4. 외부 JavaScript 라이브러리는 `npm install`로 설치하고 import하여 사용합니다. CDN 방식은 사용하지 않습니다.
5. 기존 파일과 설정이 있다면 먼저 확인하고 필요한 부분만 수정합니다.

## 빌드 및 배포

- 개발 서버: `npm run dev`
- 빌드: `npm run build` (출력 폴더: `dist`)
- Vercel 설정
  - Framework Preset: `Vite`
  - Build Command: `npm run build`
  - Output Directory: `dist`
- 서버 측 함수(AI 요청 중계 등)를 도입하면 프로젝트 루트의 `api/` 폴더에 Vercel Functions로 작성합니다. 비밀 값은 Vercel 환경 변수로만 관리합니다.
