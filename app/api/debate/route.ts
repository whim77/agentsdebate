import { NextRequest } from 'next/server';
import { runDebate } from '@/lib/debate-engine';
import type { DebateEvent } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 120;

function encode(event: DebateEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(req: NextRequest) {
  const { topic, models, modelVersions, roundRobin, priorConsensus } = await req.json();

  if (!topic || typeof topic !== 'string') {
    return new Response(JSON.stringify({ error: '토론 주제가 필요합니다.' }), { status: 400 });
  }

  const activeModels = (models ?? ['gpt', 'claude', 'gemini']) as ('gpt' | 'claude' | 'gemini')[];

  const stream = new ReadableStream({
    async start(controller) {
      const push = (event: DebateEvent) => {
        controller.enqueue(new TextEncoder().encode(encode(event)));
      };

      try {
        for await (const event of runDebate(topic, activeModels, modelVersions, !!roundRobin, priorConsensus ?? [])) {
          push(event);
          if (event.type === 'done') break;
        }
      } catch (err) {
        push({ type: 'error', message: String(err) });
        push({ type: 'done' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
