'use client';

import { useState, useRef, useEffect } from 'react';
import { MODELS, MODEL_VERSION_LIST } from '@/lib/types';
import type { DebateEvent, DebateMessage, RoundResult, ConsensusResult, ModelVersions, DebateTurn } from '@/lib/types';
import { saveDebate, updateDebate } from '@/lib/db';
import type { DebateRecord } from '@/lib/db';
import { ModelPill } from './model-pill';

const ROUND_LABELS = ['초기 입장 표명', '상호 반론', '최종 수렴'];
const MAX_TURNS = 5;
const AUTO_CONFIDENCE_THRESHOLD = 0.8;

interface Props {
  activeModels: ('gpt' | 'claude' | 'gemini')[];
  modelVersions: ModelVersions;
  onDebateSaved?: (record: DebateRecord) => void;
  loadedDebate?: DebateRecord | null;
}

export function ChatScreen({ activeModels, modelVersions, onDebateSaved, loadedDebate }: Props) {
  const [inputTopic, setInputTopic] = useState('');
  const [phase, setPhase] = useState<'idle' | 'running' | 'done'>('idle');
  const [turns, setTurns] = useState<DebateTurn[]>([]);
  const [activeRounds, setActiveRounds] = useState<RoundResult[]>([]);
  const [currentRound, setCurrentRound] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const [typing, setTyping] = useState<Set<string>>(new Set());
  const [roundRobin, setRoundRobin] = useState(false);
  const [followUpInput, setFollowUpInput] = useState('');
  const [autoRetryPending, setAutoRetryPending] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const activeRoundsRef = useRef<RoundResult[]>([]);
  const savedRef = useRef(false);
  const turnsRef = useRef<DebateTurn[]>([]);
  const activeRecordIdRef = useRef<string | undefined>(undefined);
  const currentTopicRef = useRef('');
  const priorConsensusRef = useRef<string[] | undefined>(undefined);
  const triggeredByRef = useRef<DebateTurn['triggeredBy']>(undefined);
  const modelMap = Object.fromEntries(MODELS.map(m => [m.id, m]));

  // Restore from loaded debate
  useEffect(() => {
    if (!loadedDebate) return;
    const loaded = loadedDebate.turns ?? [];
    turnsRef.current = loaded;
    setTurns(loaded);
    setInputTopic(loaded[0]?.topic ?? '');
    setActiveRounds([]);
    activeRoundsRef.current = [];
    setPhase('done');
    setCurrentRound(-1);
    setError(null);
    setTyping(new Set());
    setFollowUpInput('');
    savedRef.current = false;
    activeRecordIdRef.current = loadedDebate.id;
  }, [loadedDebate]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeRounds, typing, turns]);

  // ── Internal debate runner ──────────────────────────────────────────────
  async function _runDebate(debateTopic: string, priorConsensus?: string[], triggeredBy?: DebateTurn['triggeredBy']) {
    triggeredByRef.current = triggeredBy;
    currentTopicRef.current = debateTopic;
    priorConsensusRef.current = priorConsensus;
    setAutoRetryPending(false);
    setPhase('running');
    setActiveRounds([]);
    setCurrentRound(-1);
    setError(null);
    setTyping(new Set());
    activeRoundsRef.current = [];
    savedRef.current = false;

    try {
      const res = await fetch('/api/debate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: debateTopic,
          models: activeModels,
          modelVersions,
          roundRobin,
          priorConsensus: priorConsensus ?? [],
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? '서버 오류');
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith('data:')) continue;
          const event: DebateEvent = JSON.parse(line.slice(5).trim());
          handleEvent(event);
        }
      }
    } catch (e) {
      setError(String(e));
      setPhase(turnsRef.current.length > 0 ? 'done' : 'idle');
    }
  }

  // Start brand new debate (clears all turns)
  async function startNewDebate() {
    if (!inputTopic.trim() || phase === 'running') return;
    turnsRef.current = [];
    setTurns([]);
    activeRecordIdRef.current = undefined;
    await _runDebate(inputTopic.trim());
  }

  // Start follow-up debate on existing session
  async function startFollowUp() {
    if (!followUpInput.trim() || phase === 'running') return;
    if (turnsRef.current.length >= MAX_TURNS) return;
    const allPrior = turnsRef.current
      .flatMap(t => t.consensus.consensus)
      .filter((v, i, a) => a.indexOf(v) === i)
      .slice(0, 5);
    setFollowUpInput('');
    await _runDebate(followUpInput.trim(), allPrior.length > 0 ? allPrior : undefined, { kind: 'free' });
  }

  // ── SSE event handler ───────────────────────────────────────────────────
  function handleEvent(event: DebateEvent) {
    switch (event.type) {
      case 'round_start': {
        setCurrentRound(event.round);
        const newRounds = [...activeRoundsRef.current, { num: event.round, messages: [] }];
        activeRoundsRef.current = newRounds;
        setActiveRounds(newRounds);
        setTyping(new Set(activeModels));
        break;
      }
      case 'message': {
        setTyping(prev => { const n = new Set(prev); n.delete(event.modelId); return n; });
        const updated = activeRoundsRef.current.map(r =>
          r.num === event.round
            ? { ...r, messages: [...r.messages, { modelId: event.modelId, content: event.content, round: event.round, refTag: event.refTag }] }
            : r
        );
        activeRoundsRef.current = updated;
        setActiveRounds(updated);
        break;
      }
      case 'round_conclusion':
        setTyping(new Set());
        break;
      case 'judge_result': {
        if (savedRef.current) break;
        savedRef.current = true;
        const result: ConsensusResult = { consensus: event.consensus, disputed: event.disputed, confidence: event.confidence };
        const newTurn: DebateTurn = {
          topic: currentTopicRef.current,
          rounds: activeRoundsRef.current,
          consensus: result,
          priorConsensus: priorConsensusRef.current,
          triggeredBy: triggeredByRef.current,
        };
        const newTurns = [...turnsRef.current, newTurn];
        turnsRef.current = newTurns;
        setTurns(newTurns);
        setActiveRounds([]);
        activeRoundsRef.current = [];
        setPhase('done');
        setTyping(new Set());

        let record: DebateRecord;
        if (activeRecordIdRef.current) {
          record = updateDebate(activeRecordIdRef.current, newTurns) ?? saveDebate({ models: activeModels, modelVersions, timestamp: Date.now(), turns: newTurns });
        } else {
          record = saveDebate({ models: activeModels, modelVersions, timestamp: Date.now(), turns: newTurns });
          activeRecordIdRef.current = record.id;
        }
        onDebateSaved?.(record);

        // Auto-retry: confidence 80% 미만이고 최대 횟수 미달이면 자동으로 다음 심화 토론 시작
        const shouldAutoRetry = result.confidence < AUTO_CONFIDENCE_THRESHOLD && newTurns.length < MAX_TURNS;
        if (shouldAutoRetry) {
          setAutoRetryPending(true);
          const originalTopic = newTurns[0].topic;
          const allPrior = newTurns
            .flatMap(t => t.consensus.consensus)
            .filter((v, i, a) => a.indexOf(v) === i)
            .slice(0, 5);
          setTimeout(() => {
            _runDebate(originalTopic, allPrior.length > 0 ? allPrior : undefined, { kind: 'auto' });
          }, 800);
        }
        break;
      }
      case 'error':
        setError(event.message);
        setTyping(new Set());
        break;
      case 'done':
        setPhase(prev => prev === 'running' ? (turnsRef.current.length > 0 ? 'done' : 'idle') : prev);
        setTyping(new Set());
        break;
    }
  }

  const isRunning = phase === 'running';
  const isDone = phase === 'done';
  // 자동 재토론 대기 중이거나 confidence < 80%로 자동 재토론이 예정된 경우 수동 follow-up 비활성
  const lastConfidence = turns.length > 0 ? turns[turns.length - 1].consensus.confidence : 1;
  const willAutoRetry = isDone && lastConfidence < AUTO_CONFIDENCE_THRESHOLD && turns.length < MAX_TURNS;
  const canFollowUp = isDone && turns.length < MAX_TURNS && !willAutoRetry && !autoRetryPending;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Topic input header */}
      <div style={{ padding: '20px 24px', borderBottom: '1px solid #E5E7F3', background: '#FFFFFF' }}>
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#93949A', marginBottom: 8 }}>토론 주제</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              value={inputTopic}
              onChange={e => setInputTopic(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && startNewDebate()}
              placeholder="예: AGI는 2030년까지 달성될까?"
              disabled={isRunning}
              style={{
                flex: 1, padding: '12px 18px', borderRadius: 40, border: '1.5px solid #E5E7F3',
                fontSize: 14, fontWeight: 500, color: '#191C32', outline: 'none',
                background: isRunning ? '#F3F5F6' : '#FFFFFF', transition: 'border-color 0.15s',
              }}
              onFocus={e => e.currentTarget.style.borderColor = '#9F9DF3'}
              onBlur={e => e.currentTarget.style.borderColor = '#E5E7F3'}
            />
            <button
              onClick={startNewDebate}
              disabled={!inputTopic.trim() || isRunning}
              style={{
                padding: '12px 24px', borderRadius: 40, border: 'none', cursor: 'pointer',
                background: (!inputTopic.trim() || isRunning) ? '#E5E7F3' : '#9F9DF3',
                color: (!inputTopic.trim() || isRunning) ? '#93949A' : '#fff',
                fontSize: 13, fontWeight: 700,
                boxShadow: (!inputTopic.trim() || isRunning) ? 'none' : '0 4px 16px rgba(159,157,243,0.35)',
                transition: 'all 0.15s',
              }}
            >
              {isRunning ? '토론 중...' : '토론 시작'}
            </button>
          </div>
          {/* Model pills + round-robin toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            {activeModels.map(mid => {
              const m = modelMap[mid];
              const versionLabel = MODEL_VERSION_LIST[mid]?.find(v => v.value === modelVersions[mid])?.label ?? modelVersions[mid];
              return (
                <div key={mid} style={{ display: 'flex', alignItems: 'center', gap: 5, background: m.bg, borderRadius: 20, padding: '3px 10px 3px 6px' }}>
                  <ModelPill model={m} size={18} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: m.color }}>{versionLabel}</span>
                </div>
              );
            })}
            <button
              onClick={() => setRoundRobin(v => !v)}
              disabled={isRunning}
              title="라운드로빈: 각 모델이 순서대로 앞선 모델의 응답을 보면서 답변합니다"
              style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px 3px 8px',
                borderRadius: 20, border: 'none', cursor: isRunning ? 'default' : 'pointer',
                background: roundRobin ? '#9F9DF3' : '#F3F5F6', transition: 'background 0.15s',
                opacity: isRunning ? 0.6 : 1,
              }}
            >
              <span style={{ fontSize: 13 }}>🔄</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: roundRobin ? '#fff' : '#93949A' }}>
                라운드로빈 {roundRobin ? 'ON' : 'OFF'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Messages area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px', background: '#F3F5F6' }}>
        <div style={{ maxWidth: 700, margin: '0 auto' }}>

          {phase === 'idle' && turns.length === 0 && <EmptyState />}

          {/* Completed turns */}
          {turns.map((turn, turnIdx) => {
            const isLastTurn = turnIdx === turns.length - 1;
            return (
              <div key={turnIdx}>
                {/* Turn divider for follow-up turns */}
                {turnIdx > 0 && (
                  <TurnDivider
                    num={turnIdx + 1}
                    topic={turn.topic}
                    priorConsensus={turn.priorConsensus}
                    isAuto={turn.triggeredBy?.kind === 'auto'}
                    prevConfidence={turns[turnIdx - 1]?.consensus.confidence}
                  />
                )}

                {/* Rounds */}
                {turn.rounds.map(round => (
                  <div key={round.num} style={{ marginBottom: 28 }}>
                    <RoundHeader label={ROUND_LABELS[round.num] ?? `라운드 ${round.num + 1}`} num={round.num} />
                    {round.messages.map((msg, i) => (
                      <MessageBubble key={i} msg={msg} model={modelMap[msg.modelId]} />
                    ))}
                  </div>
                ))}

                {/* Consensus card — follow-up controls only on last turn */}
                <ConsensusCard
                  result={turn.consensus}
                  followUp={isLastTurn && canFollowUp ? {
                    input: followUpInput,
                    onChange: setFollowUpInput,
                    onStart: startFollowUp,
                    onDrillDown: (item) => setFollowUpInput(item),
                    disabled: isRunning,
                    maxReached: turns.length >= MAX_TURNS,
                  } : undefined}
                  autoRetryInfo={isLastTurn && (autoRetryPending || willAutoRetry) ? {
                    confidence: turn.consensus.confidence,
                    nextTurnNum: turns.length + 1,
                    maxTurns: MAX_TURNS,
                  } : undefined}
                />

                {isLastTurn && turns.length >= MAX_TURNS && (
                  <div style={{ marginTop: 12, padding: '10px 16px', borderRadius: 12, background: '#F3F5F6', fontSize: 12, color: '#93949A', textAlign: 'center' }}>
                    최대 심화 토론 횟수({MAX_TURNS}회)에 도달했습니다. 새 토론을 시작하려면 상단 입력창을 사용하세요.
                  </div>
                )}
              </div>
            );
          })}

          {/* In-progress turn */}
          {activeRounds.length > 0 && (
            <div>
              {turns.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0 20px' }}>
                  <div style={{ flex: 1, height: 1, background: '#E5E7F3' }} />
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#9F9DF3', background: '#EBECFF', padding: '4px 12px', borderRadius: 20 }}>
                    심화 토론 {turns.length + 1}
                  </div>
                  <div style={{ flex: 1, height: 1, background: '#E5E7F3' }} />
                </div>
              )}
              {activeRounds.map(round => (
                <div key={round.num} style={{ marginBottom: 28 }}>
                  <RoundHeader label={ROUND_LABELS[round.num] ?? `라운드 ${round.num + 1}`} num={round.num} />
                  {round.messages.map((msg, i) => (
                    <MessageBubble key={i} msg={msg} model={modelMap[msg.modelId]} />
                  ))}
                  {currentRound === round.num && typing.size > 0 && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                      {Array.from(typing).map(mid => <TypingBubble key={mid} model={modelMap[mid]} />)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {error && (
            <div style={{ padding: '14px 18px', borderRadius: 14, background: '#FFE0EE', color: '#F04086', fontSize: 13, fontWeight: 500, marginBottom: 20 }}>
              오류: {error}
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div style={{ textAlign: 'center', paddingTop: 60 }}>
      <div style={{ fontSize: 36, marginBottom: 16 }}>🤝</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: '#191C32', marginBottom: 8 }}>합의 추출 준비 완료</div>
      <div style={{ fontSize: 13, fontWeight: 500, color: '#93949A', lineHeight: 1.7, maxWidth: 380, margin: '0 auto' }}>
        AI들이 서로 토론하고 반론하면서<br />
        최종적으로 모두가 동의하는 핵심을 추출합니다.
      </div>
    </div>
  );
}

function TurnDivider({ num, topic, priorConsensus, isAuto, prevConfidence }: {
  num: number; topic: string; priorConsensus?: string[];
  isAuto?: boolean; prevConfidence?: number;
}) {
  const badgeColor = isAuto ? '#F04086' : '#9F9DF3';
  const badgeBg = isAuto ? '#FFE0EE' : '#EBECFF';
  return (
    <div style={{ margin: '28px 0 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <div style={{ flex: 1, height: 1, background: '#E5E7F3' }} />
        <div style={{ fontSize: 11, fontWeight: 700, color: badgeColor, background: badgeBg, padding: '4px 12px', borderRadius: 20, display: 'flex', alignItems: 'center', gap: 5 }}>
          {isAuto && <span>⚡</span>}
          {isAuto ? `자동 심화 ${num}회차` : `심화 토론 ${num}`}
          {isAuto && prevConfidence !== undefined && (
            <span style={{ fontWeight: 500, opacity: 0.8 }}>
              ({Math.round(prevConfidence * 100)}% → 목표 80%)
            </span>
          )}
        </div>
        <div style={{ flex: 1, height: 1, background: '#E5E7F3' }} />
      </div>
      <div style={{ background: '#FFFFFF', borderRadius: 14, padding: '10px 14px', border: '1px solid #E5E7F3' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#9F9DF3', marginBottom: 4 }}>주제</div>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#191C32' }}>{topic}</div>
        {priorConsensus && priorConsensus.length > 0 && (
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #F3F5F6' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#5FC88F', marginBottom: 4 }}>이전 합의를 전제로 진행</div>
            {priorConsensus.map((c, i) => (
              <div key={i} style={{ fontSize: 11, color: '#93949A', lineHeight: 1.5 }}>• {c}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RoundHeader({ label, num }: { label: string; num: number }) {
  const colors = ['#9F9DF3', '#F04086', '#5FC88F'];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
      <div style={{
        width: 24, height: 24, borderRadius: '50%', background: colors[num % colors.length],
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff',
      }}>{num + 1}</div>
      <span style={{ fontSize: 12, fontWeight: 700, color: '#93949A', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: '#E5E7F3' }} />
    </div>
  );
}

function MessageBubble({ msg, model }: { msg: DebateMessage; model: any }) {
  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
      <div style={{ flexShrink: 0, paddingTop: 2 }}>
        <ModelPill model={model} size={28} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: model.color, marginBottom: 4 }}>{model.name}</div>
        <div style={{
          background: '#FFFFFF', borderRadius: '4px 16px 16px 16px',
          padding: '12px 16px', fontSize: 13, fontWeight: 500, color: '#191C32',
          lineHeight: 1.65, boxShadow: '0 2px 8px rgba(55,62,125,0.06)', whiteSpace: 'pre-wrap',
        }}>
          {msg.content}
        </div>
      </div>
    </div>
  );
}

function TypingBubble({ model }: { model: any }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: '#FFFFFF', borderRadius: 40, boxShadow: '0 2px 8px rgba(55,62,125,0.06)' }}>
      <ModelPill model={model} size={20} />
      <span style={{ fontSize: 11, fontWeight: 600, color: '#93949A' }}>{model.name} 응답 중</span>
      <TypingDots />
    </div>
  );
}

function TypingDots() {
  return (
    <div style={{ display: 'flex', gap: 3 }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: '#C5C6D0', animation: `bounce 1.2s ${i * 0.2}s infinite` }} />
      ))}
      <style>{`@keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-4px)} }`}</style>
    </div>
  );
}

interface FollowUpProps {
  input: string;
  onChange: (v: string) => void;
  onStart: () => void;
  onDrillDown: (item: string) => void;
  disabled: boolean;
  maxReached: boolean;
}

interface AutoRetryInfo {
  confidence: number;
  nextTurnNum: number;
  maxTurns: number;
}

function ConsensusCard({ result, followUp, autoRetryInfo }: {
  result: ConsensusResult;
  followUp?: FollowUpProps;
  autoRetryInfo?: AutoRetryInfo;
}) {
  const pct = Math.round(result.confidence * 100);
  const lowConfidence = result.confidence < 0.3;

  return (
    <div style={{ background: '#FFFFFF', borderRadius: 20, boxShadow: '0 8px 32px rgba(55,62,125,0.10)', overflow: 'hidden', marginTop: 8 }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #9F9DF3 0%, #767DFF 100%)', padding: '18px 22px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>합의 추출 결과</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.75)' }}>합의 신뢰도</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>{pct}%</div>
          </div>
        </div>
        <div style={{ marginTop: 10, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.25)' }}>
          <div style={{ height: '100%', borderRadius: 3, background: '#fff', width: `${pct}%`, transition: 'width 1s ease' }} />
        </div>
      </div>

      <div style={{ padding: '18px 22px' }}>
        {/* Consensus items */}
        {result.consensus.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#5FC88F', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
              모든 AI가 동의한 내용
            </div>
            {result.consensus.map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8, alignItems: 'flex-start' }}>
                <div style={{ flexShrink: 0, width: 20, height: 20, borderRadius: '50%', background: '#CAEDCB', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="#5FC88F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#191C32', lineHeight: 1.6 }}>{item}</div>
              </div>
            ))}
          </div>
        )}

        {/* Disputed items — with drill-down button */}
        {result.disputed.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#F04086', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
              이견이 있는 내용
            </div>
            {result.disputed.map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8, alignItems: 'flex-start' }}>
                <div style={{ flexShrink: 0, width: 20, height: 20, borderRadius: '50%', background: '#FFE0EE', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                    <path d="M6 3v4M6 9v.5" stroke="#F04086" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </div>
                <div style={{ flex: 1, fontSize: 13, fontWeight: 500, color: '#93949A', lineHeight: 1.6 }}>{item}</div>
                {followUp && !followUp.maxReached && (
                  <button
                    onClick={() => followUp.onDrillDown(item)}
                    style={{
                      flexShrink: 0, padding: '2px 9px', borderRadius: 20, border: 'none',
                      background: '#FFE0EE', color: '#F04086', fontSize: 10, fontWeight: 700,
                      cursor: 'pointer', whiteSpace: 'nowrap', marginTop: 2,
                    }}
                  >
                    심화 →
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Auto-retry pending banner */}
      {autoRetryInfo && (
        <div style={{ padding: '14px 22px 16px', borderTop: '1px solid #F3F5F6', background: '#FFF8FB' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18 }}>⚡</span>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#F04086' }}>
                신뢰도 {Math.round(autoRetryInfo.confidence * 100)}% — {autoRetryInfo.nextTurnNum}회차 심화 토론을 자동으로 시작합니다
              </div>
              <div style={{ fontSize: 11, fontWeight: 500, color: '#93949A', marginTop: 2 }}>
                {autoRetryInfo.nextTurnNum} / {autoRetryInfo.maxTurns}회차 · 목표 신뢰도 80%에 도달할 때까지 반복합니다
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Follow-up input */}
      {followUp && !followUp.maxReached && (
        <div style={{ padding: '14px 22px 18px', borderTop: '1px solid #F3F5F6' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#9F9DF3', marginBottom: 10, letterSpacing: 0.3 }}>
            💬 이 결론을 바탕으로 이어서 토론
          </div>
          {lowConfidence && (
            <div style={{ fontSize: 11, color: '#F04086', marginBottom: 8 }}>
              ⚠️ 합의 신뢰도가 낮습니다 ({pct}%). 이전 합의를 전제로 삼기 어려울 수 있습니다.
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={followUp.input}
              onChange={e => followUp.onChange(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && followUp.input.trim() && followUp.onStart()}
              placeholder="이견 항목을 클릭하거나 새 방향을 직접 입력하세요"
              disabled={followUp.disabled}
              style={{
                flex: 1, padding: '10px 16px', borderRadius: 40, border: '1.5px solid #E5E7F3',
                fontSize: 13, fontWeight: 500, color: '#191C32', outline: 'none',
                background: followUp.disabled ? '#F3F5F6' : '#FFFFFF',
              }}
              onFocus={e => e.currentTarget.style.borderColor = '#9F9DF3'}
              onBlur={e => e.currentTarget.style.borderColor = '#E5E7F3'}
            />
            <button
              onClick={followUp.onStart}
              disabled={!followUp.input.trim() || followUp.disabled}
              style={{
                padding: '10px 18px', borderRadius: 40, border: 'none',
                background: followUp.input.trim() && !followUp.disabled ? '#F04086' : '#E5E7F3',
                color: followUp.input.trim() && !followUp.disabled ? '#fff' : '#93949A',
                fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                boxShadow: followUp.input.trim() && !followUp.disabled ? '0 4px 16px rgba(240,64,134,0.3)' : 'none',
                transition: 'all 0.15s',
              }}
            >
              심화 토론 시작 →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
