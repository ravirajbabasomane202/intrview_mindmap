import { createPortal } from 'react-dom';
import { ExternalLink, FileQuestion, Link2 } from 'lucide-react';
import { shapeClipPath } from '../../lib/shapes';
import { renderMarkdownBlock, stripMarkdownToPlainText } from '../../lib/markdown';
import { CanvasObject, Page } from '../../types/canvas';

// The popup's footprint is now driven by its content (see ObjectFocusPreview / PageMiniPreview)
// rather than a single fixed box, so these are bounds, not a fixed size: wide/tall enough to be
// readable, capped so it never runs off screen, with internal scrolling past the cap.
const POPUP_MIN_WIDTH = 260;
const POPUP_MAX_WIDTH = 360;
const POPUP_MAX_HEIGHT = 420;
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
  // Markdown-formatted objects (text pieces with !concept boxes, **bold**, <u>underline</u>, etc.)
  // get the same styled render the canvas/editor use, instead of showing the raw syntax as text.
  // Non-text objects (shapes, flashcards) keep the plain centered treatment — their content isn't
  // markdown source.
  const isMarkdownObject = object.type === 'text';
  return (
    <div className="space-y-2">
      <div
        className="min-h-[56px] p-3 text-sm leading-5"
        style={{
          backgroundColor: object.fill || 'hsl(var(--secondary))',
          color: object.color,
          clipPath: object.type === 'shape' ? shapeClipPath(object.shapeKind) : undefined,
          borderRadius: object.type === 'shape' ? undefined : 10,
          textAlign: isMarkdownObject ? 'left' : 'center',
        }}
      >
        {!displayText?.trim() ? (
          <span className="opacity-60">Empty piece</span>
        ) : isMarkdownObject ? (
          <div className="whitespace-pre-line font-medium">{renderMarkdownBlock(displayText)}</div>
        ) : (
          <span className="flex items-center justify-center whitespace-pre-line font-medium">{displayText.trim()}</span>
        )}
      </div>
      {neighbors.length > 0 && (
        <div>
          <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Connected</p>
          <div className="flex flex-col gap-1">
            {neighbors.slice(0, 6).map(({ other, direction, label }) => {
              const neighborText = stripMarkdownToPlainText(other.content || '') || other.type;
              return (
                <span key={other.id} className="flex items-start gap-1.5 rounded-lg bg-[hsl(var(--muted))] px-2 py-1 text-[11px] font-medium leading-4 text-[hsl(var(--foreground))]">
                  <span className="shrink-0 text-[hsl(var(--muted-foreground))]">{direction === 'to' ? '→' : '←'}</span>
                  <span className="min-w-0 break-words">{label ? <span className="text-[hsl(var(--muted-foreground))]">{label}: </span> : null}{neighborText}</span>
                </span>
              );
            })}
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
  // The card's real height now depends on its content (a long !concept box, several connected
  // sub-nodes), so we can't know it before render. Estimate generously for placement, clamp to
  // POPUP_MAX_HEIGHT with internal scrolling, and clamp vertical position to the viewport so a
  // card that ends up taller than estimated still stays fully on screen either way it opens.
  const estimatedHeight = Math.min(POPUP_MAX_HEIGHT, 260);
  const opensAbove = anchorRect.bottom + estimatedHeight + 12 > viewportH;
  const rawTop = opensAbove ? anchorRect.top - estimatedHeight - 10 : anchorRect.bottom + 10;
  const top = Math.min(Math.max(8, rawTop), Math.max(8, viewportH - estimatedHeight - 8));
  const width = Math.min(POPUP_MAX_WIDTH, Math.max(POPUP_MIN_WIDTH, viewportW - 16));
  const left = Math.min(Math.max(8, anchorRect.left - width / 2), viewportW - width - 8);

  return createPortal(
    <div
      role="tooltip"
      onMouseEnter={onPointerEnter}
      onMouseLeave={onPointerLeave}
      className="fixed z-[9999] animate-pop overflow-y-auto rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 shadow-2xl"
      style={{ top, left, width, maxHeight: POPUP_MAX_HEIGHT }}
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
