import { CanvasObject, Connection, Point } from '../types/canvas';

export function getCollapsedHiddenIds(objects: CanvasObject[], connections: Connection[]): Set<string> {
  const childrenMap = new Map<string, string[]>();
  connections.forEach((connection) => {
    const list = childrenMap.get(connection.from) ?? [];
    list.push(connection.to);
    childrenMap.set(connection.from, list);
  });
  const hidden = new Set<string>();
  const queue: string[] = [];
  objects.forEach((object) => { if (object.collapsed) queue.push(...(childrenMap.get(object.id) ?? [])); });
  while (queue.length) {
    const id = queue.shift() as string;
    if (hidden.has(id)) continue;
    hidden.add(id);
    queue.push(...(childrenMap.get(id) ?? []));
  }
  return hidden;
}

export function getObjectCenter(object: CanvasObject): Point {
  return { x: object.x + object.width / 2, y: object.y + object.height / 2 };
}

export function getRectEdgePoint(object: CanvasObject, towardX: number, towardY: number): Point {
  const center = getObjectCenter(object);
  const dx = towardX - center.x;
  const dy = towardY - center.y;
  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return center;
  const hw = object.width / 2;
  const hh = object.height / 2;
  const scale = Math.min(Math.abs(hw / dx), Math.abs(hh / dy));
  return { x: center.x + dx * scale, y: center.y + dy * scale };
}

export function getConnectionAnchors(from: CanvasObject, to: CanvasObject) {
  const fromCenter = getObjectCenter(from);
  const toCenter = getObjectCenter(to);
  return {
    start: getRectEdgePoint(from, toCenter.x, toCenter.y),
    end: getRectEdgePoint(to, fromCenter.x, fromCenter.y),
  };
}

export function getConnectionPath(connection: Connection, from: CanvasObject, to: CanvasObject) {
  const { start, end } = getConnectionAnchors(from, to);
  const x1 = start.x;
  const y1 = start.y;
  const x2 = end.x;
  const y2 = end.y;

  if (connection.curved) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const distance = Math.sqrt(dx * dx + dy * dy) || 1;
    const offset = Math.min(distance * 0.3, 100);
    const cx = x1 + dx / 2 - dy / distance * offset;
    const cy = y1 + dy / 2 + dx / distance * offset;
    return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
  }
  return `M ${x1} ${y1} L ${x2} ${y2}`;
}

export function getArrowheadPath(connection: Connection, from: CanvasObject, to: CanvasObject, reverse = false) {
  const { start, end } = getConnectionAnchors(from, to);
  let endX = end.x, endY = end.y, startX = start.x, startY = start.y;
  if (reverse) {
    endX = start.x; endY = start.y;
    startX = end.x; startY = end.y;
  }

  let angle: number;
  if (connection.curved) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const distance = Math.sqrt(dx * dx + dy * dy) || 1;
    const offset = Math.min(distance * 0.3, 100);
    const cx = start.x + dx / 2 - dy / distance * offset;
    const cy = start.y + dy / 2 + dx / distance * offset;
    angle = reverse
      ? Math.atan2(startY - cy, startX - cx)
      : Math.atan2(endY - cy, endX - cx);
  } else {
    angle = Math.atan2(endY - startY, endX - startX);
  }

  const size = 10;
  const arrowType = connection.arrowhead ?? 'arrow';
  if (arrowType === 'none') return null;
  const fill = connection.strokeColor ?? 'hsl(var(--primary) / .75)';

  if (arrowType === 'circle') {
    return <circle key={`${connection.id}-circle-${reverse ? 'start' : 'end'}`} cx={endX} cy={endY} r={5} fill={fill} />;
  }

  const points: string[] = [];
  if (arrowType === 'arrow' || arrowType === 'both') {
    points.push(
      `${endX},${endY}`,
      `${endX - size * Math.cos(angle - 0.5)},${endY - size * Math.sin(angle - 0.5)}`,
      `${endX - size * Math.cos(angle + 0.5)},${endY - size * Math.sin(angle + 0.5)}`
    );
  } else if (arrowType === 'diamond') {
    const tipX = endX;
    const tipY = endY;
    const midX = endX - size * Math.cos(angle);
    const midY = endY - size * Math.sin(angle);
    points.push(
      `${tipX},${tipY}`,
      `${midX - size * 0.55 * Math.cos(angle + Math.PI / 2)},${midY - size * 0.55 * Math.sin(angle + Math.PI / 2)}`,
      `${endX - size * 1.2 * Math.cos(angle)},${endY - size * 1.2 * Math.sin(angle)}`,
      `${midX - size * 0.55 * Math.cos(angle - Math.PI / 2)},${midY - size * 0.55 * Math.sin(angle - Math.PI / 2)}`
    );
  }

  return <polygon key={`${connection.id}-arrow-${reverse ? 'start' : 'end'}`} points={points.join(' ')} fill={fill} />;
}

