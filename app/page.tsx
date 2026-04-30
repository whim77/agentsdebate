'use client';

import { useState } from 'react';
import { Sidebar } from '@/components/sidebar';
import { ChatScreen } from '@/components/chat-screen';
import { SettingsScreen } from '@/components/settings-screen';
import { StatsScreen } from '@/components/stats-screen';

type NavId = 'chat' | 'settings' | 'stats';

export default function Home() {
  const [nav, setNav] = useState<NavId>('chat');
  const [activeModels, setActiveModels] = useState<('gpt' | 'claude' | 'gemini')[]>(['gpt', 'claude', 'gemini']);

  function toggleModel(id: 'gpt' | 'claude' | 'gemini') {
    setActiveModels(prev => {
      if (prev.includes(id)) {
        if (prev.length <= 2) return prev;
        return prev.filter(m => m !== id);
      }
      return [...prev, id];
    });
  }

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden', background: '#F3F5F6' }}>
      <Sidebar
        activeNav={nav}
        onNav={(id) => setNav(id as NavId)}
        onNewDebate={() => setNav('chat')}
      />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {nav === 'chat' && <ChatScreen activeModels={activeModels} />}
        {nav === 'settings' && <SettingsScreen activeModels={activeModels} onToggle={toggleModel} />}
        {nav === 'stats' && <StatsScreen />}
      </main>
    </div>
  );
}
