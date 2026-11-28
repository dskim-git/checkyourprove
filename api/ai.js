// AI 요청 중계 서버 함수 (로드맵 5-1, 2026-11-29 사용자 결정)
// POST /api/ai  { action, ...값 }  (Authorization: Bearer <Firebase ID 토큰>)
//
// 브라우저는 OpenRouter를 직접 부르지 않는다. 이 함수가 사용자·권한·활동 상태·요청 한도를 확인하고, 시스템 지침(프롬프트)을
// 서버에서 조립해 OpenRouter를 부른 뒤, 실제 입력·답·모델·프롬프트 버전·토큰·비용을 서버만 쓰는 기록에 남긴다(AGENTS.md 4절).
// OPENROUTER_API_KEY가 없으면 더미 AI(services/mockAiService.js)로 답한다(모델 'mock').
//
// Firestore (모두 서버만 씀)
//   settings/ai                 { models: {용도: {model, fallback}}, limits: {...}, updatedAt }   교사·관리자가 읽음
//   settings/prompts            { overrides: {프롬프트 id: {version, template, editedAt, by}} }      읽기 막음(관리자는 이 함수로)
//   aiHistory/{자동}            { at, by, kind('model'|'limits'|'prompt'), ... }                  모델·한도·프롬프트 바꾼 기록
//   aiUsage/{uid}               { date(한국 날짜), research, practice, teacher }                    본인이 읽음
//   aiDaily/{날짜}              { calls, costUsd, promptTokens, completionTokens }
//   sessions/{회차}.aiModels    { research: {model, fallback}, fixedAt }   회차를 만들 때(또는 첫 대화 때) 고정
//   sessions/{회차}/aiLogs/{자동} 연구 모드 대화 기록(담당 교사·관리자가 읽음)

import { db, fieldValue, handler, HttpError } from './_lib/server.js';
import { chatCompletion, hasOpenRouterKey, listModels, AiError } from './_lib/openrouter.js';
import { activePrompt, PROMPT_DEFAULTS, PROMPT_IDS, renderPrompt } from './_lib/prompts.js';
import { AI_LIMIT_FIELDS, AI_USES, aiLimits, aiModels, CLASS_LIMIT_KEYS, classDailyLimit, isModelId, kstDate } from '../src/data/aiConfig.js';
import { getProblem } from '../src/data/problems/index.js';
import { BEYOND_CURRICULUM, CURRICULUM_SCOPE } from '../src/data/curriculum.js';
import { beyondCurriculum, classifyStudentMessage, guardReply, GUARDRAIL_VERSION } from '../src/services/researchGuardrails.js';
import { requestResearchChat as mockResearchChat } from '../src/services/mockAiService.js';

const now = () => new Date().toISOString();
const MAX_TURNS = 40;

async function me(token) {
  const snap = await db().doc(`users/${token.uid}`).get();
  if (!snap.exists) throw new HttpError(403, '계정 정보가 없어요. 다시 로그인해 주세요.');
  return snap.data();
}
async function audit(action, detail, by) {
  await db().collection('audit').add({ at: now(), action, detail: String(detail ?? ''), by: by ?? '' });
}
async function aiSettings() {
  const d = (await db().doc('settings/ai').get()).data() ?? {};
  return { models: aiModels(d.models), limits: aiLimits(d.limits) };
}
const promptOverrides = async () => (await db().doc('settings/prompts').get()).data()?.overrides ?? {};

