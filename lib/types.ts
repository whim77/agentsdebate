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
