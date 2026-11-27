// Firebase 웹 설정값 (로드맵 4-1). 공개되어도 되는 식별자이고, 보안은 Firestore 보안 규칙과 서버 함수가 맡는다(AGENTS.md 4절).
// 값은 환경 변수로 넣는다: 로컬은 .env.local, 배포는 Vercel 환경 변수(변수 이름은 .env.example).
// 값이 없으면(테스트, 설정 전 배포) 앱은 지금까지처럼 브라우저 저장만 쓰는 프로토타입 모드로 동작한다(state/appMode.js).

// 동작 테스트(Node)에서는 import.meta.env가 없어 프로토타입 모드가 된다
const env = import.meta.env ?? {};

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

export const hasFirebaseConfig = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
