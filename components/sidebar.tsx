'use client';

import { useState } from 'react';
import { MODELS } from '@/lib/types';
import type { DebateRecord } from '@/lib/db';
import { ModelPill } from './model-pill';

interface SidebarProps {
  activeNav: string;
  onNav: (nav: string) => void;
  onNewDebate: () => void;
  onSelectDebate: (record: DebateRecord) => void;
  onDeleteDebate?: (id: string) => void;
  onClearHistory?: () => void;
  history: DebateRecord[];
  activeDebateId?: string;
}

export function Sidebar({ activeNav, onNav, onNewDebate, onSelectDebate, onDeleteDebate, onClearHistory, history, activeDebateId }: SidebarProps) {
  const modelMap = Object.fromEntries(MODELS.map(m => [m.id, m]));
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <div style={{
      width: 220, flexShrink: 0, background: '#FFFFFF',
      boxShadow: '1px 0 0 #E5E7F3',
      display: 'flex', flexDirection: 'column', height: '100%',
    }}>
      {/* Logo */}
      <div style={{ padding: '22px 20px 16px', borderBottom: '1px solid #E5E7F3' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 14, background: '#9F9DF3',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 13, color: '#fff', letterSpacing: -0.5,
          }}>AD</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#191C32', lineHeight: 1.2 }}>AgentsDebate</div>
            <div style={{ fontSize: 11, fontWeight: 500, color: '#93949A' }}>AI 합의 추출 플랫폼</div>
          </div>
        </div>
      </div>

      {/* New debate */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #E5E7F3' }}>
        <button
          onClick={onNewDebate}
          style={{
            width: '100%', background: '#9F9DF3', borderRadius: 40, padding: '9px 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            cursor: 'pointer', boxShadow: '0 4px 16px rgba(159,157,243,0.35)',
            border: 'none',
          }}
        >
          <span style={{ fontSize: 16, color: '#fff', fontWeight: 700 }}>+</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>새 토론 시작</span>
        </button>
      </div>

      {/* Search */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid #E5E7F3' }}>
        <div style={{
          background: '#F3F5F6', borderRadius: 40, padding: '8px 14px',
          display: 'flex', alignItems: 'center', gap: 7,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#93949A" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <span style={{ fontSize: 12, fontWeight: 500, color: '#93949A' }}>토론 검색</span>
        </div>
      </div>

      {/* History */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px', marginBottom: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 500, color: '#93949A' }}>최근 토론</span>
          {history.length > 0 && onClearHistory && (
            <button
              onClick={onClearHistory}
              style={{ fontSize: 10, fontWeight: 600, color: '#C5C6D0', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', borderRadius: 6 }}
              onMouseEnter={e => (e.currentTarget.style.color = '#F04086')}
              onMouseLeave={e => (e.currentTarget.style.color = '#C5C6D0')}
            >
              전체 삭제
            </button>
          )}
        </div>
        {history.length === 0 && (
          <div style={{ padding: '12px 10px', fontSize: 12, fontWeight: 500, color: '#C5C6D0', textAlign: 'center' }}>
            아직 토론 기록이 없습니다
          </div>
        )}
        {history.map((item) => {
          const isActive = item.id === activeDebateId;
          const isHovered = hoveredId === item.id;
          return (
            <div
              key={item.id}
              data-history-id={item.id}
              onClick={() => onSelectDebate(item)}
              onMouseEnter={() => setHoveredId(item.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{
                position: 'relative', padding: '9px 10px', borderRadius: 14, marginBottom: 4, cursor: 'pointer',
                background: isActive ? '#EBECFF' : isHovered ? '#F3F5F6' : 'transparent',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: isActive ? 700 : 500, color: isActive ? '#767DFF' : '#191C32', marginBottom: 5, lineHeight: 1.35, paddingRight: 20 }}>
                {item.turns?.[0]?.topic ?? '(알 수 없음)'}
                {item.turns?.length > 1 && (
                  <span style={{ marginLeft: 5, fontSize: 10, fontWeight: 700, color: '#9F9DF3', background: '#EBECFF', padding: '1px 6px', borderRadius: 10 }}>
                    +{item.turns.length - 1}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {item.models.map((mid, j) => modelMap[mid] ? <ModelPill key={j} model={modelMap[mid]} size={18} /> : null)}
              </div>
              {isHovered && onDeleteDebate && (
                <button
                  aria-label="토론 삭제"
                  onClick={e => { e.stopPropagation(); onDeleteDebate(item.id); }}
                  style={{
                    position: 'absolute', top: 8, right: 8,
                    width: 18, height: 18, borderRadius: '50%',
                    background: '#F04086', border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, color: '#fff', fontWeight: 700, lineHeight: 1,
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom nav */}
      <div style={{ borderTop: '1px solid #E5E7F3', padding: '8px 12px' }}>
        {[
          { icon: <ChatIcon />, label: '채팅',     id: 'chat' },
          { icon: <GearIcon />, label: '모델 설정', id: 'settings' },
          { icon: <BarIcon />,  label: '통계',     id: 'stats' },
        ].map((item) => (
          <button key={item.id}
            onClick={() => onNav(item.id)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px',
              borderRadius: 12, cursor: 'pointer', border: 'none',
              background: activeNav === item.id ? '#EBECFF' : 'transparent',
            }}
          >
            <span style={{ color: activeNav === item.id ? '#767DFF' : '#93949A' }}>{item.icon}</span>
            <span style={{ fontSize: 13, fontWeight: 500, color: activeNav === item.id ? '#767DFF' : '#191C32' }}>{item.label}</span>
          </button>
        ))}
        <div style={{ margin: '6px 0', height: 1, background: '#E5E7F3' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px' }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#D0CFFA', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#767DFF' }}>U</div>
          <span style={{ fontSize: 13, fontWeight: 500, color: '#191C32' }}>사용자</span>
        </div>
      </div>
    </div>
  );
}

function ChatIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  );
}

function BarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/>
      <line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/>
    </svg>
  );
}
