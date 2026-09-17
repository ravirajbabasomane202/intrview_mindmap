import { Check } from 'lucide-react';
import { shapeClipPath } from '../../lib/shapes';
import { ShapeKind } from '../../types/canvas';

export function ShapePreviewSwatch({ kind }: { kind: ShapeKind }) {
  const accent = 'hsl(var(--primary))';
  const track = 'hsl(var(--muted-foreground) / .25)';
  const soft = 'hsl(var(--primary) / .22)';
  switch (kind) {
    case 'frame':
      return <div className="h-full w-full rounded-[3px] border-2 border-dashed" style={{ borderColor: accent }} />;
    case 'ui-divider':
      return <div className="flex h-full w-full items-center"><div className="h-[2px] w-full rounded-full" style={{ backgroundColor: accent }} /></div>;
    case 'ui-chip':
      return <div className="flex h-full w-full items-center"><div className="h-2.5 w-full rounded-full" style={{ backgroundColor: accent }} /></div>;
    case 'ui-avatar':
      return <div className="h-full w-full rounded-full" style={{ backgroundColor: accent }} />;
    case 'ui-checkbox':
      return <div className="flex h-full w-full items-center justify-center rounded-[3px]" style={{ backgroundColor: accent }}><Check size={11} color="#fff" strokeWidth={3} /></div>;
    case 'ui-toggle':
      return <div className="relative flex h-full w-full items-center"><div className="h-3 w-full rounded-full" style={{ backgroundColor: accent }} /><div className="absolute right-0.5 h-2 w-2 rounded-full bg-white" /></div>;
    case 'ui-progress':
      return <div className="flex h-full w-full items-center"><div className="h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: track }}><div className="h-full w-3/5 rounded-full" style={{ backgroundColor: accent }} /></div></div>;
    case 'ui-radio':
      return <div className="flex h-full w-full items-center justify-center rounded-full border-2" style={{ borderColor: accent }}><div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent }} /></div>;
    case 'ui-slider':
      return <div className="relative flex h-full w-full items-center"><div className="h-1 w-full overflow-hidden rounded-full" style={{ backgroundColor: track }}><div className="h-full w-2/5 rounded-full" style={{ backgroundColor: accent }} /></div><div className="absolute h-2.5 w-2.5 rounded-full border-2 bg-white" style={{ left: '38%', borderColor: accent }} /></div>;
    case 'ui-tabs':
      return <div className="flex h-full w-full gap-0.5 overflow-hidden rounded-[3px]"><div className="flex-1" style={{ backgroundColor: accent }} /><div className="flex-1" style={{ backgroundColor: soft }} /><div className="flex-1" style={{ backgroundColor: soft }} /></div>;
    case 'ui-card':
      return <div className="flex h-full w-full flex-col overflow-hidden rounded-[3px] border" style={{ borderColor: accent, backgroundColor: soft }}><div className="h-1/3 w-full" style={{ backgroundColor: accent }} /></div>;
    case 'icon-node':
      return <div className="flex h-full w-full items-center justify-center rounded-full text-[11px] leading-none" style={{ backgroundColor: soft }}>💡</div>;
    case 'topic-card':
      return <div className="flex h-full w-full flex-col overflow-hidden rounded-[3px]" style={{ backgroundColor: soft }}><div className="h-1 w-full" style={{ backgroundColor: accent }} /></div>;
    case 'cube':
      return <svg viewBox="0 0 100 100" className="h-full w-full">
        <polygon points="50,4 92,26 50,48 8,26" fill={accent} opacity={0.55} />
        <polygon points="8,26 50,48 50,96 8,74" fill={accent} opacity={0.85} />
        <polygon points="92,26 92,74 50,96 50,48" fill={accent} opacity={0.7} />
      </svg>;
    case 'box-3d':
      return <svg viewBox="0 0 160 100" className="h-full w-full">
        <polygon points="30,20 130,20 150,4 50,4" fill={accent} opacity={0.55} />
        <polygon points="30,20 130,20 130,90 30,90" fill={accent} opacity={0.85} />
        <polygon points="130,20 150,4 150,74 130,90" fill={accent} opacity={0.7} />
      </svg>;
    default:
      return <span className="block h-full w-full bg-[hsl(var(--primary))]" style={{ clipPath: shapeClipPath(kind) }} />;
  }
}
