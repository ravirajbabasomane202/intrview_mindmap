import { roundedRect } from './canvas-drawing';
import { getAttachedObjectPosition, getCollapsedHiddenIds, getConnectionAnchors, getLabelPosition } from './connections';
import { CUSTOM_RENDER_SHAPES, shapeClipPath } from './shapes';
import { getFontSize } from './text-style';
import { CanvasObject, Connection, Note, ShapeKind } from '../types/canvas';

// Same rule the editor uses (resolveObjectRect in NoteEditor.tsx): a line-attached object's real
// position comes from its connector's current endpoints, not its own x/y. Exported once per page
// so every consumer below (bounding box, paint loop) sees the same resolved objects instead of
// each re-deriving it.
function resolveObjectsForExport(objects: CanvasObject[], connections: Connection[]): CanvasObject[] {
  return objects.map((object) => {
    if (!object.parentConnectorId) return object;
    const connection = connections.find((c) => c.id === object.parentConnectorId);
    const from = connection && objects.find((o) => o.id === connection.from);
    const to = connection && objects.find((o) => o.id === connection.to);
    if (!connection || !from || !to) return object;
    const center = getAttachedObjectPosition(object, connection, from, to);
    return { ...object, x: center.x - object.width / 2, y: center.y - object.height / 2 };
  });
}

export function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

// Builds (via ctx.beginPath()/moveTo/lineTo/ellipse — caller fills or strokes) the same silhouette
// shapeClipPath() describes in CSS clip-path syntax, translated into canvas path commands in the
// object's own local box coordinates (-width/2..width/2, -height/2..height/2 — the caller has
// already translated the context to the object's center). This is what lets export match the
// editor's rounded corners / non-rectangular clip-paths instead of always drawing a plain rounded
// rect, per the coordinate-basis audit in section 3 of the brief.
function shapeFillPath(ctx: CanvasRenderingContext2D, kind: ShapeKind | undefined, width: number, height: number) {
  const clip = shapeClipPath(kind);
  ctx.beginPath();
  if (!clip) { roundedRect(ctx, -width / 2, -height / 2, width, height, 18); return; }
  if (clip.startsWith('ellipse')) { ctx.ellipse(0, 0, Math.max(width, 0.01) / 2, Math.max(height, 0.01) / 2, 0, 0, Math.PI * 2); return; }
  if (clip.startsWith('inset')) {
    // Both current 'inset' shapes are round-cornered rects: 'round 999px' (stadium, i.e. a full
    // pill) and 'round 22%' (rounded-rectangle). CSS resolves a percentage radius independently
    // per axis; a single circular radius based on the shorter side is a close visual match.
    const radius = clip.includes('999px') ? Math.min(width, height) / 2 : 0.22 * Math.min(width, height);
    roundedRect(ctx, -width / 2, -height / 2, width, height, radius);
    return;
  }
  if (clip.startsWith('polygon')) {
    const points = clip
      .slice(clip.indexOf('(') + 1, -1)
      .split(',')
      .map((pair) => {
        const [px, py] = pair.trim().split(/\s+/).map((value) => parseFloat(value));
        return { x: (px / 100 - 0.5) * width, y: (py / 100 - 0.5) * height };
      });
    if (!points.length) { roundedRect(ctx, -width / 2, -height / 2, width, height, 18); return; }
    ctx.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
    ctx.closePath();
    return;
  }
  roundedRect(ctx, -width / 2, -height / 2, width, height, 18);
}

