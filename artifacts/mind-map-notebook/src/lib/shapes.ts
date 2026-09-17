import { CanvasObject, ShapeKind } from '../types/canvas';

export const SHAPE_KINDS: { value: ShapeKind; label: string }[] = [
  { value: 'rectangle', label: 'Rectangle' },
  { value: 'ellipse', label: 'Ellipse / Circle' },
  { value: 'diamond', label: 'Diamond' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'star', label: 'Star' },
  { value: 'hexagon', label: 'Hexagon' },
  { value: 'pentagon', label: 'Pentagon' },
  { value: 'octagon', label: 'Octagon' },
  { value: 'parallelogram', label: 'Parallelogram' },
  { value: 'trapezoid', label: 'Trapezoid' },
  { value: 'cross', label: 'Cross' },
  { value: 'arrow-right', label: 'Arrow' },
  { value: 'cloud', label: 'Cloud' },
  { value: 'heart', label: 'Heart' },
  { value: 'speech-bubble', label: 'Speech bubble' },
  { value: 'document', label: 'Document' },
  { value: 'stadium', label: 'Stadium (start/end)' },
  { value: 'rounded-rectangle', label: 'Rounded rectangle' },
  { value: 'input-output', label: 'Input / Output' },
  { value: 'cylinder', label: 'Cylinder / Database' },
  { value: 'cone', label: 'Cone' },
  { value: 'callout', label: 'Callout' },
  { value: 'square', label: 'Square' },
  { value: 'frame', label: 'Frame / Container' },
  { value: 'ui-button', label: 'UI: Button' },
  { value: 'ui-toggle', label: 'UI: Toggle' },
  { value: 'ui-checkbox', label: 'UI: Checkbox' },
  { value: 'ui-progress', label: 'UI: Progress bar' },
  { value: 'ui-divider', label: 'UI: Divider' },
  { value: 'ui-chip', label: 'UI: Chip / Badge' },
  { value: 'ui-avatar', label: 'UI: Avatar' },
  { value: 'ui-radio', label: 'UI: Radio button' },
  { value: 'ui-slider', label: 'UI: Slider' },
  { value: 'ui-tabs', label: 'UI: Tabs' },
  { value: 'ui-card', label: 'UI: Card' },
  { value: 'cube', label: 'Cube' },
  { value: 'box-3d', label: '3D box' },
  { value: 'icon-node', label: 'Icon / emoji node' },
  { value: 'topic-card', label: 'Topic card' },
];
// Shape kinds rendered with a custom SVG/DOM composition instead of a plain clip-path fill —
// they need internal detail (a knob, a track, a fill bar) that a single clip-path can't express.
export const CUSTOM_RENDER_SHAPES = new Set<ShapeKind>(['frame', 'ui-toggle', 'ui-checkbox', 'ui-progress', 'ui-divider', 'ui-chip', 'ui-avatar', 'ui-radio', 'ui-slider', 'ui-tabs', 'ui-card', 'cube', 'box-3d', 'icon-node', 'topic-card']);
// Shapes whose width/height should stay locked 1:1 while resizing via the Inspector's number fields.
export const ASPECT_LOCKED_SHAPES = new Set<ShapeKind>(['square']);
// Shape kinds the app treats as containers for parent-child grouping: an object dropped/added
// inside one of these has its `containerId` set. Only 'frame' qualifies today — it's the one
// shape kind that's transparent, dashed-border, and explicitly labeled "Frame / Container" in
// the shape picker, i.e. already used as a grouping box rather than a filled/solid piece of
// content. Other shapes (rectangles, UI cards, etc.) stay plain content and are never containers,
// even if something visually overlaps them.
export const CONTAINER_SHAPE_KINDS = new Set<ShapeKind>(['frame']);
export function isContainerShapeKind(kind?: ShapeKind): boolean {
  return !!kind && CONTAINER_SHAPE_KINDS.has(kind);
}

