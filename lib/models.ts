import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { MODELS } from './types';
import type { ModelVersions } from './types';

let _openai: OpenAI | null = null;
let _anthropic: Anthropic | null = null;
let _google: GoogleGenerativeAI | null = null;

function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}
function getAnthropic() {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}
function getGoogle() {
  if (!_google) _google = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '');
  return _google;
}

export async function callModel(
  modelId: 'gpt' | 'claude' | 'gemini',
  prompt: string,
  timeoutMs = 30_000,
  versionOverride?: string
): Promise<string> {
  const model = MODELS.find(m => m.id === modelId)!;
  const apiModel = versionOverride ?? model.apiModel;
  console.log(`[callModel:${modelId}] using model: ${apiModel}`);

  const withTimeout = <T>(promise: Promise<T>): Promise<T> =>
    Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`${modelId} timeout`)), timeoutMs)
      ),
    ]);

  if (modelId === 'gpt') {
    const isOSeries = /^(o1|o3|o4)/.test(apiModel);
    const res = await withTimeout(
      getOpenAI().chat.completions.create({
        model: apiModel,
        messages: [{ role: 'user', content: prompt }],
        ...(isOSeries ? { max_completion_tokens: 1024 } : { max_tokens: 1024 }),
      })
    );
    return res.choices[0]?.message?.content ?? '';
  }

  if (modelId === 'claude') {
    const res = await withTimeout(
      getAnthropic().messages.create({
        model: apiModel,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      })
    );
    const block = res.content[0];
    return block.type === 'text' ? block.text : '';
  }

  if (modelId === 'gemini') {
    const gModel = getGoogle().getGenerativeModel({ model: apiModel });
    const res = await withTimeout(gModel.generateContent(prompt));
    try {
      return res.response.text();
    } catch (e) {
      // 안전 필터에 의해 차단된 경우
      const candidate = res.response.candidates?.[0];
      const reason = candidate?.finishReason ?? 'UNKNOWN';
      console.error(`[Gemini ${apiModel}] blocked:`, reason, e);
      return `[응답 차단됨: ${reason}]`;
    }
  }

  return '';
}

export async function callAllModels(
  modelIds: ('gpt' | 'claude' | 'gemini')[],
  prompts: Record<string, string>,
  modelVersions?: Partial<ModelVersions>
): Promise<Record<string, string | null>> {
  const results = await Promise.allSettled(
    modelIds.map(id => callModel(id, prompts[id], 30_000, modelVersions?.[id]))
  );

  return Object.fromEntries(
    modelIds.map((id, i) => {
      const r = results[i];
      if (r.status === 'rejected') {
        console.error(`[callModel:${id}] failed:`, r.reason);
      }
      return [id, r.status === 'fulfilled' ? r.value : null];
    })
  );
}