// The editor renders 'formula' objects by handing their raw LaTeX content to KaTeX (see
// lib/latex.ts), which produces real typeset math. Canvas 2D has no LaTeX engine, and this file
// previously just fillText'd the raw source string (e.g. "\lambda \|\mathbf{w}\|_2^2"), which is
// why exported formulas showed backslash-laden source instead of anything resembling math. This is
// a lightweight LaTeX -> Unicode approximation (greek letters, common operators, \frac, \sqrt,
// \mathbf, sub/superscripts) — not a full typesetter, but it turns the common cases used by these
// notes into readable math text instead of raw source.
const LATEX_SYMBOLS: Record<string, string> = {
  '\\alpha': 'α', '\\beta': 'β', '\\gamma': 'γ', '\\delta': 'δ', '\\epsilon': 'ε', '\\theta': 'θ',
  '\\lambda': 'λ', '\\mu': 'μ', '\\sigma': 'σ', '\\phi': 'φ', '\\omega': 'ω', '\\pi': 'π', '\\tau': 'τ',
  '\\Delta': 'Δ', '\\Sigma': 'Σ', '\\Omega': 'Ω', '\\Gamma': 'Γ', '\\Theta': 'Θ', '\\Lambda': 'Λ',
  '\\times': '×', '\\cdot': '·', '\\pm': '±', '\\leq': '≤', '\\geq': '≥', '\\neq': '≠', '\\approx': '≈',
  '\\infty': '∞', '\\partial': '∂', '\\nabla': '∇', '\\sum': 'Σ', '\\prod': '∏', '\\int': '∫',
  '\\rightarrow': '→', '\\to': '→', '\\in': '∈', '\\cdots': '⋯', '\\ldots': '…', '\\,': ' ',
};
const SUPERSCRIPT_MAP: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻', 'n': 'ⁿ', 'i': 'ⁱ', '+': '⁺' };
const SUBSCRIPT_MAP: Record<string, string> = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉', '-': '₋', '+': '₊' };
function toScript(text: string, map: Record<string, string>) {
  return [...text].map((ch) => map[ch] ?? ch).join('');
}
function texToPlainText(source: string): string {
  let text = source;
  text = text.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/($2)');
  text = text.replace(/\\sqrt\{([^{}]*)\}/g, '√($1)');
  text = text.replace(/\\mathbf\{([^{}]*)\}|\\boldsymbol\{([^{}]*)\}/g, (_m, a, b) => a ?? b);
  text = text.replace(/\\(text|mathrm|mathit)\{([^{}]*)\}/g, '$2');
  text = text.replace(/\\left|\\right/g, '');
  text = text.replace(/\\\|/g, '‖');
  for (const [command, glyph] of Object.entries(LATEX_SYMBOLS)) {
    text = text.split(command).join(glyph);
  }
  text = text.replace(/\^\{([^{}]+)\}/g, (_m, inner) => toScript(inner, SUPERSCRIPT_MAP));
  text = text.replace(/\^([^\s{}])/g, (_m, ch) => toScript(ch, SUPERSCRIPT_MAP));
  text = text.replace(/_\{([^{}]+)\}/g, (_m, inner) => toScript(inner, SUBSCRIPT_MAP));
  text = text.replace(/_([^\s{}])/g, (_m, ch) => toScript(ch, SUBSCRIPT_MAP));
  text = text.replace(/[{}]/g, '').replace(/\\/g, '').replace(/\s+/g, ' ').trim();
  return text;
}

// Greedy word-wrap, drawn at ctx's current textAlign/textBaseline/font. Returns the number of lines
// actually drawn, so callers that need to know how much vertical space was used (e.g. to center a
// wrapped block) can do so.
function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines = 5): number {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(test).width > maxWidth) { lines.push(line); line = word; } else { line = test; }
  }
  if (line) lines.push(line);
  const drawn = lines.slice(0, maxLines);
  drawn.forEach((text, index) => ctx.fillText(text, x, y + index * lineHeight, maxWidth));
  return drawn.length;
}

