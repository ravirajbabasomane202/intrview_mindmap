import { createPortal } from 'react-dom';
import { ExternalLink, FileQuestion, Link2 } from 'lucide-react';
import { shapeClipPath } from '../../lib/shapes';
import { CanvasObject, Page } from '../../types/canvas';

const POPUP_WIDTH = 260;
const MINI_HEIGHT = 150;

// Read-only mini render of an entire page: objects placed proportionally inside a small SVG
// viewport (scaled to fit, same aspect-preserving fit as the real canvas would use), plus
// connections as simple lines. This is intentionally not a full canvas — it's a hover preview, so
// it favors "recognizable at a glance" over pixel-perfect fidelity.
function PageMiniPreview({ page }: { page: Page }) {
  const objects = page.objects ?? [];
  if (!objects.length) {
    return <div className="flex h-[150px] items-center justify-center text-xs text-[hsl(var(--muted-foreground))]">This page is empty.</div>;
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  objects.forEach((object) => {
    minX = Math.min(minX, object.x);
    minY = Math.min(minY, object.y);
    maxX = Math.max(maxX, object.x + object.width);
    maxY = Math.max(maxY, object.y + object.height);
  });
  const pad = 24;
  const viewW = Math.max(maxX - minX, 1) + pad * 2;
  const viewH = Math.max(maxY - minY, 1) + pad * 2;
  const offsetX = -minX + pad;
  const offsetY = -minY + pad;
  const connections = page.connections ?? [];
  const byId = new Map(objects.map((object) => [object.id, object]));
  return (
    <svg viewBox={`0 0 ${viewW} ${viewH}`} className="h-[150px] w-full rounded-lg bg-[hsl(var(--background))]" preserveAspectRatio="xMidYMid meet">
      {connections.map((connection) => {
        const from = byId.get(connection.from);
        const to = byId.get(connection.to);
        if (!from || !to) return null;
        const x1 = from.x + from.width / 2 + offsetX, y1 = from.y + from.height / 2 + offsetY;
        const x2 = to.x + to.width / 2 + offsetX, y2 = to.y + to.height / 2 + offsetY;
        return <line key={connection.id} x1={x1} y1={y1} x2={x2} y2={y2} stroke="hsl(var(--muted-foreground) / .45)" strokeWidth={2} />;
      })}
      {objects.map((object) => (
        <rect
          key={object.id}
          x={object.x + offsetX}
          y={object.y + offsetY}
          width={object.width}
          height={object.height}
          rx={object.type === 'shape' ? 10 : 6}
          fill={object.fill || 'hsl(var(--secondary))'}
          stroke={object.color || 'hsl(var(--primary))'}
          strokeWidth={1.5}
          opacity={0.92}
        />
      ))}
    </svg>
  );
}

// Read-only render of one target object "as it is" — same fill/color/shape silhouette and text —
// plus its immediate connected neighbors as small labeled chips, giving the hovering person the
// "sub-links / connected context" the brief asks for without leaving the current page.
function ObjectFocusPreview({ page, object }: { page: Page; object: CanvasObject }) {
  const connections = page.connections ?? [];
  const neighbors = connections
    .filter((connection) => connection.from === object.id || connection.to === object.id)
    .map((connection): { other: CanvasObject; direction: 'to' | 'from'; label?: string } | null => {
      const otherId = connection.from === object.id ? connection.to : connection.from;
      const other = page.objects.find((candidate) => candidate.id === otherId);
      return other ? { other, direction: connection.from === object.id ? 'to' : 'from', label: connection.label } : null;
    })
    .filter((entry) => entry !== null);
  const displayText = object.type === 'flashcard' ? object.content.split('|||')[0] : object.content;
  return (
    <div className="space-y-2">
      <div
        className="flex max-h-[110px] min-h-[64px] items-center justify-center overflow-hidden p-3 text-center text-sm font-medium leading-5"
        style={{ backgroundColor: object.fill || 'hsl(var(--secondary))', color: object.color, clipPath: object.type === 'shape' ? shapeClipPath(object.shapeKind) : undefined, borderRadius: object.type === 'shape' ? undefined : 10 }}
      >
        <span className="line-clamp-4 whitespace-pre-line">{displayText?.trim() || <span className="opacity-60">Empty piece</span>}</span>
      </div>
      {neighbors.length > 0 && (
        <div>
          <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Connected</p>
          <div className="flex flex-wrap gap-1.5">
            {neighbors.slice(0, 4).map(({ other, direction, label }) => (
              <span key={other.id} className="inline-flex max-w-full items-center gap-1 truncate rounded-full bg-[hsl(var(--muted))] px-2 py-0.5 text-[10.5px] font-medium text-[hsl(var(--foreground))]">
                {direction === 'to' ? '→' : '←'} {label ? `${label}: ` : ''}{(other.content || other.type).slice(0, 20) || other.type}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function LinkPreviewPopup({
  link,
  pages,
  anchorRect,
  onOpen,
  onPointerEnter,
  onPointerLeave,
}: {
  link: { pageId: string; objectId?: string };
  pages: Page[];
  anchorRect: { top: number; left: number; right: number; bottom: number };
  onOpen: () => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}) {
  const targetPage = pages.find((page) => page.id === link.pageId);
  const targetObject = link.objectId && targetPage ? targetPage.objects.find((object) => object.id === link.objectId) : undefined;

  // Prefer opening below-right of the badge; flip above if that would run off the bottom of the
  // viewport, and clamp horizontally so it never runs off either edge.
  const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const viewportH = typeof window !== 'undefined' ? window.innerHeight : 800;
  const estimatedHeight = 230;
  const opensAbove = anchorRect.bottom + estimatedHeight + 12 > viewportH;
  const top = opensAbove ? Math.max(8, anchorRect.top - estimatedHeight - 10) : anchorRect.bottom + 10;
  const left = Math.min(Math.max(8, anchorRect.left - POPUP_WIDTH / 2), viewportW - POPUP_WIDTH - 8);

  return createPortal(
    <div
      role="tooltip"
      onMouseEnter={onPointerEnter}
      onMouseLeave={onPointerLeave}
      className="fixed z-[9999] animate-pop rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 shadow-2xl"
      style={{ top, left, width: POPUP_WIDTH }}
      data-testid="popup-link-preview"
    >
      {!targetPage ? (
        <div className="flex items-center gap-2 py-3 text-xs text-[hsl(var(--muted-foreground))]" data-testid="text-link-preview-not-found">
          <FileQuestion size={16} /> Page not found
        </div>
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-[hsl(var(--foreground))]">
              <Link2 size={13} className="shrink-0 text-[hsl(var(--primary))]" />
              <span className="truncate" data-testid="text-link-preview-title">{targetPage.title}</span>
            </div>
            <button
              type="button"
              onClick={onOpen}
              className="flex shrink-0 items-center gap-1 rounded-lg bg-[hsl(var(--primary))] px-2 py-1 text-[10.5px] font-semibold text-white transition-opacity hover:opacity-90"
              data-testid="button-link-preview-open"
            >
              Open <ExternalLink size={11} />
            </button>
          </div>
          {targetObject ? <ObjectFocusPreview page={targetPage} object={targetObject} /> : <PageMiniPreview page={targetPage} />}
        </>
      )}
    </div>,
    document.body
  );
}
