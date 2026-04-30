import Anthropic from '@anthropic-ai/sdk';
import type { ConsensusResult, DebateMessage } from './types';

function getAnthropic() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

function buildTranscript(rounds: { num: number; messages: DebateMessage[] }[]): string {
  return rounds
    .map(r => {
      const label = r.num === 0 ? '초기 답변' : r.num === 1 ? '반론' : '재반론/동의';
      const msgs = r.messages.map(m => `${m.modelId.toUpperCase()}: ${m.content}`).join('\n');
      return `[라운드 ${r.num} — ${label}]\n${msgs}`;
    })
    .join('\n\n');
}

export async function runJudge(
  rounds: { num: number; messages: DebateMessage[] }[]
): Promise<ConsensusResult> {
  const transcript = buildTranscript(rounds);

  const prompt = `아래는 3개 AI 모델의 토론 기록입니다.
어떤 모델도 반론하지 않은 주장(합의)과 이견이 남은 주장을 구분하여 JSON으로 반환하세요.

confidence 기준:
- 1.0: 모든 모델이 명시적으로 동의 표현
- 0.7: 반론 없음 (암묵적 동의)
- 0.4: 부분 동의
- 0.1 이하: 이견 있음

반드시 아래 JSON 형식만 반환하세요 (설명 없이):
{
  "consensus": ["반론 없이 모두 동의한 항목들"],
  "disputed": ["이견이 남은 항목들"],
  "confidence": 0.0
}

토론 기록:
${transcript}`;

  const res = await getAnthropic().messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = res.content[0].type === 'text' ? res.content[0].text : '{}';

  try {
    const json = JSON.parse(text.replace(/```json\n?|\n?```/g, '').trim());
    return {
      consensus: Array.isArray(json.consensus) ? json.consensus : [],
      disputed: Array.isArray(json.disputed) ? json.disputed : [],
      confidence: typeof json.confidence === 'number' ? json.confidence : 0,
    };
  } catch {
    return { consensus: [], disputed: [], confidence: 0 };
  }
}