// The editor renders 'text' object content through renderMarkdownBlock (lib/markdown.tsx), which
// turns **bold**, [[badges]], !warning boxes, etc. into styled elements. Canvas 2D fillText can
// only draw plain glyphs, so without this the exported PNG showed the raw markdown source
// (asterisks, bracket badges, "!warning " prefixes and all) instead of readable text. This strips
// the syntax down to its plain-text content — not a full rewrite of the markdown renderer, just
// enough so exported text reads the same as the editor, minus the visual styling.
function stripMarkdownForExport(source: string): string {
  return source
    .split('\n')
    .map((rawLine) => {
      let line = rawLine;
      // Block-level prefixes: headings, quotes, bullets/numbers, and the "!keyword " admonition
      // boxes (!warning, !tip, !important, !example, !definition, !theorem, !proof, !formula,
      // !keypoint, !concept, !question, !answer, !step — see TextEditorPanel's toolbar).
      line = line.replace(/^#{1,6}\s+/, '');
      line = line.replace(/^>\s?/, '');
      line = line.replace(/^[-*]\s+/, '• ');
      line = line.replace(/^\d+\.\s+/, (match) => match);
      line = line.replace(/^!(warning|tip|important|example|definition|theorem|proof|formula|keypoint|concept|question|answer|step)\s+/i, '');
      // Inline styling: bold/italic/strike/highlight/underline/badges/inline-code.
      line = line.replace(/\*\*([^*]+)\*\*/g, '$1');
      line = line.replace(/~~([^~]+)~~/g, '$1');
      line = line.replace(/==([^=]+)==/g, '$1');
      line = line.replace(/<u>([^<]*)<\/u>/gi, '$1');
      line = line.replace(/\[\[([^\]]+)\]\]/g, '$1');
      line = line.replace(/`([^`]+)`/g, '$1');
      line = line.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '$1');
      return line;
    })
    .join('\n');
}

// Canvas replicas of every shape kind in CUSTOM_RENDER_SHAPES (see shapes.ts) — the ones rendered
// with bespoke DOM/SVG composition (a toggle's knob, a progress fill, a tab strip) rather than a
// single clip-path, so shapeFillPath's clip-path translator can't reach them. 'frame' is the one
// exception, handled separately by the caller (its transparent/dashed-border treatment predates
// this function). Colors intentionally mirror CustomShapeView.tsx's own fallbacks
// (fill || '#d9ebe3', color || '#1f5e60') so an object with no explicit fill/color still matches.
function drawCustomShape(context: CanvasRenderingContext2D, object: CanvasObject, width: number, height: number) {
  const fill = object.fill || '#d9ebe3';
  const accent = object.color || '#1f5e60';
  const content = object.content ?? '';
  switch (object.shapeKind) {
    case 'ui-divider': {
      context.strokeStyle = accent;
      context.lineWidth = 2;
      context.lineCap = 'round';
      context.beginPath();
      context.moveTo(-width / 2 + 8, 0);
      context.lineTo(width / 2 - 8, 0);
      context.stroke();
      break;
    }
    case 'ui-chip': {
      context.fillStyle = fill;
      roundedRect(context, -width / 2, -height / 2, width, height, height / 2);
      context.fill();
      context.fillStyle = accent;
      context.font = '600 12px "DM Sans", sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(content || 'Badge', 0, 0);
      break;
    }
    case 'ui-avatar': {
      const initials = (content || 'AB').trim().slice(0, 2).toUpperCase();
      context.fillStyle = fill;
      context.beginPath();
      context.ellipse(0, 0, width / 2, height / 2, 0, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = accent;
      context.font = '700 14px "DM Sans", sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(initials, 0, 0);
      break;
    }
    case 'ui-checkbox': {
      const checked = content.trim().toLowerCase() !== 'off';
      const box = 16;
      const boxX = -width / 2 + 8;
      context.lineWidth = 2;
      context.strokeStyle = accent;
      roundedRect(context, boxX, -box / 2, box, box, 3);
      if (checked) { context.fillStyle = accent; context.fill(); }
      context.stroke();
      if (checked) {
        context.strokeStyle = '#fff';
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(boxX + 3, 0);
        context.lineTo(boxX + 6.5, box / 2 - 3);
        context.lineTo(boxX + box - 3, -box / 2 + 3);
        context.stroke();
      }
      context.fillStyle = accent;
      context.font = '500 12px "DM Sans", sans-serif';
      context.textAlign = 'left';
      context.textBaseline = 'middle';
      context.fillText(checked ? 'Checked' : 'Unchecked', boxX + box + 8, 0);
      break;
    }
    case 'ui-toggle': {
      const on = content.trim().toLowerCase() !== 'off';
      const trackW = 28, trackH = 16;
      const trackX = -width / 2 + 8;
      context.fillStyle = on ? accent : 'rgba(120,120,120,.4)';
      roundedRect(context, trackX, -trackH / 2, trackW, trackH, trackH / 2);
      context.fill();
      context.fillStyle = '#fff';
      context.beginPath();
      context.ellipse(trackX + (on ? trackW - 8 : 8), 0, 6, 6, 0, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = accent;
      context.font = '500 12px "DM Sans", sans-serif';
      context.textAlign = 'left';
      context.textBaseline = 'middle';
      context.fillText(on ? 'On' : 'Off', trackX + trackW + 8, 0);
      break;
    }
    case 'ui-progress': {
      const pct = Math.max(0, Math.min(100, parseFloat(content) || 60));
      const barW = Math.max(width - 24, 4);
      const barY = -6;
      context.fillStyle = 'rgba(120,120,120,.25)';
      roundedRect(context, -barW / 2, barY, barW, 10, 5);
      context.fill();
      context.fillStyle = accent;
      roundedRect(context, -barW / 2, barY, barW * (pct / 100), 10, 5);
      context.fill();
      context.fillStyle = accent;
      context.font = '600 11.5px "DM Sans", sans-serif';
      context.textAlign = 'left';
      context.textBaseline = 'top';
      context.fillText(`${pct}%`, -barW / 2, barY + 16);
      break;
    }
    case 'ui-radio': {
      const on = content.trim().toLowerCase() !== 'off';
      const r = 8;
      const cx = -width / 2 + 16;
      context.strokeStyle = accent;
      context.lineWidth = 2;
      context.beginPath();
      context.ellipse(cx, 0, r, r, 0, 0, Math.PI * 2);
      context.stroke();
      if (on) {
        context.fillStyle = accent;
        context.beginPath();
        context.ellipse(cx, 0, 4, 4, 0, 0, Math.PI * 2);
        context.fill();
      }
      context.fillStyle = accent;
      context.font = '500 12px "DM Sans", sans-serif';
      context.textAlign = 'left';
      context.textBaseline = 'middle';
      context.fillText(on ? 'Selected' : 'Not selected', cx + r + 8, 0);
      break;
    }
    case 'ui-slider': {
      const pct = Math.max(0, Math.min(100, parseFloat(content) || 40));
      const trackW = Math.max(width - 24, 4);
      const trackX = -trackW / 2;
      context.fillStyle = 'rgba(120,120,120,.25)';
      roundedRect(context, trackX, -3, trackW, 6, 3);
      context.fill();
      context.fillStyle = accent;
      roundedRect(context, trackX, -3, trackW * (pct / 100), 6, 3);
      context.fill();
      const knobX = trackX + trackW * (pct / 100);
      context.fillStyle = '#fff';
      context.strokeStyle = accent;
      context.lineWidth = 2;
      context.beginPath();
      context.ellipse(knobX, 0, 8, 8, 0, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      break;
    }
    case 'ui-tabs': {
      const labels = (content || 'Tab 1|Tab 2').split('|').map((label) => label.trim()).filter(Boolean);
      const count = Math.max(labels.length, 1);
      const segW = width / count;
      context.strokeStyle = 'rgba(120,120,120,.35)';
      context.lineWidth = 1;
      roundedRect(context, -width / 2, -height / 2, width, height, 8);
      context.stroke();
      labels.forEach((label, index) => {
        const segX = -width / 2 + index * segW;
        if (index === 0) { context.fillStyle = accent; context.fillRect(segX, -height / 2, segW, height); }
        else { context.strokeStyle = 'rgba(120,120,120,.35)'; context.beginPath(); context.moveTo(segX, -height / 2); context.lineTo(segX, height / 2); context.stroke(); }
        context.fillStyle = index === 0 ? '#fff' : accent;
        context.font = '600 11px "DM Sans", sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(label, segX + segW / 2, 0, segW - 6);
      });
      break;
    }
    case 'ui-card': {
      const [title, body] = content.split('|');
      context.fillStyle = fill;
      roundedRect(context, -width / 2, -height / 2, width, height, 10);
      context.fill();
      context.strokeStyle = 'rgba(120,120,120,.3)';
      context.lineWidth = 1;
      roundedRect(context, -width / 2, -height / 2, width, height, 10);
      context.stroke();
      context.strokeStyle = 'rgba(120,120,120,.3)';
      context.beginPath();
      context.moveTo(-width / 2, -height / 2 + 28);
      context.lineTo(width / 2, -height / 2 + 28);
      context.stroke();
      context.fillStyle = accent;
      context.font = '700 12px "DM Sans", sans-serif';
      context.textAlign = 'left';
      context.textBaseline = 'middle';
      context.fillText(title?.trim() || 'Card title', -width / 2 + 12, -height / 2 + 14);
      context.font = '400 11px "DM Sans", sans-serif';
      context.textBaseline = 'alphabetic';
      context.globalAlpha = 0.8;
      wrapText(context, body?.trim() || '', -width / 2 + 12, -height / 2 + 46, width - 24, 15);
      context.globalAlpha = 1;
      break;
    }
    case 'icon-node': {
      context.fillStyle = fill;
      context.beginPath();
      context.ellipse(0, 0, width / 2, height / 2, 0, 0, Math.PI * 2);
      context.fill();
      context.font = '32px sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(content || '\uD83D\uDCA1', 0, 2);
      break;
    }
    case 'topic-card': {
      context.fillStyle = fill;
      roundedRect(context, -width / 2, -height / 2, width, height, 10);
      context.fill();
      context.save();
      roundedRect(context, -width / 2, -height / 2, width, height, 10);
      context.clip();
      context.fillStyle = accent;
      context.fillRect(-width / 2, -height / 2, width, 6);
      context.restore();
      context.fillStyle = accent;
      context.font = '600 19px Fraunces, serif';
      context.textAlign = 'center';
      context.textBaseline = 'alphabetic';
      wrapText(context, content || 'Topic', 0, 6, width - 24, 24, 3);
      break;
    }
    case 'cube':
    case 'box-3d': {
      // Same face polygons as CustomShapeView's SVG, mapped from its viewBox into this object's
      // local box coordinates so proportions and internal edges match the editor exactly.
      const viewW = object.shapeKind === 'cube' ? 100 : 160;
      const viewH = 100;
      const toLocal = ([px, py]: [number, number]) => ({ x: (px / viewW - 0.5) * width, y: (py / viewH - 0.5) * height });
      const faces = object.shapeKind === 'cube'
        ? [
            { pts: [[50, 4], [92, 26], [50, 48], [8, 26]] as [number, number][], alpha: 0.55 },
            { pts: [[8, 26], [50, 48], [50, 96], [8, 74]] as [number, number][], alpha: 0.85 },
            { pts: [[92, 26], [92, 74], [50, 96], [50, 48]] as [number, number][], alpha: 0.7 },
          ]
        : [
            { pts: [[30, 20], [130, 20], [150, 4], [50, 4]] as [number, number][], alpha: 0.55 },
            { pts: [[30, 20], [130, 20], [130, 90], [30, 90]] as [number, number][], alpha: 0.85 },
            { pts: [[130, 20], [150, 4], [150, 74], [130, 90]] as [number, number][], alpha: 0.7 },
          ];
      faces.forEach(({ pts, alpha }) => {
        context.globalAlpha = alpha;
        context.fillStyle = accent;
        context.beginPath();
        pts.forEach((point, index) => { const p = toLocal(point); index === 0 ? context.moveTo(p.x, p.y) : context.lineTo(p.x, p.y); });
        context.closePath();
        context.fill();
      });
      context.globalAlpha = 1;
      context.strokeStyle = accent;
      context.lineWidth = 2;
      context.lineJoin = 'round';
      faces.forEach(({ pts }) => {
        context.beginPath();
        pts.forEach((point, index) => { const p = toLocal(point); index === 0 ? context.moveTo(p.x, p.y) : context.lineTo(p.x, p.y); });
        context.closePath();
        context.stroke();
      });
      break;
    }
    default:
      break;
  }
}

// Exports `note.pages[pageIndex]` (defaulting to the first page for back-compatibility) as a PNG.
// Every coordinate below comes straight from CanvasObject.x/y/width/height and Connection data —
// never from the live DOM, zoom, or pan — so the output is identical regardless of the on-screen
// zoom/pan state when export was triggered (the requirement driving section 3 of the brief).
export async function exportNoteAsPng(note: Note, pageIndex = 0) {
  const page = note.pages?.[pageIndex] ?? note.pages?.[0];
  if (!page) return;

  // Line-attached objects resolved once up front (see resolveObjectsForExport) so both the
  // bounding-box pass below and the paint loop later see them at their real, connector-derived
  // position rather than their stored (and, while attached, meaningless) x/y.
  const resolvedObjects = resolveObjectsForExport(page.objects, page.connections ?? []);

  // Bounding box of everything that will be painted (objects, by their rotated corners so tilted
  // shapes aren't clipped; strokes; and connection label positions, which can sit off the line via
  // labelPerpendicularOffset). Previously this function used a fixed 1400x900 canvas translated to
  // its own center, i.e. it assumed page content was centered on (0,0) in page space — anything
  // placed elsewhere (which is the normal case, since objects are authored at arbitrary x/y) fell
  // outside the canvas and was silently clipped. Fitting the canvas to the actual content bounds
  // fixes that "not full view" clipping.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const expand = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };
  for (const object of resolvedObjects) {
    const cx = object.x + object.width / 2;
    const cy = object.y + object.height / 2;
    const angle = ((object.rotation ?? 0) * Math.PI) / 180;
    const hw = object.width / 2, hh = object.height / 2;
    const corners = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]] as const;
    for (const [dx, dy] of corners) {
      const rx = dx * Math.cos(angle) - dy * Math.sin(angle);
      const ry = dx * Math.sin(angle) + dy * Math.cos(angle);
      expand(cx + rx, cy + ry);
    }
  }
  for (const connection of page.connections ?? []) {
    const from = resolvedObjects.find((object) => object.id === connection.from);
    const to = resolvedObjects.find((object) => object.id === connection.to);
    if (!from || !to) continue;
    if (connection.label) {
      const labelPos = getLabelPosition(connection, from, to);
      expand(labelPos.x - 20, labelPos.y - 20);
      expand(labelPos.x + 20, labelPos.y + 20);
    }
  }
  for (const stroke of page.strokes ?? []) {
    for (const point of stroke.points) expand(point.x, point.y);
  }
  if (!Number.isFinite(minX)) { minX = 0; minY = 0; maxX = 0; maxY = 0; }

  const padding = 60;
  const contentWidth = Math.max(maxX - minX, 1) + padding * 2;
  const contentHeight = Math.max(maxY - minY, 1) + padding * 2;
  const maxDimension = 2400;
  const scale = Math.min(1, maxDimension / Math.max(contentWidth, contentHeight));

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(contentWidth * scale);
  canvas.height = Math.round(contentHeight * scale);
  // Transparent by default (no forced page-color rectangle) — the note model has no page/note
  // background field today, so there is nothing "explicitly set" to respect; if one is added later,
  // fill it here first. Leaving the canvas untouched keeps its native alpha channel, so PNG export
  // is genuinely transparent instead of a hard-coded cream fill.
  const context = canvas.getContext('2d');
  if (!context) return;
  context.scale(scale, scale);
  // Shift world coordinates so the content's top-left (minus padding) lands at the canvas origin,
  // instead of assuming the page is centered on (0,0).
  context.translate(-minX + padding, -minY + padding);

  function drawArrowhead(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, color: string, type: string) {
    const size = 10;
    ctx.fillStyle = color;
    ctx.beginPath();
    if (type === 'circle') {
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
    } else if (type === 'diamond') {
      ctx.moveTo(x, y);
      ctx.lineTo(x - size * Math.cos(angle - Math.PI / 4), y - size * Math.sin(angle - Math.PI / 4));
      ctx.lineTo(x - size * Math.cos(angle + Math.PI / 4), y - size * Math.sin(angle + Math.PI / 4));
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.moveTo(x, y);
      ctx.lineTo(x - size * Math.cos(angle - 0.5), y - size * Math.sin(angle - 0.5));
      ctx.lineTo(x - size * Math.cos(angle + 0.5), y - size * Math.sin(angle + 0.5));
      ctx.closePath();
      ctx.fill();
    }
  }

  // Same visibility rule the editor uses for collapsed mind-map branches (getCollapsedHiddenIds),
  // so a collapsed node's hidden descendants/connections don't reappear in the export.
  const hiddenIds = getCollapsedHiddenIds(page.objects, page.connections ?? []);
  const visibleObjects = resolvedObjects.filter((object) => !hiddenIds.has(object.id));
  const visibleConnections = (page.connections ?? []).filter((connection) => !hiddenIds.has(connection.from) && !hiddenIds.has(connection.to));

  // Paint order matches the editor: objects (by zIndex, so bringObject front/back/forward/backward
  // ordering — and container-vs-child stacking — carries over), then connectors/labels, then
  // strokes on top (the editor's connector+stroke SVG sits at a much higher z-index than any
  // object div, so it always paints above every object regardless of object.zIndex).
  const sortedObjects = [...visibleObjects].sort((a, b) => a.zIndex - b.zIndex);

  for (const object of sortedObjects) {
    context.save();
    context.translate(object.x + object.width / 2, object.y + object.height / 2);
    context.rotate((object.rotation * Math.PI) / 180);
    const isFrame = object.type === 'shape' && object.shapeKind === 'frame';
    const isCustomShape = !isFrame && object.type === 'shape' && !!object.shapeKind && CUSTOM_RENDER_SHAPES.has(object.shapeKind);
    if (isFrame) {
      // Frames render transparent with a dashed border in the editor (CustomShapeView) — a solid
      // fill here would visually bury the container's children, so match that instead.
      context.setLineDash([6, 5]);
      context.strokeStyle = object.color || '#1f5e60';
      context.lineWidth = 2;
      roundedRect(context, -object.width / 2, -object.height / 2, object.width, object.height, 10);
      context.stroke();
      context.setLineDash([]);
    } else if (isCustomShape) {
      // Bespoke shapes (toggles, cards, cubes, ...) — drawCustomShape mirrors CustomShapeView.tsx's
      // DOM/SVG composition instead of the generic clip-path fill, and draws its own label/content
      // internally, so the generic content-drawing block below is skipped for these.
      drawCustomShape(context, object, object.width, object.height);
    } else {
      context.shadowColor = 'rgba(69, 59, 45, .14)';
      context.shadowBlur = 18;
      context.shadowOffsetY = 8;
      context.fillStyle = object.fill;
      shapeFillPath(context, object.type === 'shape' ? object.shapeKind : undefined, object.width, object.height);
      context.fill();
      context.shadowColor = 'transparent';
    }
    context.fillStyle = object.color;
    if (isCustomShape) {
      // Content already drawn inside drawCustomShape above.
    } else if (object.type === 'image' && object.content.startsWith('data:')) {
      await new Promise<void>((resolve) => {
        const image = new Image();
        image.onload = () => {
          context.drawImage(image, -object.width / 2 + 8, -object.height / 2 + 8, object.width - 16, object.height - 16);
          resolve();
        };
        image.onerror = () => resolve();
        image.src = object.content;
      });
    } else if (object.type === 'table') {
      const rows = object.content.split('\n').map((row) => row.split('\t'));
      const cellWidth = object.width / 2;
      const cellHeight = object.height / Math.max(rows.length, 1);
      context.font = `${getFontSize(object)}px "DM Sans", sans-serif`;
      context.textAlign = 'left';
      context.textBaseline = 'alphabetic';
      rows.forEach((row, rowIndex) => row.slice(0, 2).forEach((cell, cellIndex) => {
        context.strokeStyle = 'rgba(31, 94, 96, .25)';
        context.strokeRect(-object.width / 2 + cellIndex * cellWidth, -object.height / 2 + rowIndex * cellHeight, cellWidth, cellHeight);
        context.fillText(cell, -object.width / 2 + cellIndex * cellWidth + 12, -object.height / 2 + rowIndex * cellHeight + 26);
      }));
    } else if (object.type === 'formula') {
      context.font = `italic ${getFontSize(object)}px "Cambria Math", Cambria, Georgia, serif`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      const lines = object.content.split('\n').map(texToPlainText);
      lines.forEach((line, lineIndex) => context.fillText(line, 0, (lineIndex - (lines.length - 1) / 2) * 26));
    } else if (object.type === 'checklist') {
      // Checklist objects store their items in checklistItems, not content — the previous generic
      // fillText(object.content) below drew nothing for these since content is unused for this
      // type. Draw each item's checkbox + label explicitly instead, matching ChecklistView.tsx.
      const items = object.checklistItems ?? [];
      const fontSize = getFontSize(object);
      const lineHeight = fontSize + 8;
      const startY = -object.height / 2 + lineHeight;
      context.textAlign = 'left';
      context.textBaseline = 'middle';
      const boxSize = Math.max(10, fontSize * 0.85);
      const leftX = -object.width / 2 + 14;
      items.forEach((item, index) => {
        const y = startY + index * lineHeight;
        if (y > object.height / 2 - 6) return; // matches editor's overflow-auto cutoff for tall lists
        context.strokeStyle = item.done ? (object.color || '#1f5e60') : 'rgba(31, 94, 96, .45)';
        context.fillStyle = item.done ? (object.color || '#1f5e60') : 'transparent';
        roundedRect(context, leftX, y - boxSize / 2, boxSize, boxSize, 3);
        if (item.done) context.fill();
        context.stroke();
        context.font = `${fontSize}px "DM Sans", sans-serif`;
        context.fillStyle = object.color;
        context.fillText(item.text || '(empty item)', leftX + boxSize + 8, y, object.width - boxSize - 30);
        if (item.done) {
          const textWidth = context.measureText(item.text || '(empty item)').width;
          context.strokeStyle = object.color;
          context.lineWidth = 1;
          context.beginPath();
          context.moveTo(leftX + boxSize + 8, y);
          context.lineTo(leftX + boxSize + 8 + Math.min(textWidth, object.width - boxSize - 30), y);
          context.stroke();
        }
      });
      if (!items.length) {
        context.font = `${fontSize}px "DM Sans", sans-serif`;
        context.fillStyle = object.color;
        context.globalAlpha = 0.6;
        context.fillText('No items yet', leftX, 0);
        context.globalAlpha = 1;
      }
    } else if (object.type === 'code') {
      const fontSize = getFontSize(object);
      const lineHeight = fontSize + 6;
      context.font = `${fontSize}px "JetBrains Mono", "Fira Code", monospace`;
      context.textAlign = 'left';
      context.textBaseline = 'top';
      const leftX = -object.width / 2 + 12;
      const topY = -object.height / 2 + 10;
      const rawLines = object.content.split('\n');
      const maxLines = Math.max(1, Math.floor((object.height - 20) / lineHeight));
      rawLines.slice(0, maxLines).forEach((line, index) => context.fillText(line, leftX, topY + index * lineHeight, object.width - 24));
    } else {
      const fontSize = getFontSize(object);
      const lineHeight = fontSize * (object.type === 'shape' ? 1.2 : 1.5);
      context.font = object.type === 'shape' ? `600 ${fontSize}px Fraunces, serif` : `${fontSize}px "DM Sans", sans-serif`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      const textY = isFrame ? -object.height / 2 + 14 : 0;
      // Flashcards store "front|||back" in content (see the comment at the bottom of
      // CanvasObjectContent.tsx); export shows the front face, same as the card's resting state.
      const rawContent = object.type === 'flashcard' ? object.content.split('|||')[0] ?? '' : object.content;
      const plainText = object.type === 'text' ? stripMarkdownForExport(rawContent) : rawContent;
      const maxWidth = object.width - 24;
      // Wrap each source line independently (rather than one long wrap of the whole string) so
      // deliberate line breaks the person typed are preserved, matching whitespace-pre-line in the
      // editor's CanvasObjectContent.tsx.
      const wrappedLines: string[] = [];
      plainText.split('\n').forEach((sourceLine) => {
        if (!sourceLine) { wrappedLines.push(''); return; }
        const words = sourceLine.split(/\s+/).filter(Boolean);
        let current = '';
        for (const word of words) {
          const test = current ? `${current} ${word}` : word;
          if (current && context.measureText(test).width > maxWidth) { wrappedLines.push(current); current = word; } else { current = test; }
        }
        if (current) wrappedLines.push(current);
      });
      const maxLines = Math.max(1, Math.floor(object.height / lineHeight));
      const shown = wrappedLines.slice(0, maxLines);
      shown.forEach((line, lineIndex) => context.fillText(line, 0, textY + (lineIndex - (shown.length - 1) / 2) * lineHeight, maxWidth));
    }
    context.restore();
  }

  for (const connection of visibleConnections) {
    const from = resolvedObjects.find((object) => object.id === connection.from);
    const to = resolvedObjects.find((object) => object.id === connection.to);
    if (!from || !to) continue;

    // Anchor at the rect edge closest to the other object, same as the editor's
    // getConnectionAnchors — not object centers, so the line doesn't run into the shape fill.
    const { start, end } = getConnectionAnchors(from, to);
    const x1 = start.x, y1 = start.y, x2 = end.x, y2 = end.y;

    const strokeColor = connection.strokeColor ?? 'rgba(31, 94, 96, .45)';
    const strokeWidth = connection.strokeWidth ?? 2;
    const strokeDasharray = connection.strokeDasharray ?? '7 7';

    context.strokeStyle = strokeColor;
    context.lineWidth = strokeWidth;

    if (strokeDasharray) {
      const parts = strokeDasharray.split(' ').map(Number);
      context.setLineDash(parts);
    }

    context.beginPath();
    if (connection.curved) {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const distance = Math.sqrt(dx * dx + dy * dy) || 1;
      const offset = Math.min(distance * 0.3, 100);
      const cx = x1 + dx / 2 - dy / distance * offset;
      const cy = y1 + dy / 2 + dx / distance * offset;
      context.moveTo(x1, y1);
      context.quadraticCurveTo(cx, cy, x2, y2);

      if (connection.arrowhead !== 'none') {
        const endAngle = Math.atan2(2 * (cy - y2), 2 * (cx - x2));
        drawArrowhead(context, x2, y2, endAngle, strokeColor, connection.arrowhead ?? 'arrow');
      }
      if (connection.arrowhead === 'both') {
        const startAngle = Math.atan2(2 * (cy - y1), 2 * (cx - x1));
        drawArrowhead(context, x1, y1, startAngle + Math.PI, strokeColor, connection.arrowhead ?? 'arrow');
      }
    } else {
      context.moveTo(x1, y1);
      context.lineTo(x2, y2);

      if (connection.arrowhead !== 'none') {
        const angle = Math.atan2(y2 - y1, x2 - x1);
        drawArrowhead(context, x2, y2, angle, strokeColor, connection.arrowhead ?? 'arrow');
      }
      if (connection.arrowhead === 'both') {
        const angle = Math.atan2(y1 - y2, x1 - x2);
        drawArrowhead(context, x1, y1, angle, strokeColor, connection.arrowhead ?? 'arrow');
      }
    }
    context.stroke();
    context.setLineDash([]);

    if (connection.label) {
      // Same on-line/offset math as the editor's getLabelPosition, so a label dragged off the
      // line (labelPerpendicularOffset) exports where it visually sits instead of snapping back
      // to the line's midpoint.
      const labelPos = getLabelPosition(connection, from, to);
      const isOffLine = Math.abs(connection.labelPerpendicularOffset ?? 0) > 0.5;
      if (isOffLine) {
        const onLineAnchor = getLabelPosition({ ...connection, labelPerpendicularOffset: 0 }, from, to);
        context.save();
        context.strokeStyle = strokeColor;
        context.lineWidth = 1;
        context.setLineDash([2, 2]);
        context.globalAlpha = 0.6;
        context.beginPath();
        context.moveTo(onLineAnchor.x, onLineAnchor.y);
        context.lineTo(labelPos.x, labelPos.y);
        context.stroke();
        context.restore();
      }
      context.fillStyle = strokeColor;
      context.font = '11px "DM Sans", sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'bottom';
      context.fillText(connection.label, labelPos.x, labelPos.y - 8);
    }
  }

  for (const stroke of page.strokes ?? []) {
    if (stroke.points.length < 2) continue;
    context.strokeStyle = stroke.color ?? 'rgba(31, 94, 96, .65)';
    context.lineWidth = stroke.width ?? 5;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    if (stroke.dasharray) context.setLineDash(stroke.dasharray.split(' ').map(Number));
    context.beginPath();
    context.moveTo(stroke.points[0].x, stroke.points[0].y);
    stroke.points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
    context.stroke();
    context.setLineDash([]);
  }

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (blob) saveBlob(blob, `${note.title.replace(/\s+/g, '-').toLowerCase()}.png`);
}
