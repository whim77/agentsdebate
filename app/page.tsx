'use client';

import { useState, useEffect } from 'react';
import { Sidebar } from '@/components/sidebar';
import { ChatScreen } from '@/components/chat-screen';
import { SettingsScreen } from '@/components/settings-screen';
import { StatsScreen } from '@/components/stats-screen';
import { DEFAULT_MODEL_VERSIONS } from '@/lib/types';
import { loadHistory, deleteDebate, clearHistory } from '@/lib/db';
import type { ModelVersions } from '@/lib/types';
import type { DebateRecord } from '@/lib/db';

type NavId = 'chat' | 'settings' | 'stats';

export default function Home() {
  const [nav, setNav] = useState<NavId>('chat');
  const [activeModels, setActiveModels] = useState<('gpt' | 'claude' | 'gemini')[]>(['gpt', 'claude', 'gemini']);
  const [modelVersions, setModelVersions] = useState<ModelVersions>(DEFAULT_MODEL_VERSIONS);
  const [history, setHistory] = useState<DebateRecord[]>([]);
  const [activeDebateId, setActiveDebateId] = useState<string | undefined>();
  const [selectedDebate, setSelectedDebate] = useState<DebateRecord | null>(null);
  const [chatKey, setChatKey] = useState(0);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  function toggleModel(id: 'gpt' | 'claude' | 'gemini') {
    setActiveModels(prev => {
      if (prev.includes(id)) {
        if (prev.length <= 2) return prev;
        return prev.filter(m => m !== id);
      }
      return [...prev, id];
    });
  }

  function updateModelVersion(id: 'gpt' | 'claude' | 'gemini', version: string) {
    setModelVersions(prev => ({ ...prev, [id]: version }));
  }

  function handleDebateSaved(record: DebateRecord) {
    setHistory(prev => {
      const idx = prev.findIndex(r => r.id === record.id);
      if (idx !== -1) {
        // Follow-up turn added to existing record
        const updated = [...prev];
        updated[idx] = record;
        return updated;
      }
      return [record, ...prev].slice(0, 50);
    });
    setActiveDebateId(record.id);
    setSelectedDebate(null);
  }

  function handleDeleteDebate(id: string) {
    deleteDebate(id);
    setHistory(prev => prev.filter(r => r.id !== id));
    if (activeDebateId === id) {
      setActiveDebateId(undefined);
      setSelectedDebate(null);
    }
  }

  function handleClearHistory() {
    clearHistory();
    setHistory([]);
    setActiveDebateId(undefined);
    setSelectedDebate(null);
  }

  function handleSelectDebate(record: DebateRecord) {
    setActiveModels(record.models as ('gpt' | 'claude' | 'gemini')[]);
    setModelVersions(record.modelVersions);
    setSelectedDebate(record);
    setActiveDebateId(record.id);
    setNav('chat');
  }

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden', background: '#F3F5F6' }}>
      <Sidebar
        activeNav={nav}
        onNav={(id) => setNav(id as NavId)}
        onNewDebate={() => { setNav('chat'); setActiveDebateId(undefined); setSelectedDebate(null); setChatKey(k => k + 1); }}
        onSelectDebate={handleSelectDebate}
        onDeleteDebate={handleDeleteDebate}
        onClearHistory={handleClearHistory}
        history={history}
        activeDebateId={activeDebateId}
      />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {nav === 'chat' && <ChatScreen key={chatKey} activeModels={activeModels} modelVersions={modelVersions} onDebateSaved={handleDebateSaved} loadedDebate={selectedDebate} />}
        {nav === 'settings' && (
          <SettingsScreen
            activeModels={activeModels}
            onToggle={toggleModel}
            modelVersions={modelVersions}
            onVersionChange={updateModelVersion}
          />
        )}
        {nav === 'stats' && <StatsScreen />}
      </main>
    </div>
  );
}