// Shared by the connector's own text label (labelPositionAlongLine/labelPerpendicularOffset) and
// any line-attached CanvasObject (positionAlongLine/perpendicularOffset) — both are "a point t of
// the way along this connector, offset `perpendicular` units off to the side", so this is the one
// place that math lives. t is clamped to [0, 1]; perpendicular is unbounded (that's what lets a
// label/component be pulled off the line entirely).
export function getPointOnConnection(connection: Connection, from: CanvasObject, to: CanvasObject, t: number, perpendicular: number) {
  const { start, end } = getConnectionAnchors(from, to);
  const x1 = start.x;
  const y1 = start.y;
  const x2 = end.x;
  const y2 = end.y;
  t = Math.min(1, Math.max(0, t));

  let x: number, y: number, tangentX: number, tangentY: number;
  if (connection.curved) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const distance = Math.sqrt(dx * dx + dy * dy) || 1;
    const offset = Math.min(distance * 0.3, 100);
    const cx = x1 + dx / 2 - dy / distance * offset;
    const cy = y1 + dy / 2 + dx / distance * offset;
    x = (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * cx + t * t * x2;
    y = (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * cy + t * t * y2;
    // Derivative of the quadratic bezier at t, used below as the line's local direction so the
    // perpendicular offset stays perpendicular even as the label slides along a curve.
    tangentX = 2 * (1 - t) * (cx - x1) + 2 * t * (x2 - cx);
    tangentY = 2 * (1 - t) * (cy - y1) + 2 * t * (y2 - cy);
  } else {
    x = x1 + (x2 - x1) * t;
    y = y1 + (y2 - y1) * t;
    tangentX = x2 - x1;
    tangentY = y2 - y1;
  }

  if (perpendicular !== 0) {
    const tangentLength = Math.sqrt(tangentX * tangentX + tangentY * tangentY) || 1;
    // Rotate the tangent 90° to get the perpendicular direction, then move the label that far
    // off the line — this is what lets the label dodge the line instead of sitting on top of it.
    const normalX = -tangentY / tangentLength;
    const normalY = tangentX / tangentLength;
    x += normalX * perpendicular;
    y += normalY * perpendicular;
  }

  return { x, y };
}

export function getLabelPosition(connection: Connection, from: CanvasObject, to: CanvasObject) {
  return getPointOnConnection(connection, from, to, connection.labelPositionAlongLine ?? 0.5, connection.labelPerpendicularOffset ?? 0);
}

// Same idea as getLabelPosition, but for a line-attached CanvasObject (section 2/4 of the brief)
// instead of the connector's own text label. Returns the object's center point on/off the line —
// callers subtract width/2, height/2 to get a top-left for CSS positioning.
export function getAttachedObjectPosition(object: CanvasObject, connection: Connection, from: CanvasObject, to: CanvasObject) {
  return getPointOnConnection(connection, from, to, object.positionAlongLine ?? 0.5, object.perpendicularOffset ?? 0);
}

// Frame for projecting pointer-drag deltas onto a connector's local direction, shared by dragging
// the connector's own label and dragging a line-attached object (see startLabelDrag/startObjectDrag
// in NoteEditor.tsx). Approximates the frame from the straight line between anchor points even for
// curved connectors (matches the existing label-drag behavior this generalizes).
export function getConnectionDragFrame(from: CanvasObject, to: CanvasObject) {
  const { start, end } = getConnectionAnchors(from, to);
  const tangentX = end.x - start.x;
  const tangentY = end.y - start.y;
  const tangentLength = Math.sqrt(tangentX * tangentX + tangentY * tangentY) || 1;
  return { tangentX, tangentY, tangentLength, normalX: -tangentY / tangentLength, normalY: tangentX / tangentLength };
}