/** 하루 한도: aiUsage/{uid}의 그 용도 수를 하나 올린다. 넘으면 429 */
async function countUsage(uid, use, limit) {
  const ref = db().doc(`aiUsage/${uid}`);
  const today = kstDate();
  await db().runTransaction(async (tx) => {
    const u = (await tx.get(ref)).data() ?? {};
    const used = u.date === today ? Number(u[use] ?? 0) : 0;
    if (used >= limit) throw new HttpError(429, `오늘 AI에게 보낼 수 있는 횟수(${limit}회)를 다 썼어요. 내일 다시 할 수 있어요. 쓴 내용은 그대로 남아 있어요.`);
    tx.set(ref, u.date === today ? { [use]: used + 1 } : { date: today, research: 0, practice: 0, teacher: 0, [use]: 1 }, { merge: true });
  });
}
async function checkBudget(limits) {
  const day = (await db().doc(`aiDaily/${kstDate()}`).get()).data();
  if (day && Number(day.costUsd ?? 0) >= limits.dailyBudgetUsd) {
    throw new HttpError(503, '오늘 AI 사용량이 정해 둔 한도에 닿아 잠시 멈췄어요. 선생님께 알려 주세요. 쓴 내용은 그대로 남아 있어요.');
  }
}
async function addDaily(usage) {
  const inc = fieldValue().increment;
  await db().doc(`aiDaily/${kstDate()}`).set({
    calls: inc(1), costUsd: inc(usage?.costUsd ?? 0), promptTokens: inc(usage?.promptTokens ?? 0), completionTokens: inc(usage?.completionTokens ?? 0),
  }, { merge: true });
}

const toKoreanError = (error) => {
  if (error instanceof HttpError) return error;
  if (error instanceof AiError) {
    return new HttpError(502, error.kind === 'timeout'
      ? 'AI가 너무 오래 답하지 않아요. 잠시 뒤 [다시 보내기]를 눌러 주세요. 쓴 내용은 그대로 남아 있어요.'
      : 'AI에 연결하지 못했어요. 잠시 뒤 [다시 보내기]를 눌러 주세요. 쓴 내용은 그대로 남아 있어요.');
  }
  return error;
};

// ── 연구 모드: AI와 탐구하기 2단계 대화 ──

/** 회차에 고정된 연구용 모델(없으면 지금 설정으로 고정한다) */
async function sessionModels(sref, settings) {
  return db().runTransaction(async (tx) => {
    const s = (await tx.get(sref)).data();
    if (s?.aiModels?.research?.model) return s.aiModels.research;
    const research = settings.models.research;
    tx.update(sref, { aiModels: { research, fixedAt: now() } });
    return research;
  });
}

function researchVars(problem) {
  const units = [...CURRICULUM_SCOPE.units, ...(problem.method === 'induction' ? [CURRICULUM_SCOPE.inductionUnit] : [])];
  const beyond = BEYOND_CURRICULUM.map(([, name]) => name).join(', ') + (problem.method === 'induction' ? '' : ', 수학적 귀납법');
  return { statement: problem.statement, units: units.join(' / '), beyond };
}

