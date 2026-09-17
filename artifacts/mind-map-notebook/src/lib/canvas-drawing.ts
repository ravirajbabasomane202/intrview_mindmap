import { uid } from './uid';
import { Point, Stroke } from '../types/canvas';

export function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

// Mind-map expand/collapse: a collapsed node hides every object reachable from it by following
// outgoing connections (its children, grandchildren, ...), along with those connections. This
// only touches what's rendered — the underlying objects/connections are untouched, so expanding
// again brings everything straight back.
export function detectDrawnShape(points: Point[]): { kind: Stroke['kind']; points: Point[] } {
  if (points.length < 2) return { kind: 'free', points };
  const first = points[0];
  const last = points[points.length - 1];
  const pathLength = points.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - points[index].x, point.y - points[index].y), 0);
  const directDistance = Math.hypot(last.x - first.x, last.y - first.y);
  const bounds = points.reduce((box, point) => ({
    minX: Math.min(box.minX, point.x), minY: Math.min(box.minY, point.y),
    maxX: Math.max(box.maxX, point.x), maxY: Math.max(box.maxY, point.y),
  }), { minX: first.x, minY: first.y, maxX: first.x, maxY: first.y });
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  const closed = directDistance < Math.max(18, pathLength * .18) && points.length > 8;

  if (!closed) {
    if (pathLength > 0 && directDistance / pathLength > .96) return { kind: 'line', points: [first, last] };
    return { kind: 'free', points };
  }

  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  const rx = width / 2;
  const ry = height / 2;
  const aspect = width / height;
  const radiusErrors = points.map((point) => {
    const nx = (point.x - cx) / rx;
    const ny = (point.y - cy) / ry;
    return Math.abs(Math.hypot(nx, ny) - 1);
  });
  const meanRadiusError = radiusErrors.reduce((sum, value) => sum + value, 0) / radiusErrors.length;

  // Corner detection for triangle/rectangle via turning angles
  const simplified: Point[] = [points[0]];
  for (const point of points) {
    const prev = simplified[simplified.length - 1];
    if (Math.hypot(point.x - prev.x, point.y - prev.y) > Math.max(12, Math.min(width, height) * 0.08)) simplified.push(point);
  }
  if (Math.hypot(simplified[0].x - simplified[simplified.length - 1].x, simplified[0].y - simplified[simplified.length - 1].y) < 16) simplified.pop();
  const corners: Point[] = [];
  for (let i = 0; i < simplified.length; i++) {
    const prev = simplified[(i - 1 + simplified.length) % simplified.length];
    const curr = simplified[i];
    const next = simplified[(i + 1) % simplified.length];
    const a = Math.atan2(curr.y - prev.y, curr.x - prev.x);
    const b = Math.atan2(next.y - curr.y, next.x - curr.x);
    let turn = Math.abs(b - a);
    if (turn > Math.PI) turn = 2 * Math.PI - turn;
    if (turn > 0.55 && turn < 2.6) corners.push(curr);
  }

  if (meanRadiusError < 0.18 && aspect > 0.78 && aspect < 1.28) {
    return { kind: 'circle', points: [{ x: cx, y: cy }, { x: Math.max(rx, ry), y: 0 }] };
  }
  if (meanRadiusError < 0.22) {
    return { kind: 'ellipse', points: [{ x: bounds.minX, y: bounds.minY }, { x: bounds.maxX, y: bounds.maxY }] };
  }
  // Rectangle: needs ~4 corners with turns close to a right angle (90°, i.e. ~1.57 rad).
  if (corners.length === 4) {
    const rightAngleish = corners.every((_, i) => {
      const prev = corners[(i - 1 + corners.length) % corners.length];
      const curr = corners[i];
      const next = corners[(i + 1) % corners.length];
      const a = Math.atan2(curr.y - prev.y, curr.x - prev.x);
      const b = Math.atan2(next.y - curr.y, next.x - curr.x);
      let turn = Math.abs(b - a);
      if (turn > Math.PI) turn = 2 * Math.PI - turn;
      return turn > 1.05 && turn < 2.35; // roughly 60°-135°, permissive around 90°
    });
    if (rightAngleish) return { kind: 'rectangle', points: [{ x: bounds.minX, y: bounds.minY }, { x: bounds.maxX, y: bounds.maxY }] };
  }
  // Triangle: allow a little noise in corner detection (2 or 3 detected corners still reads as a triangle).
  if (corners.length === 3) {
    return { kind: 'triangle', points: corners };
  }
  if (corners.length === 2) {
    // One corner was missed to noise - reconstruct it as the path point farthest from
    // the line through the two corners we did detect.
    const [p1, p2] = corners;
    const lineLen = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
    let third = points[0];
    let maxDist = -Infinity;
    for (const point of points) {
      const dist = Math.abs((p2.x - p1.x) * (p1.y - point.y) - (p1.x - point.x) * (p2.y - p1.y)) / lineLen;
      if (dist > maxDist) { maxDist = dist; third = point; }
    }
    return { kind: 'triangle', points: [p1, p2, third] };
  }
  // Anything else (pentagons, stars, messy scribbles, an odd corner count, etc.) keeps its
  // original hand-drawn path instead of being silently boxed into a rectangle.
  return { kind: 'free', points };
}

export function eraseStrokeAtPoint(stroke: Stroke, point: Point, radius: number): Stroke[] {
  if (stroke.kind && stroke.kind !== 'free' && stroke.kind !== 'highlight') {
    const hitsShape = stroke.points.some((strokePoint, index) => {
      if (stroke.kind === 'circle' && index === 0) return Math.hypot(strokePoint.x - point.x, strokePoint.y - point.y) <= (stroke.points[1]?.x ?? 0) + radius;
      if (stroke.kind === 'rectangle' || stroke.kind === 'ellipse') {
        const [a, b] = stroke.points;
        if (!a || !b) return false;
        const minX = Math.min(a.x, b.x) - radius, maxX = Math.max(a.x, b.x) + radius;
        const minY = Math.min(a.y, b.y) - radius, maxY = Math.max(a.y, b.y) + radius;
        return point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY;
      }
      if (stroke.kind === 'triangle') return stroke.points.some((p) => Math.hypot(p.x - point.x, p.y - point.y) <= radius * 1.5);
      if (stroke.kind === 'line' || stroke.kind === 'arrow') {
        for (let i = 1; i < stroke.points.length; i++) {
          const a = stroke.points[i - 1], b = stroke.points[i];
          const t = Math.max(0, Math.min(1, ((point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y)) / (Math.hypot(b.x - a.x, b.y - a.y) ** 2 || 1)));
          const proj = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
          if (Math.hypot(proj.x - point.x, proj.y - point.y) <= radius) return true;
        }
      }
      return false;
    });
    return hitsShape ? [] : [stroke];
  }

  const keepFlags = stroke.points.map((strokePoint) => Math.hypot(strokePoint.x - point.x, strokePoint.y - point.y) > radius);
  const segments: Point[][] = [];
  let current: Point[] = [];
  stroke.points.forEach((strokePoint, index) => {
    if (keepFlags[index]) current.push(strokePoint);
    else if (current.length) { segments.push(current); current = []; }
  });
  if (current.length) segments.push(current);
  return segments
    .filter((segment) => segment.length > 1)
    .map((segment) => ({ ...stroke, id: uid('stroke'), points: segment, kind: 'free' as const }));
}

export function snapValue(value: number, grid = 20) {
  return Math.round(value / grid) * grid;
}
