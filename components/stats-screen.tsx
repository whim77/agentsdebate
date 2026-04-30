'use client';

import { MODELS } from '@/lib/types';
import { ModelPill } from './model-pill';

export function StatsScreen() {
  const MOCK = [
    { modelId: 'gpt',    debates: 12, consensusRate: 78, avgConfidence: 0.72 },
    { modelId: 'claude', debates: 14, consensusRate: 83, avgConfidence: 0.81 },
    { modelId: 'gemini', debates: 11, consensusRate: 74, avgConfidence: 0.69 },
  ];
  const modelMap = Object.fromEntries(MODELS.map(m => [m.id, m]));

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '32px 40px', background: '#F3F5F6' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#191C32', marginBottom: 6 }}>통계</div>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#93949A', marginBottom: 28 }}>토론 세션 분석 (예시 데이터)</div>

        {/* Summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 24 }}>
          {[
            { label: '총 토론 수', value: '37', sub: '이번 달' },
            { label: '평균 합의율', value: '78%', sub: '전체 기준' },
            { label: '평균 신뢰도', value: '0.74', sub: '0 – 1.0' },
          ].map(card => (
            <div key={card.label} style={{
              background: '#FFFFFF', borderRadius: 18, padding: '18px 16px',
              boxShadow: '0 4px 16px rgba(55,62,125,0.07)', textAlign: 'center',
            }}>
              <div style={{ fontSize: 26, fontWeight: 700, color: '#191C32', lineHeight: 1.1 }}>{card.value}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#191C32', marginTop: 4 }}>{card.label}</div>
              <div style={{ fontSize: 11, fontWeight: 500, color: '#93949A', marginTop: 2 }}>{card.sub}</div>
            </div>
          ))}
        </div>

        {/* Per-model stats */}
        <div style={{ background: '#FFFFFF', borderRadius: 20, boxShadow: '0 4px 20px rgba(55,62,125,0.06)', overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #E5E7F3' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#93949A', textTransform: 'uppercase', letterSpacing: 0.5 }}>모델별 성과</div>
          </div>
          {MOCK.map((row, i) => {
            const model = modelMap[row.modelId];
            return (
              <div key={row.modelId} style={{
                padding: '16px 20px',
                borderBottom: i < MOCK.length - 1 ? '1px solid #E5E7F3' : 'none',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                  <ModelPill model={model} size={32} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#191C32' }}>{model.name}</div>
                    <div style={{ fontSize: 11, fontWeight: 500, color: '#93949A' }}>{row.debates}회 참여</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: model.color }}>{row.consensusRate}%</div>
                    <div style={{ fontSize: 11, fontWeight: 500, color: '#93949A' }}>합의율</div>
                  </div>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: '#F3F5F6' }}>
                  <div style={{ height: '100%', borderRadius: 3, background: model.color, width: `${row.consensusRate}%`, opacity: 0.7 }} />
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 20, padding: '12px 16px', background: '#FFFFFF', borderRadius: 16, textAlign: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: '#93949A' }}>실제 통계는 토론을 진행하면 업데이트됩니다.</span>
        </div>
      </div>
    </div>
  );
}
