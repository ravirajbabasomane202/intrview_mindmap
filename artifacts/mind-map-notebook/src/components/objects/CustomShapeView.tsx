import { Check } from 'lucide-react';
import { colors } from '../../lib/storage';
import { CanvasObject } from '../../types/canvas';

export function CustomShapeView({ object }: { object: CanvasObject }) {
  const fill = object.fill || '#d9ebe3';
  const accent = object.color || '#1f5e60';
  switch (object.shapeKind) {
    case 'frame':
      return <div className="pointer-events-none flex h-full w-full items-start justify-start rounded-lg border-2 border-dashed p-1" style={{ borderColor: accent }}>
        <span className="rounded px-1.5 py-0.5 text-[11.5px] font-bold uppercase tracking-wide" style={{ color: accent, backgroundColor: 'hsl(var(--background))' }}>{object.content || 'Frame'}</span>
      </div>;
    case 'ui-divider':
      return <div className="flex h-full w-full items-center px-2"><div className="h-[2px] w-full rounded-full" style={{ backgroundColor: accent }} /></div>;
    case 'ui-chip':
      return <div className="flex h-full w-full items-center justify-center rounded-full px-3 text-xs font-semibold" style={{ backgroundColor: fill, color: accent }}>{object.content || 'Badge'}</div>;
    case 'ui-avatar': {
      const initials = (object.content || 'AB').trim().slice(0, 2).toUpperCase();
      return <div className="flex h-full w-full items-center justify-center rounded-full text-sm font-bold" style={{ backgroundColor: fill, color: accent }}>{initials}</div>;
    }
    case 'ui-checkbox': {
      const checked = object.content.trim().toLowerCase() !== 'off';
      return <div className="flex h-full w-full items-center gap-2 px-2 text-xs font-medium">
        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded" style={{ backgroundColor: checked ? accent : 'transparent', border: `2px solid ${accent}` }}>{checked && <Check size={11} color="#fff" />}</span>
        <span className="truncate">{checked ? 'Checked' : 'Unchecked'}</span>
      </div>;
    }
    case 'ui-toggle': {
      const on = object.content.trim().toLowerCase() !== 'off';
      return <div className="flex h-full w-full items-center gap-2 px-2 text-xs font-medium">
        <span className="relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors" style={{ backgroundColor: on ? accent : 'hsl(var(--muted-foreground)/.4)' }}>
          <span className="absolute h-3 w-3 rounded-full bg-white transition-all" style={{ left: on ? '15px' : '2px' }} />
        </span>
        <span className="truncate">{on ? 'On' : 'Off'}</span>
      </div>;
    }
    case 'ui-progress': {
      const pct = Math.max(0, Math.min(100, parseFloat(object.content) || 60));
      return <div className="flex h-full w-full flex-col justify-center gap-1 px-3">
        <div className="h-2.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: 'hsl(var(--muted-foreground)/.25)' }}>
          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: accent }} />
        </div>
        <span className="text-[11.5px] font-semibold" style={{ color: accent }}>{pct}%</span>
      </div>;
    }
    case 'ui-radio': {
      const on = object.content.trim().toLowerCase() !== 'off';
      return <div className="flex h-full w-full items-center gap-2 px-2 text-xs font-medium">
        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full" style={{ border: `2px solid ${accent}` }}>
          {on && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: accent }} />}
        </span>
        <span className="truncate">{on ? 'Selected' : 'Not selected'}</span>
      </div>;
    }
    case 'ui-slider': {
      const pct = Math.max(0, Math.min(100, parseFloat(object.content) || 40));
      return <div className="flex h-full w-full items-center px-3">
        <div className="relative h-1.5 w-full rounded-full" style={{ backgroundColor: 'hsl(var(--muted-foreground)/.25)' }}>
          <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, backgroundColor: accent }} />
          <div className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 bg-white shadow" style={{ left: `calc(${pct}% - 8px)`, borderColor: accent }} />
        </div>
      </div>;
    }
    case 'ui-tabs': {
      const labels = (object.content || 'Tab 1|Tab 2').split('|').map((label) => label.trim()).filter(Boolean);
      return <div className="flex h-full w-full items-stretch overflow-hidden rounded-lg border" style={{ borderColor: 'hsl(var(--border))' }}>
        {labels.map((label, index) => (
          <div key={index} className={`flex flex-1 items-center justify-center truncate px-2 text-[11px] font-semibold ${index === 0 ? '' : 'border-l'}`} style={{ backgroundColor: index === 0 ? accent : 'transparent', color: index === 0 ? '#fff' : accent, borderColor: 'hsl(var(--border))' }}>
            {label}
          </div>
        ))}
      </div>;
    }
    case 'ui-card': {
      const [title, body] = object.content.split('|');
      return <div className="flex h-full w-full flex-col overflow-hidden rounded-lg border shadow-sm" style={{ borderColor: 'hsl(var(--border))', backgroundColor: fill }}>
        <div className="px-3 py-2 text-xs font-bold" style={{ color: accent, borderBottom: `1px solid hsl(var(--border))` }}>{title?.trim() || 'Card title'}</div>
        <div className="flex-1 overflow-hidden px-3 py-2 text-[11px] leading-5 opacity-80">{body?.trim() || ''}</div>
      </div>;
    }
    case 'icon-node': {
      return <div className="flex h-full w-full items-center justify-center rounded-full text-3xl" style={{ backgroundColor: fill }}>
        <span>{object.content || '💡'}</span>
      </div>;
    }
    case 'topic-card': {
      return <div className="flex h-full w-full flex-col overflow-hidden rounded-lg" style={{ backgroundColor: fill }}>
        <div className="h-1.5 w-full" style={{ backgroundColor: accent }} />
        <div className="flex flex-1 items-center justify-center px-3 text-center font-serif text-lg font-semibold" style={{ color: accent }}>{object.content || 'Topic'}</div>
      </div>;
    }
    case 'cube': {
      // Small isometric cube: three visible faces drawn as a real SVG (not a clip-path), so the
      // internal edges between faces stay visible.
      return <svg viewBox="0 0 100 100" className="h-full w-full">
        <polygon points="50,4 92,26 92,74 50,96 8,74 8,26" fill="none" />
        <polygon points="50,4 92,26 50,48 8,26" fill={accent} opacity={0.55} />
        <polygon points="8,26 50,48 50,96 8,74" fill={accent} opacity={0.85} />
        <polygon points="92,26 92,74 50,96 50,48" fill={accent} opacity={0.7} />
        <polygon points="50,4 92,26 92,74 50,96 8,74 8,26" fill="none" stroke={accent} strokeWidth={2} strokeLinejoin="round" />
      </svg>;
    }
    case 'box-3d': {
      // Elongated rectangular prism, same "real SVG faces" treatment as Cube, distinguished by
      // its proportions rather than being a cube.
      return <svg viewBox="0 0 160 100" className="h-full w-full">
        <polygon points="30,20 130,20 150,4 50,4" fill={accent} opacity={0.55} />
        <polygon points="30,20 130,20 130,90 30,90" fill={accent} opacity={0.85} />
        <polygon points="130,20 150,4 150,74 130,90" fill={accent} opacity={0.7} />
        <polygon points="30,20 130,20 130,90 30,90" fill="none" stroke={accent} strokeWidth={2} strokeLinejoin="round" />
        <polygon points="30,20 130,20 150,4 50,4" fill="none" stroke={accent} strokeWidth={2} strokeLinejoin="round" />
        <polygon points="130,20 150,4 150,74 130,90" fill="none" stroke={accent} strokeWidth={2} strokeLinejoin="round" />
      </svg>;
    }
    default:
      return null;
  }
}