async function researchChat({ token, body }) {
  if (!token.role) throw new HttpError(403, '가입이 승인된 뒤에 쓸 수 있어요.');
  const sid = String(body.sessionId ?? '');
  const sref = db().doc(`sessions/${sid}`);
  const session = (await sref.get()).data();
  if (!session) throw new HttpError(404, '그런 회차가 없어요.');
  const teaches = token.role === 'admin' || (token.role === 'teacher' && session.teacherUids?.includes(token.uid));
  const member = (await sref.collection('members').doc(token.uid).get()).exists;
  if (!member && !teaches) throw new HttpError(403, '이 회차에 들어온 사람만 쓸 수 있어요.');
  if (session.open === false || !(session.stagesOpen ?? []).includes(2)) throw new HttpError(403, '선생님이 아직 2단계를 열지 않았어요.');
  const record = (await sref.collection('records').doc(token.uid).get()).data() ?? {};
  if (record.stages?.['2']?.submittedAt) throw new HttpError(409, '2단계를 이미 제출해서 더 대화할 수 없어요.');
  const allowed = record.propositionIds?.length ? record.propositionIds : session.propositionIds ?? [];
  const problem = allowed.includes(body.propositionId) ? getProblem(body.propositionId) : null;
  if (!problem) throw new HttpError(400, '이 회차의 명제가 아니에요.');

  const settings = await aiSettings();
  const { limits } = settings;
  const turns = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m) => (m?.role === 'student' || m?.role === 'ai') && typeof m.text === 'string')
    .slice(-MAX_TURNS)
    .map((m) => ({ role: m.role, text: m.text.slice(0, Math.max(limits.maxChars, 4000)) }));
  const last = turns.at(-1);
  if (!last || last.role !== 'student' || !last.text.trim()) throw new HttpError(400, '보낼 메시지가 없어요.');
  if (last.text.length > limits.maxChars) throw new HttpError(400, `메시지는 ${limits.maxChars}자까지 보낼 수 있어요. 나누어 보내 주세요.`);

  // 가드레일(서버에서 다시): 증명 관련이 아니면 AI를 부르지 않고 정해진 안내로 답한다(한도에 세지 않음)
  const verdict = classifyStudentMessage(last.text, problem);
  if (verdict.category !== 'proof') {
    return { ok: true, text: guardReply(verdict, problem), guard: verdict.category, guardVersion: GUARDRAIL_VERSION, model: null };
  }

  const klass = session.classId ? (await db().doc(`classes/${session.classId}`).get()).data() : null;
  await checkBudget(limits);
  await countUsage(token.uid, 'research', classDailyLimit('researchPerDay', limits, klass?.aiLimits));
  const fixed = await sessionModels(sref, settings);
  const prompt = activePrompt('research', await promptOverrides());
  const system = renderPrompt(prompt.template, researchVars(problem));
  const messages = [{ role: 'system', content: system }, ...turns.map((m) => ({ role: m.role === 'student' ? 'user' : 'assistant', content: m.text }))];

  let answer;
  let retried = false;
  try {
    if (!hasOpenRouterKey()) {
      const mock = await mockResearchChat({ input: { propositionId: problem.id, messages: turns } });
      answer = { text: mock.text, model: 'mock', usage: { promptTokens: 0, completionTokens: 0, costUsd: 0 } };
    } else {
      const models = [fixed.model, fixed.fallback];
      answer = await chatCompletion({ models, messages, maxTokens: limits.maxOutputTokens });
      // 답에 교육과정 밖 표현이 있으면 한 번 다시 만든다
      if (beyondCurriculum(answer.text, problem).length) {
        retried = true;
        const again = await chatCompletion({
          models,
          maxTokens: limits.maxOutputTokens,
          messages: [...messages, { role: 'assistant', content: answer.text }, { role: 'user', content: `(시스템 안내) 방금 답에 교육과정 밖의 개념(${beyondCurriculum(answer.text, problem).join(', ')})이 들어 있어요. 규칙 3·4에 맞게 범위 안의 개념만으로 다시 답하세요.` }],
        }).catch(() => null);
        if (again) answer = { ...again, usage: { promptTokens: (answer.usage.promptTokens ?? 0) + (again.usage.promptTokens ?? 0), completionTokens: (answer.usage.completionTokens ?? 0) + (again.usage.completionTokens ?? 0), costUsd: (answer.usage.costUsd ?? 0) + (again.usage.costUsd ?? 0) } };
      }
    }
  } catch (error) {
    // AI가 답하지 못했으면 쓴 횟수를 돌려준다
    await db().doc(`aiUsage/${token.uid}`).set({ research: fieldValue().increment(-1) }, { merge: true }).catch(() => {});
    await sref.collection('aiLogs').add({ uid: token.uid, propositionId: problem.id, at: now(), error: String(error?.message ?? error).slice(0, 300), requested: [fixed.model, fixed.fallback], promptId: prompt.id, promptVersion: prompt.version });
    throw toKoreanError(error);
  }
  const usedFallback = answer.model !== 'mock' && !String(answer.model).startsWith(fixed.model);
  const curriculumFlags = beyondCurriculum(answer.text, problem);
  const log = await sref.collection('aiLogs').add({
    uid: token.uid, propositionId: problem.id, at: now(), mode: 'research', stage: 2,
    model: answer.model, requested: [fixed.model, fixed.fallback], usedFallback, promptId: prompt.id, promptVersion: prompt.version, promptEdited: prompt.edited,
    guardrail: GUARDRAIL_VERSION, input: turns, output: answer.text, usage: answer.usage, curriculumFlags, retried,
  });
  await addDaily(answer.usage);
  return { ok: true, text: answer.text, model: answer.model, usedFallback, promptVersion: prompt.version, logId: log.id, curriculumFlags, guard: null, guardVersion: GUARDRAIL_VERSION };
}

