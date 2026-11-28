// 서버 함수 공용 도구 (Vercel Functions, 로드맵 4-1). 밑줄로 시작하는 폴더는 Vercel이 함수로 만들지 않는다.
// 비밀 값: FIREBASE_SERVICE_ACCOUNT(서비스 계정 JSON 내용, Vercel 민감 값) 또는 GOOGLE_APPLICATION_CREDENTIALS(로컬 키 파일 경로).
// 로컬 개발 서버(npm run dev)에서는 vite.config.js의 개발용 중계가 같은 함수를 불러 준다.

// firebase-admin은 요청을 받은 뒤 불러온다(ready). 불러오기가 실패해도 함수가 통째로 멈추지 않고 원인을 JSON 오류로 돌려준다.
let sdk = null;
async function ready() {
  if (sdk) return;
  const [app, auth, firestore] = await Promise.all([import('firebase-admin/app'), import('firebase-admin/auth'), import('firebase-admin/firestore')]);
  sdk = { ...app, getAuth: auth.getAuth, getFirestore: firestore.getFirestore, FieldValue: firestore.FieldValue };
}
export const fieldValue = () => sdk.FieldValue;

/** 녹음 파일 지우기(4-4): recordings/{회차}/ 또는 recordings/{회차}/{uid}/ 아래 모두. 버킷이 없거나 실패해도 다른 일은 계속한다 */
export async function deleteRecordingFiles(prefix) {
  try {
    const { getStorage } = await import('firebase-admin/storage');
    const bucket = process.env.VITE_FIREBASE_STORAGE_BUCKET;
    if (!bucket) return;
    await getStorage(adminApp()).bucket(bucket).deleteFiles({ prefix });
  } catch (error) {
    console.warn('녹음 파일을 지우지 못함', prefix, error?.message);
  }
}

function credential() {
  const { applicationDefault, cert } = sdk;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (raw) {
    const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    const json = JSON.parse(text);
    if (json.private_key) json.private_key = json.private_key.replace(/\\n/g, '\n');
    return cert(json);
  }
  return applicationDefault();
}

export function adminApp() {
  const { getApps, initializeApp } = sdk;
  return getApps()[0] ?? initializeApp({ credential: credential(), projectId: process.env.VITE_FIREBASE_PROJECT_ID || undefined });
}
export const adminAuth = () => sdk.getAuth(adminApp());
export const db = () => sdk.getFirestore(adminApp());

/** 오류를 화면에 보여 줄 글과 HTTP 상태로 */
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** 오류 원인을 짧게(비밀 값은 넣지 않는다): 설정 문제를 바로 알아보게 */
function setupHint(error) {
  const msg = String(error?.message ?? '');
  if (!process.env.FIREBASE_SERVICE_ACCOUNT && !process.env.GOOGLE_APPLICATION_CREDENTIALS) return 'FIREBASE_SERVICE_ACCOUNT 환경 변수가 없음';
  if (error instanceof SyntaxError || /JSON/.test(msg)) return 'FIREBASE_SERVICE_ACCOUNT 내용이 JSON이 아님';
  if (/credential|private key|PEM|invalid_grant|UNAUTHENTICATED/i.test(msg)) return '서비스 계정 키를 쓸 수 없음';
  if (/Cannot find|ERR_MODULE|import|require/i.test(msg) || error?.code === 'ERR_REQUIRE_ESM') return `라이브러리를 불러오지 못함, Node ${process.versions.node}: ${msg.replace(/\s+/g, ' ').slice(0, 220)}`;
  return error?.code ? String(error.code) : 'unknown';
}

async function readBody(req) {
  if (req.body !== undefined) return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

function send(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

/**
 * POST + Firebase ID 토큰 확인을 거쳐 fn({ body, token })을 부른다. 돌려준 값을 JSON으로 보낸다.
 * (Vercel의 req.body 자동 해석이 없어도 동작하도록 Node 기본 API만 쓴다)
 */
export function handler(fn) {
  return async (req, res) => {
    try {
      if (req.method !== 'POST') throw new HttpError(405, 'POST만 받아요.');
      try {
        await ready();
        adminApp();
      } catch (error) {
        console.error(error);
        throw new HttpError(500, `서버 준비 실패(${setupHint(error)}). 관리자에게 알려 주세요.`);
      }
      const header = req.headers.authorization ?? '';
      const idToken = header.startsWith('Bearer ') ? header.slice(7) : '';
      if (!idToken) throw new HttpError(401, '로그인이 필요해요.');
      let token;
      try {
        token = await adminAuth().verifyIdToken(idToken, true);
      } catch {
        throw new HttpError(401, '로그인이 만료되었어요. 다시 로그인해 주세요.');
      }
      const body = await readBody(req);
      send(res, 200, (await fn({ body, token })) ?? { ok: true });
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      if (!(error instanceof HttpError)) console.error(error);
      send(res, status, { error: error instanceof HttpError ? error.message : `서버에서 처리하지 못했어요(${setupHint(error)}).` });
    }
  };
}
