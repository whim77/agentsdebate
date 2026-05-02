import { callModel, callAllModels } from './models';
import { runJudge } from './judge';
import type { DebateEvent, DebateMessage, ModelVersions } from './types';

type ModelId = 'gpt' | 'claude' | 'gemini';
type Emit = (event: DebateEvent) => void;

const MODEL_NAMES: Record<ModelId, string> = { gpt: 'ChatGPT', claude: 'Claude', gemini: 'Gemini' };

function buildPriorContext(priorConsensus?: string[]): string {
  if (!priorConsensus?.length) return '';
  const items = priorConsensus.map((c, i) => `  ${i + 1}. ${c}`).join('\n');
  return `\n\n[이전 토론에서 모든 AI가 이미 합의한 전제 — 이 항목들은 다시 반론하지 마세요]\n${items}`;
}

// ─── Parallel prompt builders ────────────────────────────────────────────────

function buildRound0Prompt(topic: string, modelId: ModelId, priorConsensus?: string[]): string {
  return `당신은 ${MODEL_NAMES[modelId]}입니다. 다음 주제에 대해 명확하고 구체적인 입장을 한국어로 서술하세요 (200자 이내).

주제: "${topic}"${buildPriorContext(priorConsensus)}`;
}

function buildCritiquePrompt(modelId: ModelId, topic: string, otherResponses: Record<string, string>): string {
  const others = Object.entries(otherResponses)
    .filter(([id]) => id !== modelId)
    .map(([id, content]) => `${MODEL_NAMES[id as ModelId]}: ${content}`)
    .join('\n\n');

  return `당신은 ${MODEL_NAMES[modelId]}입니다. 다른 AI들의 답변을 검토하고, 동의하지 않거나 보완이 필요한 부분을 구체적으로 지적하세요. 동의하는 부분은 "동의: ..."로 명시하세요. (200자 이내, 한국어로)

주제: "${topic}"

다른 AI들의 답변:
${others}`;
}

function buildRebuttalPrompt(modelId: ModelId, topic: string, critiques: Record<string, string>): string {
  const others = Object.entries(critiques)
    .filter(([id]) => id !== modelId)
    .map(([id, content]) => `${MODEL_NAMES[id as ModelId]}: ${content}`)
    .join('\n\n');

  return `당신은 ${MODEL_NAMES[modelId]}입니다. 다른 AI들의 반론을 검토하고, 동의할 수 있는 부분은 수용하고, 여전히 유지할 입장은 근거와 함께 방어하세요. (200자 이내, 한국어로)

주제: "${topic}"

다른 AI들의 반론:
${others}`;
}

// ─── Round-robin prompt builders (each model sees those before it in same round) ──

function buildRound0PromptRR(topic: string, modelId: ModelId, soFar: Record<string, string>): string {
  const entries = Object.entries(soFar);
  if (entries.length === 0) {
    return buildRound0Prompt(topic, modelId);
  }
  const prior = entries.map(([id, c]) => `${MODEL_NAMES[id as ModelId]}: ${c}`).join('\n\n');
  return `당신은 ${MODEL_NAMES[modelId]}입니다. 다음 주제에 대해 명확하고 구체적인 입장을 한국어로 서술하세요. 앞선 AI의 의견을 참고하되 독자적인 입장을 표명하세요 (200자 이내).

주제: "${topic}"

앞서 응답한 AI들:
${prior}`;
}

function buildCritiquePromptRR(
  modelId: ModelId,
  topic: string,
  prevRound: Record<string, string>,
  soFar: Record<string, string>
): string {
  const prevMsgs = Object.entries(prevRound)
    .filter(([id]) => id !== modelId)
    .map(([id, c]) => `${MODEL_NAMES[id as ModelId]}: ${c}`)
    .join('\n\n');

  const soFarEntries = Object.entries(soFar);
  const soFarText = soFarEntries.length > 0
    ? `\n\n이미 반론한 AI들:\n${soFarEntries.map(([id, c]) => `${MODEL_NAMES[id as ModelId]}: ${c}`).join('\n\n')}`
    : '';

  return `당신은 ${MODEL_NAMES[modelId]}입니다. 다른 AI들의 초기 답변을 검토하고, 동의하지 않거나 보완이 필요한 부분을 구체적으로 지적하세요. 동의하는 부분은 "동의: ..."로 명시하세요. (200자 이내, 한국어로)

주제: "${topic}"

다른 AI들의 초기 답변:
${prevMsgs}${soFarText}`;
}

function buildRebuttalPromptRR(
  modelId: ModelId,
  topic: string,
  prevRound: Record<string, string>,
  soFar: Record<string, string>
): string {
  const prevMsgs = Object.entries(prevRound)
    .filter(([id]) => id !== modelId)
    .map(([id, c]) => `${MODEL_NAMES[id as ModelId]}: ${c}`)
    .join('\n\n');

  const soFarEntries = Object.entries(soFar);
  const soFarText = soFarEntries.length > 0
    ? `\n\n이미 재반론한 AI들:\n${soFarEntries.map(([id, c]) => `${MODEL_NAMES[id as ModelId]}: ${c}`).join('\n\n')}`
    : '';

  return `당신은 ${MODEL_NAMES[modelId]}입니다. 다른 AI들의 반론을 검토하고, 동의할 수 있는 부분은 수용하고, 여전히 유지할 입장은 근거와 함께 방어하세요. (200자 이내, 한국어로)

주제: "${topic}"

다른 AI들의 반론:
${prevMsgs}${soFarText}`;
}

// ─── Sequential round runner ─────────────────────────────────────────────────