// ── 관리자: 용도별 모델, 한도, 프롬프트 ──

async function history(entry) {
  await db().collection('aiHistory').add({ at: now(), ...entry });
}

async function adminAction(action, { token, body }) {
  if (token.role !== 'admin') throw new HttpError(403, '관리자만 할 수 있어요.');
  const who = (await me(token)).researchId;
  switch (action) {
    case 'aiAdmin': {
      const [settings, overrides, hist, today] = await Promise.all([
        aiSettings(), promptOverrides(),
        db().collection('aiHistory').orderBy('at', 'desc').limit(60).get(),
        db().doc(`aiDaily/${kstDate()}`).get(),
      ]);
      return {
        ok: true,
        hasKey: hasOpenRouterKey(),
        ...settings,
        prompts: PROMPT_IDS.map((id) => {
          const d = PROMPT_DEFAULTS[id];
          return { id, label: d.label, use: d.use, vars: d.vars, defaultVersion: d.version, defaultTemplate: d.template, ...activePrompt(id, overrides) };
        }),
        history: hist.docs.map((h) => h.data()),
        today: { date: kstDate(), ...(today.data() ?? { calls: 0, costUsd: 0 }) },
      };
    }
    case 'models':
      try {
        return { ok: true, models: await listModels() };
      } catch {
        throw new HttpError(502, 'OpenRouter 모델 목록을 받지 못했어요. 잠시 뒤 다시 해 보세요.');
      }
    case 'saveAiModels': {
      const before = (await aiSettings()).models;
      const next = { ...before };
      const changed = [];
      for (const { id } of AI_USES) {
        const want = body.models?.[id];
        if (!want) continue;
        const model = String(want.model ?? '').trim();
        const fallback = String(want.fallback ?? '').trim();
        if (!isModelId(model) || (fallback && !isModelId(fallback))) throw new HttpError(400, `모델 식별자가 올바르지 않아요(${id}). 예: anthropic/claude-sonnet-5.5`);
        if (model !== before[id].model || fallback !== before[id].fallback) changed.push({ use: id, from: before[id], to: { model, fallback } });
        next[id] = { model, fallback };
      }
      if (!changed.length) return { ok: true, changed: 0 };
      await db().doc('settings/ai').set({ models: next, updatedAt: now() }, { merge: true });
      const reason = String(body.reason ?? '').slice(0, 2000);
      const source = body.source === 'advisor' ? 'advisor' : 'manual';
      for (const c of changed) await history({ by: who, kind: 'model', ...c, source, reason });
      await audit('AI 모델 변경', changed.map((c) => `${c.use}: ${c.from.model} → ${c.to.model}`).join(', '), who);
      return { ok: true, changed: changed.length };
    }
    case 'saveAiLimits': {
      const before = (await aiSettings()).limits;
      const next = { ...before };
      for (const f of AI_LIMIT_FIELDS) {
        if (body.limits?.[f.id] === undefined) continue;
        const v = Number(body.limits[f.id]);
        if (!Number.isFinite(v) || v < f.min || v > f.max) throw new HttpError(400, `${f.label}은(는) ${f.min}~${f.max} 사이로 정하세요.`);
        next[f.id] = f.step ? v : Math.round(v);
      }
      await db().doc('settings/ai').set({ limits: next, updatedAt: now() }, { merge: true });
      await history({ by: who, kind: 'limits', from: before, to: next });
      await audit('AI 요청 한도 변경', AI_LIMIT_FIELDS.filter((f) => before[f.id] !== next[f.id]).map((f) => `${f.label} ${before[f.id]} → ${next[f.id]}`).join(', '), who);
      return { ok: true };
    }
    case 'savePrompt': {
      const id = String(body.id ?? '');
      if (!PROMPT_DEFAULTS[id]) throw new HttpError(400, '그런 프롬프트가 없어요.');
      const template = String(body.template ?? '').trim();
      if (template.length < 20 || template.length > 20000) throw new HttpError(400, '프롬프트는 20자 이상 20,000자 이하로 써 주세요.');
      const stamp = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 16).replace(/[-:T]/g, '');
      const version = `${PROMPT_DEFAULTS[id].version.replace(/-\d{4}-\d{2}-\d{2}-\d+$/, '')}-edit-${stamp}`;
      await db().doc('settings/prompts').set({ overrides: { [id]: { version, template, editedAt: now(), by: who } } }, { merge: true });
      await history({ by: who, kind: 'prompt', id, version, template, note: String(body.note ?? '').slice(0, 500) });
      await audit('AI 프롬프트 고침', `${id} → ${version}`, who);
      return { ok: true, version };
    }
    case 'resetPrompt': {
      const id = String(body.id ?? '');
      if (!PROMPT_DEFAULTS[id]) throw new HttpError(400, '그런 프롬프트가 없어요.');
      await db().doc('settings/prompts').set({ overrides: { [id]: fieldValue().delete() } }, { merge: true });
      await history({ by: who, kind: 'prompt', id, version: PROMPT_DEFAULTS[id].version, reset: true });
      await audit('AI 프롬프트 기본으로', `${id} → ${PROMPT_DEFAULTS[id].version}`, who);
      return { ok: true, version: PROMPT_DEFAULTS[id].version };
    }
    default:
      return null;
  }
}

