import type { ModelId, ModelVersions, DebateTurn } from './types';

export interface DebateRecord {
  id: string;
  models: ModelId[];
  modelVersions: ModelVersions;
  timestamp: number;
  turns: DebateTurn[];
}

const KEY = 'agentsdebate_history';
const MAX = 50;

// Migrate old-format record (has top-level topic/rounds/consensus) to turns[]
function migrate(raw: any): DebateRecord {
  if (raw.turns) return raw as DebateRecord;
  return {
    id: raw.id,
    models: raw.models,
    modelVersions: raw.modelVersions,
    timestamp: raw.timestamp,
    turns: [{
      topic: raw.topic ?? '',
      rounds: raw.rounds ?? [],
      consensus: raw.consensus ?? { consensus: [], disputed: [], confidence: 0 },
    }],
  };
}

export function loadHistory(): DebateRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return (JSON.parse(raw) as any[]).map(migrate);
  } catch {
    return [];
  }
}

export function saveDebate(data: Omit<DebateRecord, 'id'>): DebateRecord {
  const record: DebateRecord = { id: String(Date.now()), ...data };
  const list = [record, ...loadHistory()].slice(0, MAX);
  localStorage.setItem(KEY, JSON.stringify(list));
  return record;
}

export function updateDebate(id: string, turns: DebateTurn[]): DebateRecord | null {
  const history = loadHistory();
  const idx = history.findIndex(r => r.id === id);
  if (idx === -1) return null;
  const updated: DebateRecord = { ...history[idx], turns };
  history[idx] = updated;
  localStorage.setItem(KEY, JSON.stringify(history));
  return updated;
}

export function deleteDebate(id: string): void {
  const list = loadHistory().filter(r => r.id !== id);
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function clearHistory(): void {
  localStorage.removeItem(KEY);
}