async function* callModelsSequential(
  modelIds: ModelId[],
  buildPrompt: (modelId: ModelId, soFar: Record<string, string>) => string,
  modelVersions?: ModelVersions
): AsyncGenerator<{ modelId: ModelId; content: string }> {
  const soFar: Record<string, string> = {};
  for (const modelId of modelIds) {
    const prompt = buildPrompt(modelId, soFar);
    try {
      const content = await callModel(modelId, prompt, 30_000, modelVersions?.[modelId]);
      if (content) {
        soFar[modelId] = content;
        yield { modelId, content };
      }
    } catch (e) {
      console.error(`[sequential:${modelId}]`, e);
    }
  }
}

// ─── Main debate runner ──────────────────────────────────────────────────────

export async function* runDebate(
  topic: string,
  modelIds: ModelId[],
  modelVersions?: ModelVersions,
  roundRobin = false,
  priorConsensus?: string[]
): AsyncGenerator<DebateEvent> {
  const rounds: { num: number; messages: DebateMessage[] }[] = [];

  // Round 0 — 초기 입장
  yield { type: 'round_start', round: 0, label: '초기 입장 표명' };

  const r0Messages: DebateMessage[] = [];

  if (roundRobin) {
    for await (const { modelId, content } of callModelsSequential(
      modelIds,
      (id, soFar) => buildRound0PromptRR(topic, id, soFar) + buildPriorContext(priorConsensus),
      modelVersions
    )) {
      const msg: DebateMessage = { modelId, content, round: 0 };
      r0Messages.push(msg);
      yield { type: 'message', round: 0, modelId, content };
    }
  } else {
    const r0Prompts = Object.fromEntries(modelIds.map(id => [id, buildRound0Prompt(topic, id, priorConsensus)]));
    const r0Results = await callAllModels(modelIds, r0Prompts, modelVersions);
    for (const id of modelIds) {
      const content = r0Results[id];
      if (!content) continue;
      const msg: DebateMessage = { modelId: id, content, round: 0 };
      r0Messages.push(msg);
      yield { type: 'message', round: 0, modelId: id, content };
    }
  }

  if (r0Messages.length < 2) {
    yield { type: 'error', message: '응답 가능한 모델이 2개 미만입니다.' };
    yield { type: 'done' };
    return;
  }

  rounds.push({ num: 0, messages: r0Messages });
  const r0Map = Object.fromEntries(r0Messages.map(m => [m.modelId, m.content]));
  const activeIds = r0Messages.map(m => m.modelId) as ModelId[];

  // Round 1 — 반론
  yield { type: 'round_start', round: 1, label: '반론 및 심화' };

  const r1Messages: DebateMessage[] = [];

  if (roundRobin) {
    for await (const { modelId, content } of callModelsSequential(
      activeIds,
      (id, soFar) => buildCritiquePromptRR(id, topic, r0Map, soFar),
      modelVersions
    )) {
      const refModel = activeIds.find(m => m !== modelId);
      const refTag = refModel ? `${refModel.toUpperCase()}에 반론` : undefined;
      const msg: DebateMessage = { modelId, content, round: 1, refTag };
      r1Messages.push(msg);
      yield { type: 'message', round: 1, modelId, content, refTag };
    }
  } else {
    const r1Prompts = Object.fromEntries(activeIds.map(id => [id, buildCritiquePrompt(id, topic, r0Map)]));
    const r1Results = await callAllModels(activeIds, r1Prompts, modelVersions);
    for (const id of activeIds) {
      const content = r1Results[id];
      if (!content) continue;
      const refModel = activeIds.find(m => m !== id);
      const refTag = refModel ? `${refModel.toUpperCase()}에 반론` : undefined;
      const msg: DebateMessage = { modelId: id, content, round: 1, refTag };
      r1Messages.push(msg);
      yield { type: 'message', round: 1, modelId: id, content, refTag };
    }
  }

  rounds.push({ num: 1, messages: r1Messages });
  const r1Map = Object.fromEntries(r1Messages.map(m => [m.modelId, m.content]));
  const r1Active = r1Messages.map(m => m.modelId) as ModelId[];

  // Round 2 — 재반론/동의
  yield { type: 'round_start', round: 2, label: '공통점 탐색' };

  const r2Messages: DebateMessage[] = [];

  if (roundRobin) {
    for await (const { modelId, content } of callModelsSequential(
      r1Active,
      (id, soFar) => buildRebuttalPromptRR(id, topic, r1Map, soFar),
      modelVersions
    )) {
      const msg: DebateMessage = { modelId, content, round: 2 };
      r2Messages.push(msg);
      yield { type: 'message', round: 2, modelId, content };
    }
  } else {
    const r2Prompts = Object.fromEntries(r1Active.map(id => [id, buildRebuttalPrompt(id, topic, r1Map)]));
    const r2Results = await callAllModels(r1Active, r2Prompts, modelVersions);
    for (const id of r1Active) {
      const content = r2Results[id];
      if (!content) continue;
      const msg: DebateMessage = { modelId: id, content, round: 2 };
      r2Messages.push(msg);
      yield { type: 'message', round: 2, modelId: id, content };
    }
  }

  rounds.push({ num: 2, messages: r2Messages });

  // Judge — 합의 추출 (Claude Opus 4.7 고정)
  const judgeResult = await runJudge(rounds);
  yield {
    type: 'judge_result',
    consensus: judgeResult.consensus,
    disputed: judgeResult.disputed,
    confidence: judgeResult.confidence,
  };

  yield { type: 'done' };
}