export function shapeClipPath(kind?: ShapeKind): string | undefined {
  switch (kind) {
    case 'ellipse': return 'ellipse(50% 50% at 50% 50%)';
    case 'diamond': return 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)';
    case 'triangle': return 'polygon(50% 0%, 100% 100%, 0% 100%)';
    case 'star': return 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)';
    case 'hexagon': return 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)';
    case 'pentagon': return 'polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)';
    case 'octagon': return 'polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)';
    case 'parallelogram': return 'polygon(18% 0%, 100% 0%, 82% 100%, 0% 100%)';
    case 'trapezoid': return 'polygon(22% 0%, 78% 0%, 100% 100%, 0% 100%)';
    case 'cross': return 'polygon(35% 0%, 65% 0%, 65% 35%, 100% 35%, 100% 65%, 65% 65%, 65% 100%, 35% 100%, 35% 65%, 0% 65%, 0% 35%, 35% 35%)';
    case 'arrow-right': return 'polygon(0% 22%, 60% 22%, 60% 0%, 100% 50%, 60% 100%, 60% 78%, 0% 78%)';
    case 'cloud': return 'polygon(20% 75%, 8% 68%, 8% 50%, 20% 40%, 22% 24%, 38% 12%, 56% 16%, 66% 8%, 82% 14%, 90% 30%, 100% 40%, 96% 58%, 100% 72%, 88% 84%, 70% 86%, 55% 92%, 38% 90%, 24% 88%)';
    case 'heart': return 'polygon(50% 88%, 12% 55%, 0% 32%, 8% 8%, 28% 0%, 50% 18%, 72% 0%, 92% 8%, 100% 32%, 88% 55%)';
    case 'speech-bubble': return 'polygon(0% 0%, 100% 0%, 100% 72%, 32% 72%, 20% 96%, 20% 72%, 0% 72%)';
    case 'document': return 'polygon(0% 0%, 76% 0%, 100% 26%, 100% 100%, 0% 100%)';
    case 'stadium': return 'inset(0 round 999px)';
    case 'rounded-rectangle': return 'inset(0 round 22%)';
    case 'input-output': return 'polygon(14% 0%, 100% 0%, 86% 100%, 0% 100%)';
    case 'cylinder': return 'polygon(0% 12%, 15% 4%, 35% 0%, 65% 0%, 85% 4%, 100% 12%, 100% 88%, 85% 96%, 65% 100%, 35% 100%, 15% 96%, 0% 88%)';
    case 'cone': return 'polygon(50% 0%, 85% 85%, 78% 92%, 65% 97%, 50% 100%, 35% 97%, 22% 92%, 15% 85%)';
    case 'callout': return 'polygon(0% 0%, 100% 0%, 100% 78%, 42% 78%, 30% 100%, 26% 78%, 0% 78%)';
    default: return undefined; // rectangle keeps the default rounded div, no clip-path
  }
}

// Small preview swatch used in the shape pickers. Shapes with a plain clip-path silhouette get
// that exact silhouette (same as they'll look on the canvas). Shapes with internal structure —
// a switch knob, a progress fill, a frame border — get a miniature version of that same
// structure instead of a blank square, so every entry in the picker actually looks like what
// it will produce.
export function defaultShapeContent(kind: ShapeKind): string {
  switch (kind) {
    case 'frame': return 'Frame';
    case 'ui-button': return 'Button';
    case 'ui-toggle': return 'on';
    case 'ui-checkbox': return 'on';
    case 'ui-progress': return '60';
    case 'ui-chip': return 'Badge';
    case 'ui-avatar': return 'AB';
    case 'ui-divider': return '';
    case 'ui-radio': return 'on';
    case 'ui-slider': return '40';
    case 'ui-tabs': return 'Overview|Details|Settings';
    case 'ui-card': return 'Card title|Supporting detail goes here';
    case 'cube': return '';
    case 'box-3d': return '';
    case 'icon-node': return '💡';
    case 'topic-card': return 'Topic';
    default: return 'New idea';
  }
}
export function shapeInsertSizeOverride(kind: ShapeKind): Partial<CanvasObject> {
  if (kind === 'square') return { width: 140, height: 140 };
  if (kind === 'ui-divider') return { width: 220, height: 20 };
  if (kind === 'ui-toggle' || kind === 'ui-checkbox') return { width: 160, height: 44 };
  if (kind === 'ui-progress') return { width: 220, height: 46 };
  if (kind === 'ui-avatar') return { width: 72, height: 72 };
  if (kind === 'ui-chip') return { width: 120, height: 40 };
  if (kind === 'frame') return { width: 420, height: 300 };
  if (kind === 'ui-radio') return { width: 140, height: 40 };
  if (kind === 'ui-slider') return { width: 200, height: 40 };
  if (kind === 'ui-tabs') return { width: 260, height: 40 };
  if (kind === 'ui-card') return { width: 240, height: 130 };
  if (kind === 'cube') return { width: 140, height: 140 };
  if (kind === 'box-3d') return { width: 200, height: 120 };
  if (kind === 'icon-node') return { width: 90, height: 90 };
  if (kind === 'topic-card') return { width: 220, height: 90 };
  return {};
}
