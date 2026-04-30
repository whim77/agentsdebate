'use client';

import { useState, useRef, useEffect } from 'react';
import { MODELS } from '@/lib/types';
import type { DebateEvent, DebateMessage, RoundResult, ConsensusResult } from '@/lib/types';
import { ModelPill } from './model-pill';

const ROUND_LABELS = ['초기 입장 표명', '상호 반론', '최종 수렴'];

interface Props {
  activeModels: ('gpt' | 'claude' | 'gemini')[];
}

export function ChatScreen({ activeModels }: Props) {
  const [topic, setTopic] = useState('');
  const [phase, setPhase] = useState<'idle' | 'running' | 'done'>('idle');
  const [rounds, setRounds] = useState<RoundResult[]>([]);
  const [currentRound, setCurrentRound] = useState(-1);
  const [consensus, setConsensus] = useState<ConsensusResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [typing, setTyping] = useState<Set<string>>(new Set());
  const bottomRef = useRef<HTMLDivElement>(null);
  const modelMap = Object.fromEntries(MODELS.map(m => [m.id, m]));

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [rounds, typing, consensus]);

  async function startDebate() {
    if (!topic.trim() || phase === 'running') return;
    setPhase('running');
    setRounds([]);
    setCurrentRound(-1);
    setConsensus(null);
    setError(null);
    setTyping(new Set());

    try {
      const res = await fetch('/api/debate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic.trim(), models: activeModels }),
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
      setPhase('idle');
    }
  }

  function handleEvent(event: DebateEvent) {
    switch (event.type) {
      case 'round_start':
        setCurrentRound(event.round);
        setRounds(prev => [...prev, { num: event.round, messages: [] }]);
        setTyping(new Set(activeModels));
        break;

      case 'message':
        setTyping(prev => {
          const next = new Set(prev);
          next.delete(event.modelId);
          return next;
        });
        setRounds(prev => prev.map(r =>
          r.num === event.round
            ? { ...r, messages: [...r.messages, { modelId: event.modelId, content: event.content, round: event.round, refTag: event.refTag }] }
            : r
        ));
        break;

      case 'round_conclusion':
        setRounds(prev => prev.map(r =>
          r.num === event.round ? { ...r, conclusion: event.conclusion } : r
        ));
        setTyping(new Set());
        break;

      case 'judge_result':
        setConsensus({ consensus: event.consensus, disputed: event.disputed, confidence: event.confidence });
        setPhase('done');
        setTyping(new Set());
        break;

      case 'error':
        setError(event.message);
        setTyping(new Set());
        break;

      case 'done':
        setPhase(prev => prev === 'running' ? 'done' : prev);
        setTyping(new Set());
        break;
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Topic input */}
      <div style={{ padding: '20px 24px', borderBottom: '1px solid #E5E7F3', background: '#FFFFFF' }}>
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#93949A', marginBottom: 8 }}>토론 주제</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              value={topic}
              onChange={e => setTopic(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && startDebate()}
              placeholder="예: AGI는 2030년까지 달성될까?"
              disabled={phase === 'running'}
              style={{
                flex: 1, padding: '12px 18px', borderRadius: 40, border: '1.5px solid #E5E7F3',
                fontSize: 14, fontWeight: 500, color: '#191C32', outline: 'none',
                background: phase === 'running' ? '#F3F5F6' : '#FFFFFF',
                transition: 'border-color 0.15s',
              }}
              onFocus={e => e.currentTarget.style.borderColor = '#9F9DF3'}
              onBlur={e => e.currentTarget.style.borderColor = '#E5E7F3'}
            />
            <button
              onClick={startDebate}
              disabled={!topic.trim() || phase === 'running'}
              style={{
                padding: '12px 24px', borderRadius: 40, border: 'none', cursor: 'pointer',
                background: (!topic.trim() || phase === 'running') ? '#E5E7F3' : '#9F9DF3',
                color: (!topic.trim() || phase === 'running') ? '#93949A' : '#fff',
                fontSize: 13, fontWeight: 700,
                boxShadow: (!topic.trim() || phase === 'running') ? 'none' : '0 4px 16px rgba(159,157,243,0.35)',
                transition: 'all 0.15s',
              }}
            >
              {phase === 'running' ? '토론 중...' : '토론 시작'}
            </button>
          </div>
          {/* Active model pills */}
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            {activeModels.map(mid => {
              const m = modelMap[mid];
              return (
                <div key={mid} style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  background: m.bg, borderRadius: 20, padding: '3px 10px 3px 6px',
                }}>
                  <ModelPill model={m} size={18} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: m.color }}>{m.name}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Messages area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px', background: '#F3F5F6' }}>
        <div style={{ maxWidth: 700, margin: '0 auto' }}>

          {phase === 'idle' && rounds.length === 0 && (
            <EmptyState />
          )}

          {rounds.map((round) => (
            <div key={round.num} style={{ marginBottom: 28 }}>
              <RoundHeader label={ROUND_LABELS[round.num] ?? `라운드 ${round.num + 1}`} num={round.num} />
              {round.messages.map((msg, i) => (
                <MessageBubble key={i} msg={msg} model={modelMap[msg.modelId]} />
              ))}
              {/* typing indicators for this round */}
              {currentRound === round.num && typing.size > 0 && (
                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  {Array.from(typing).map(mid => (
                    <TypingBubble key={mid} model={modelMap[mid]} />
                  ))}
                </div>
              )}
            </div>
          ))}

          {error && (
            <div style={{ padding: '14px 18px', borderRadius: 14, background: '#FFE0EE', color: '#F04086', fontSize: 13, fontWeight: 500, marginBottom: 20 }}>
              오류: {error}
            </div>
          )}

          {consensus && <ConsensusCard result={consensus} />}

          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}

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

function RoundHeader({ label, num }: { label: string; num: number }) {
  const colors = ['#9F9DF3', '#F04086', '#5FC88F'];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
      <div style={{
        width: 24, height: 24, borderRadius: '50%',
        background: colors[num % colors.length],
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 700, color: '#fff',
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
          lineHeight: 1.65, boxShadow: '0 2px 8px rgba(55,62,125,0.06)',
          whiteSpace: 'pre-wrap',
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
        <div key={i} style={{
          width: 4, height: 4, borderRadius: '50%', background: '#C5C6D0',
          animation: `bounce 1.2s ${i * 0.2}s infinite`,
        }} />
      ))}
      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-4px); }
        }
      `}</style>
    </div>
  );
}

function ConsensusCard({ result }: { result: ConsensusResult }) {
  const pct = Math.round(result.confidence * 100);
  const barColor = pct >= 70 ? '#5FC88F' : pct >= 40 ? '#9F9DF3' : '#F04086';

  return (
    <div style={{
      background: '#FFFFFF', borderRadius: 20,
      boxShadow: '0 8px 32px rgba(55,62,125,0.10)',
      overflow: 'hidden', marginTop: 8,
    }}>
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

        {/* Disputed items */}
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
                <div style={{ fontSize: 13, fontWeight: 500, color: '#93949A', lineHeight: 1.6 }}>{item}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
