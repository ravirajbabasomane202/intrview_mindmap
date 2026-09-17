export type ObjectType = 'text' | 'formula' | 'image' | 'table' | 'shape' | 'checklist' | 'code' | 'chart' | 'flashcard';
export type ShapeKind = 'rectangle' | 'ellipse' | 'diamond' | 'triangle' | 'star' | 'hexagon' | 'pentagon' | 'arrow-right' | 'parallelogram' | 'cloud'
  | 'octagon' | 'cross' | 'trapezoid' | 'speech-bubble' | 'heart' | 'document' | 'stadium'
  | 'rounded-rectangle' | 'cylinder' | 'cone' | 'callout' | 'input-output'
  | 'square' | 'frame'
  | 'ui-button' | 'ui-toggle' | 'ui-checkbox' | 'ui-progress' | 'ui-divider' | 'ui-chip' | 'ui-avatar'
  | 'cube' | 'box-3d'
  | 'ui-radio' | 'ui-slider' | 'ui-tabs' | 'ui-card'
  | 'icon-node' | 'topic-card';
export type ChartKind = 'bar' | 'line' | 'pie' | 'donut' | 'area' | 'scatter' | 'histogram' | 'radar' | 'progress' | 'gauge';
export type ChartPoint = { id: string; label: string; value: number };
export type Tool = 'select' | 'pan' | 'draw' | 'line' | 'arrow' | 'eraser' | 'connect' | 'highlight';
export type Point = { x: number; y: number };
export type Stroke = { id: string; points: Point[]; color?: string; width?: number; kind?: 'free' | 'line' | 'arrow' | 'rectangle' | 'circle' | 'ellipse' | 'triangle' | 'highlight'; dasharray?: string; bothEnds?: boolean; textureKind?: 'pen' | 'pencil' | 'brush' | 'highlight' };
export type ChecklistItem = { id: string; text: string; done: boolean };
export type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
export type Connection = {
  id: string;
  from: string;
  to: string;
  curved?: boolean;
  label?: string;
  // Where the label sits relative to the connector, so it can be pulled off the line (e.g. when
  // the line would otherwise run straight through the text). Both are relative to the connector,
  // not absolute canvas coordinates, so the label rides along automatically when either endpoint
  // object moves, resizes, or the line is dragged — nothing needs to re-sync it.
  labelPositionAlongLine?: number; // 0 (start) .. 1 (end) along the connector path; defaults to 0.5
  labelPerpendicularOffset?: number; // canvas units, perpendicular to the line at that point; defaults to 0 (on the line)
  arrowhead?: 'none' | 'arrow' | 'circle' | 'diamond' | 'both';
  type?: 'default' | 'depends' | 'relates' | 'contains' | 'references';
  strokeWidth?: number;
  strokeColor?: string;
  strokeDasharray?: string;
};
export type CellAlign = 'left' | 'center' | 'right';
export type CellStyle = { bold?: boolean; italic?: boolean; align?: CellAlign };
export type CanvasObject = {
  id: string;
  type: ObjectType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  content: string;
  color: string;
  fill: string;
  // Font size (in px) for this object's rendered text. Optional so existing objects keep their
  // previous look until the person explicitly changes it; falls back to DEFAULT_FONT_SIZE (see
  // lib/text-style.ts) everywhere text is painted, both on canvas and in export.ts, so the two
  // always agree.
  fontSize?: number;
  imageAlt?: string;
  imageCaption?: string;
  cropX?: number;
  cropY?: number;
  cropZoom?: number;
  tableHasHeader?: boolean;
  tableCellStyles?: Record<string, CellStyle>;
  tableMerges?: Record<string, number>; // key "row-col" of top-left merged cell -> number of columns it spans
  tableStyle?: 'default' | 'matrix'; // 'matrix' also styles the first column like a header, for row/column matrix tables
  shapeKind?: ShapeKind;
  checklistItems?: ChecklistItem[];
  codeLanguage?: string;
  chartKind?: ChartKind;
  chartData?: ChartPoint[];
  locked?: boolean;
  collapsed?: boolean; // mind-map expand/collapse: when true, descendants reachable via connections are hidden
  flipped?: boolean; // flashcard: whether the back face is currently shown
  // Container / parent-child grouping (see lib/shapes.ts's CONTAINER_SHAPE_KINDS for which shape
  // kinds count as containers). Set when this object's bounds fall inside a container at drop/add
  // time, or via explicit re-parenting on drag-release — never re-derived from bounds during a
  // container's own move/resize, so moving or resizing a container doesn't detach its children.
  containerId?: string;
  // Page-to-page navigation: clicking this object (via its link affordance) switches the current
  // page to `pageId` and, if `objectId` is set, selects/centers that object on arrival.
  link?: { pageId: string; objectId?: string };
  // Line-attached component: generalizes Connection.label (a plain string) into a real component
  // riding a connector. When parentConnectorId is set, this object's rendered position is derived
  // live from the connector's current endpoints + positionAlongLine/perpendicularOffset (see
  // getAttachedObjectPosition in lib/connections.tsx) rather than from x/y — exactly the same
  // mechanism the connector label already used, just generalized to any CanvasObject so it keeps
  // its normal rendering/editing/selection/resize/style. x/y are not kept in sync while attached
  // (nothing reads them for placement in that state); they're only meaningful again once the
  // object is detached (see detachObjectsFromConnector in NoteEditor.tsx).
  parentConnectorId?: string;
  positionAlongLine?: number; // 0 (start) .. 1 (end) along the connector; defaults to 0.5
  perpendicularOffset?: number; // canvas units, perpendicular to the line at that point; defaults to 0 (on the line)
};
export type Section = {
  id: string;
  title: string;
  pages: Page[];
};
export type Page = {
  id: string;
  title: string;
  objects: CanvasObject[];
  strokes?: Stroke[];
  connections?: Connection[];
  sectionId?: string;
};
export type Note = {
  id: string;
  title: string;
  template: string;
  createdAt: string;
  updatedAt: string;
  favorite: boolean;
  archived: boolean;
  inTrash: boolean;
  tags: string[];
  folderId?: string;
  pages: Page[];
  sections: Section[];
  objects?: CanvasObject[]; // Legacy compatibility
  strokes?: Stroke[]; // Legacy compatibility
  connections?: Connection[]; // Legacy compatibility
};
export type Folder = {
  id: string;
  name: string;
  parentFolderId?: string | null;
  createdAt: string;
  updatedAt: string;
};