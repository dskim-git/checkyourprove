// 서버 함수 공용 도구 (Vercel Functions, 로드맵 4-1). 밑줄로 시작하는 폴더는 Vercel이 함수로 만들지 않는다.
// 비밀 값: FIREBASE_SERVICE_ACCOUNT(서비스 계정 JSON 내용, Vercel 민감 값) 또는 GOOGLE_APPLICATION_CREDENTIALS(로컬 키 파일 경로).
// 로컬 개발 서버(npm run dev)에서는 vite.config.js의 개발용 중계가 같은 함수를 불러 준다.

import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

function credential() {
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
  return getApps()[0] ?? initializeApp({ credential: credential(), projectId: process.env.VITE_FIREBASE_PROJECT_ID || undefined });
}
export const adminAuth = () => getAuth(adminApp());
export const db = () => getFirestore(adminApp());

/** 오류를 화면에 보여 줄 글과 HTTP 상태로 */
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
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
      if (status === 500) console.error(error);
      send(res, status, { error: status === 500 ? '서버에서 처리하지 못했어요.' : error.message });
    }
  };
}
