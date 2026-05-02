export interface Model {
  id: 'gpt' | 'claude' | 'gemini';
  name: string;
  abbr: string;
  color: string;
  bg: string;
  apiModel: string;
}

export const MODELS: Model[] = [
  { id: 'gpt',    name: 'ChatGPT', abbr: 'G',  color: '#767DFF', bg: '#EBECFF', apiModel: 'gpt-4o' },
  { id: 'claude', name: 'Claude',  abbr: 'C',  color: '#F04086', bg: '#FFE0EE', apiModel: 'claude-sonnet-4-6' },
  { id: 'gemini', name: 'Gemini',  abbr: 'Gm', color: '#5FC88F', bg: '#CAEDCB', apiModel: 'gemini-1.5-pro' },
];

export const ROUND_LABELS = [
  '초기 입장 표명',
  '반론 및 심화',
  '공통점 탐색',
  '최종 입장',
  '결론 도출',
];

export type ModelId = 'gpt' | 'claude' | 'gemini';

export type ModelVersions = {
  gpt: string;
  claude: string;
  gemini: string;
};

export const MODEL_VERSION_LIST: Record<ModelId, { value: string; label: string }[]> = {
  gpt: [
    { value: 'gpt-4o',          label: 'GPT-4o' },
    { value: 'gpt-4o-mini',     label: 'GPT-4o mini' },
    { value: 'gpt-4.1',         label: 'GPT-4.1' },
    { value: 'gpt-4.1-mini',    label: 'GPT-4.1 mini' },
    { value: 'gpt-4.1-nano',    label: 'GPT-4.1 nano' },
    { value: 'o1',              label: 'o1' },
    { value: 'o3',              label: 'o3' },
    { value: 'o3-mini',         label: 'o3-mini' },
    { value: 'o4-mini',         label: 'o4-mini' },
  ],
  claude: [
    { value: 'claude-opus-4-7',            label: 'Claude Opus 4.7' },
    { value: 'claude-sonnet-4-6',          label: 'Claude Sonnet 4.6' },
    { value: 'claude-haiku-4-5-20251001',  label: 'Claude Haiku 4.5' },
    { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
    { value: 'claude-3-5-haiku-20241022',  label: 'Claude 3.5 Haiku' },
    { value: 'claude-3-opus-20240229',     label: 'Claude 3 Opus' },
  ],
  gemini: [
    { value: 'gemini-2.5-pro',        label: 'Gemini 2.5 Pro' },
    { value: 'gemini-2.5-flash',      label: 'Gemini 2.5 Flash' },
    { value: 'gemini-2.0-flash',      label: 'Gemini 2.0 Flash' },
    { value: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite' },
  ],
};

export const DEFAULT_MODEL_VERSIONS: ModelVersions = {
  gpt: 'gpt-4o',
  claude: 'claude-sonnet-4-6',
  gemini: 'gemini-2.0-flash',
};

export interface DebateMessage {
  modelId: string;
  content: string;
  round: number;
  refTag?: string;
}

export interface RoundResult {
  num: number;
  messages: DebateMessage[];
  conclusion?: string;
}

export interface ConsensusResult {
  consensus: string[];
  disputed: string[];
  confidence: number;
}

export interface DebateTurn {
  topic: string;
  rounds: RoundResult[];
  consensus: ConsensusResult;
  priorConsensus?: string[];
  triggeredBy?: { kind: 'disputed' | 'free' | 'auto'; item?: string };
}

export interface DebateResult {
  topic: string;
  rounds: RoundResult[];
  judge: ConsensusResult;
}

// SSE event types
export type DebateEvent =
  | { type: 'round_start'; round: number; label: string }
  | { type: 'message'; round: number; modelId: string; content: string; refTag?: string }
  | { type: 'round_conclusion'; round: number; conclusion: string }
  | { type: 'judge_result'; consensus: string[]; disputed: string[]; confidence: number }
  | { type: 'error'; message: string }
  | { type: 'done' };