// ── 교사: 학급별 하루 한도 ──
async function setClassAiLimits({ token, body }) {
  if (token.role !== 'admin' && token.role !== 'teacher') throw new HttpError(403, '교사만 할 수 있어요.');
  const ref = db().doc(`classes/${String(body.classId ?? '')}`);
  const c = (await ref.get()).data();
  if (!c) throw new HttpError(404, '그런 학급이 없어요.');
  if (token.role !== 'admin' && !c.teacherUids?.includes(token.uid)) throw new HttpError(403, '이 학급의 담당 교사만 할 수 있어요.');
  const { limits } = await aiSettings();
  const next = { ...(c.aiLimits ?? {}) };
  for (const k of CLASS_LIMIT_KEYS) {
    if (body.limits?.[k] === undefined) continue;
    const v = body.limits[k];
    if (v === null || v === '') {
      delete next[k];
      continue;
    }
    const n = Math.round(Number(v));
    const max = Math.round(limits[k] * limits.classMaxMultiplier);
    if (!Number.isFinite(n) || n < 1 || n > max) throw new HttpError(400, `1~${max} 사이로 정하세요(관리자가 정한 최대치).`);
    next[k] = n;
  }
  await ref.update({ aiLimits: next });
  return { ok: true, aiLimits: next };
}

export default handler(async ({ body, token }) => {
  const action = String(body.action ?? '');
  if (action === 'researchChat') return researchChat({ token, body });
  if (action === 'setClassAiLimits') return setClassAiLimits({ token, body });
  const r = await adminAction(action, { token, body });
  if (r) return r;
  throw new HttpError(400, '알 수 없는 요청이에요.');
});
