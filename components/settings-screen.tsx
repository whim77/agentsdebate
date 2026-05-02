'use client';

import { MODELS, MODEL_VERSION_LIST } from '@/lib/types';
import type { ModelVersions } from '@/lib/types';
import { ModelPill } from './model-pill';

interface Props {
  activeModels: ('gpt' | 'claude' | 'gemini')[];
  onToggle: (id: 'gpt' | 'claude' | 'gemini') => void;
  modelVersions: ModelVersions;
  onVersionChange: (id: 'gpt' | 'claude' | 'gemini', version: string) => void;
}

export function SettingsScreen({ activeModels, onToggle, modelVersions, onVersionChange }: Props) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '32px 40px', background: '#F3F5F6' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#191C32', marginBottom: 6 }}>모델 설정</div>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#93949A', marginBottom: 28 }}>토론에 참여할 AI 모델을 선택하고 세부 버전을 지정하세요. 최소 2개 이상 필요합니다.</div>

        {/* Model toggles */}
        <div style={{ background: '#FFFFFF', borderRadius: 20, boxShadow: '0 4px 20px rgba(55,62,125,0.06)', overflow: 'hidden', marginBottom: 24 }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #E5E7F3' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#93949A', textTransform: 'uppercase', letterSpacing: 0.5 }}>참여 모델 및 버전</div>
          </div>
          {MODELS.map((model, i) => {
            const active = activeModels.includes(model.id);
            const isLast = i === MODELS.length - 1;
            const versions = MODEL_VERSION_LIST[model.id];
            const currentVersion = modelVersions[model.id];
            const currentLabel = versions.find(v => v.value === currentVersion)?.label ?? currentVersion;

            return (
              <div
                key={model.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '14px 20px',
                  borderBottom: isLast ? 'none' : '1px solid #E5E7F3',
                  cursor: 'pointer',
                  transition: 'background 0.1s',
                  opacity: active ? 1 : 0.5,
                }}
                onClick={() => {
                  if (active && activeModels.length <= 2) return;
                  onToggle(model.id);
                }}
              >
                <ModelPill model={model} size={36} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#191C32', marginBottom: 6 }}>{model.name}</div>
                  {/* Version selector */}
                  <div
                    style={{ display: 'inline-flex', alignItems: 'center', position: 'relative' }}
                    onClick={e => e.stopPropagation()}
                  >
                    <select
                      value={currentVersion}
                      onChange={e => onVersionChange(model.id, e.target.value)}
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: model.color,
                        background: model.bg,
                        border: 'none',
                        borderRadius: 20,
                        padding: '4px 24px 4px 10px',
                        cursor: 'pointer',
                        outline: 'none',
                        appearance: 'none',
                        WebkitAppearance: 'none',
                        MozAppearance: 'none',
                        minWidth: 120,
                        maxWidth: 200,
                      } as React.CSSProperties}
                    >
                      {versions.map(v => (
                        <option key={v.value} value={v.value}>{v.label}</option>
                      ))}
                    </select>
                    {/* Chevron icon */}
                    <svg
                      width="10" height="10" viewBox="0 0 10 10" fill="none"
                      style={{ position: 'absolute', right: 8, pointerEvents: 'none' }}
                    >
                      <path d="M2 3.5l3 3 3-3" stroke={model.color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                </div>
                <Toggle on={active} color={model.color} />
              </div>
            );
          })}
        </div>

        {/* Info card */}
        <div style={{ background: '#EBECFF', borderRadius: 16, padding: '14px 18px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ flexShrink: 0, width: 20, height: 20, borderRadius: '50%', background: '#9F9DF3', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
              <path d="M6 5.5V9M6 3v.5" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#767DFF', lineHeight: 1.65 }}>
            토론은 3라운드로 진행됩니다: 초기 입장 표명 → 상호 반론 → 최종 수렴.
            Judge AI (Claude claude-sonnet-4-6)가 전체 토론을 분석하여 합의 항목을 추출합니다.
          </div>
        </div>

        {/* API key status */}
        <div style={{ background: '#FFFFFF', borderRadius: 20, boxShadow: '0 4px 20px rgba(55,62,125,0.06)', overflow: 'hidden', marginTop: 24 }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #E5E7F3' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#93949A', textTransform: 'uppercase', letterSpacing: 0.5 }}>API 키 상태</div>
          </div>
          {[
            { label: 'OpenAI API Key', env: 'OPENAI_API_KEY', model: 'gpt' as const },
            { label: 'Anthropic API Key', env: 'ANTHROPIC_API_KEY', model: 'claude' as const },
            { label: 'Google Gemini API Key', env: 'GEMINI_API_KEY', model: 'gemini' as const },
          ].map((item, i, arr) => (
            <div key={item.env} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '13px 20px',
              borderBottom: i < arr.length - 1 ? '1px solid #E5E7F3' : 'none',
            }}>
              <ModelPill model={MODELS.find(m => m.id === item.model)!} size={24} />
              <div style={{ flex: 1, fontSize: 13, fontWeight: 500, color: '#191C32' }}>{item.label}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#93949A', fontFamily: 'monospace', background: '#F3F5F6', padding: '3px 8px', borderRadius: 6 }}>
                .env.local
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Toggle({ on, color }: { on: boolean; color: string }) {
  return (
    <div style={{
      width: 44, height: 24, borderRadius: 12,
      background: on ? color : '#E5E7F3',
      position: 'relative', transition: 'background 0.2s', flexShrink: 0,
    }}>
      <div style={{
        width: 18, height: 18, borderRadius: '50%', background: '#fff',
        position: 'absolute', top: 3,
        left: on ? 23 : 3,
        transition: 'left 0.2s',
        boxShadow: '0 1px 4px rgba(0,0,0,0.18)',
      }} />
    </div>
  );
}
