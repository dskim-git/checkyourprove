// OpenRouter 호출 (로드맵 5단계). 키는 서버 환경 변수 OPENROUTER_API_KEY에만 둔다(VITE_ 금지, 브라우저 번들에 들어가지 않음).
// 대체 모델: OpenRouter의 models 배열(앞 모델이 오류·시간 초과면 다음 모델)을 쓴다. 실제로 답한 모델은 응답의 model.
// 비용: usage.include로 받은 usage.cost(달러).

const BASE = 'https://openrouter.ai/api/v1';
const TIMEOUT_MS = 45000;

export const hasOpenRouterKey = () => Boolean(process.env.OPENROUTER_API_KEY);

export class AiError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind; // 'timeout' | 'upstream' | 'empty'
  }
}

/**
 * @param {{ models: string[], messages: {role, content}[], maxTokens: number, temperature?: number, plugins?: object[] }} req
 * @returns {Promise<{ text: string, model: string, usage: { promptTokens, completionTokens, costUsd } }>}
 */
export async function chatCompletion({ models, messages, maxTokens, temperature = 0.3, plugins }) {
  const list = [...new Set(models.filter(Boolean))];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'X-Title': 'checkyourprove',
      },
      body: JSON.stringify({
        model: list[0],
        ...(list.length > 1 ? { models: list } : {}),
        messages,
        max_tokens: maxTokens,
        temperature,
        usage: { include: true },
        ...(plugins ? { plugins } : {}),
      }),
    });
  } catch (error) {
    throw new AiError(error?.name === 'AbortError' ? 'timeout' : 'upstream', error?.message ?? 'fetch failed');
  } finally {
    clearTimeout(timer);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new AiError('upstream', `${res.status} ${data.error?.message ?? ''}`.trim());
  const text = String(data.choices?.[0]?.message?.content ?? '').trim();
  if (!text) throw new AiError('empty', 'empty answer');
  const u = data.usage ?? {};
  return {
    text,
    model: data.model ?? list[0],
    usage: { promptTokens: u.prompt_tokens ?? null, completionTokens: u.completion_tokens ?? null, costUsd: typeof u.cost === 'number' ? u.cost : null },
  };
}

// 모델 목록(가격·문맥 길이): 공개 주소라 키가 필요 없다. 함수가 살아 있는 동안 10분 보관한다.
let modelCache = null;
export async function listModels() {
  if (modelCache && Date.now() - modelCache.at < 10 * 60 * 1000) return modelCache.list;
  const res = await fetch(`${BASE}/models`);
  if (!res.ok) throw new AiError('upstream', `models ${res.status}`);
  const data = await res.json();
  const list = (data.data ?? []).map((m) => ({
    id: m.id,
    name: m.name,
    inUsd: Number(m.pricing?.prompt ?? 0) * 1e6, // 100만 토큰당 달러
    outUsd: Number(m.pricing?.completion ?? 0) * 1e6,
    context: m.context_length ?? null,
    created: m.created ?? null,
  })).filter((m) => m.id && !m.id.endsWith(':batch'));
  modelCache = { at: Date.now(), list };
  return list;
}
