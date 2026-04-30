import type { Model } from '@/lib/types';

export function ModelPill({ model, size = 28 }: { model: Model; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: model.bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.35, fontWeight: 700, color: model.color,
      flexShrink: 0,
    }}>
      {model.abbr}
    </div>
  );
}
