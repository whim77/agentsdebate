import { callAllModels } from './models';
import { runJudge } from './judge';
import type { DebateEvent, DebateMessage } from './types';

type ModelId = 'gpt' | 'claude' | 'gemini';

type Emit = (event: DebateEvent) => void;

function buildRound0Prompt(topic: string, modelId: ModelId): string {
  const names: Record<ModelId, string> = { gpt: 'ChatGPT', claude: 'Claude', gemini: 'Gemini' };
  return `당신은 ${names[modelId]}입니다. 다음 주제에 대해 명확하고 구체적인 입장을 한국어로 서술하세요 (200자 이내).

주제: "${topic}"`;
}

function buildCritiquePrompt(
  modelId: ModelId,
  topic: string,
  otherResponses: Record<string, string>
): string {
  const names: Record<ModelId, string> = { gpt: 'ChatGPT', claude: 'Claude', gemini: 'Gemini' };
  const others = Object.entries(otherResponses)
    .filter(([id]) => id !== modelId)
    .map(([id, content]) => `${names[id as ModelId]}: ${content}`)
    .join('\n\n');

  return `당신은 ${names[modelId]}입니다. 다음 주제에 대해 다른 AI들의 답변을 검토하고, 동의하지 않거나 보완이 필요한 부분을 구체적으로 지적하세요. 동의하는 부분은 "동의: ..."로 명시하세요. (200자 이내, 한국어로)

주제: "${topic}"

다른 AI들의 답변:
${others}`;
}

function buildRebuttalPrompt(
  modelId: ModelId,
  topic: string,
  critiques: Record<string, string>
): string {
  const names: Record<ModelId, string> = { gpt: 'ChatGPT', claude: 'Claude', gemini: 'Gemini' };
  const others = Object.entries(critiques)
    .filter(([id]) => id !== modelId)
    .map(([id, content]) => `${names[id as ModelId]}: ${content}`)
    .join('\n\n');

  return `당신은 ${names[modelId]}입니다. 다른 AI들의 반론을 검토하고, 동의할 수 있는 부분은 수용하고, 여전히 유지할 입장은 근거와 함께 방어하세요. (200자 이내, 한국어로)

주제: "${topic}"

다른 AI들의 반론:
${others}`;
}

export async function* runDebate(
  topic: string,
  modelIds: ModelId[]
): AsyncGenerator<DebateEvent> {
  const rounds: { num: number; messages: DebateMessage[] }[] = [];

  // Round 0 — 초기 입장
  yield { type: 'round_start', round: 0, label: '초기 입장 표명' };

  const r0Prompts = Object.fromEntries(modelIds.map(id => [id, buildRound0Prompt(topic, id)]));
  const r0Results = await callAllModels(modelIds, r0Prompts);

  const r0Messages: DebateMessage[] = [];
  for (const id of modelIds) {
    const content = r0Results[id];
    if (!content) continue;
    const msg: DebateMessage = { modelId: id, content, round: 0 };
    r0Messages.push(msg);
    yield { type: 'message', round: 0, modelId: id, content };
  }

  if (r0Messages.length < 2) {
    yield { type: 'error', message: '응답 가능한 모델이 2개 미만입니다.' };
    yield { type: 'done' };
    return;
  }

  rounds.push({ num: 0, messages: r0Messages });

  const r0Map = Object.fromEntries(r0Messages.map(m => [m.modelId, m.content]));

  // Round 1 — 반론
  yield { type: 'round_start', round: 1, label: '반론 및 심화' };

  const activeIds = r0Messages.map(m => m.modelId) as ModelId[];
  const r1Prompts = Object.fromEntries(
    activeIds.map(id => [id, buildCritiquePrompt(id, topic, r0Map)])
  );
  const r1Results = await callAllModels(activeIds, r1Prompts);

  const r1Messages: DebateMessage[] = [];
  for (const id of activeIds) {
    const content = r1Results[id];
    if (!content) continue;
    const refModel = activeIds.find(m => m !== id);
    const refTag = refModel ? `${refModel.toUpperCase()}에 반론` : undefined;
    const msg: DebateMessage = { modelId: id, content, round: 1, refTag };
    r1Messages.push(msg);
    yield { type: 'message', round: 1, modelId: id, content, refTag };
  }

  rounds.push({ num: 1, messages: r1Messages });

  const r1Map = Object.fromEntries(r1Messages.map(m => [m.modelId, m.content]));

  // Round 2 — 재반론/동의
  yield { type: 'round_start', round: 2, label: '공통점 탐색' };

  const r1Active = r1Messages.map(m => m.modelId) as ModelId[];
  const r2Prompts = Object.fromEntries(
    r1Active.map(id => [id, buildRebuttalPrompt(id, topic, r1Map)])
  );
  const r2Results = await callAllModels(r1Active, r2Prompts);

  const r2Messages: DebateMessage[] = [];
  for (const id of r1Active) {
    const content = r2Results[id];
    if (!content) continue;
    const msg: DebateMessage = { modelId: id, content, round: 2 };
    r2Messages.push(msg);
    yield { type: 'message', round: 2, modelId: id, content };
  }

  rounds.push({ num: 2, messages: r2Messages });

  // Judge — 합의 추출
  const judgeResult = await runJudge(rounds);
  yield {
    type: 'judge_result',
    consensus: judgeResult.consensus,
    disputed: judgeResult.disputed,
    confidence: judgeResult.confidence,
  };

  yield { type: 'done' };
}
