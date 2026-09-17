import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BarChart3, Check, ChevronDown, ChevronLeft, ChevronRight, Code2, CornerUpLeft, Download, Eraser, FileImage, FileText, Focus, Grid2X2, Grid3X3, Hand, Highlighter, ImageIcon, Link2, ListChecks, Lock, Maximize2, Minus, MousePointer2, PanelRight, Pencil, Plus, Redo2, Shapes, Sigma, Sparkles, Table2, Trash2, Undo2, X, ZoomIn } from 'lucide-react';
import { Link, useLocation, useParams } from 'wouter';
import { AuthControls } from '../AuthControls';
import { Inspector } from './Inspector';
import { LinkPreviewPopup } from './LinkPreviewPopup';
import { IconButton } from '../IconButton';
import { Logo } from '../Logo';
import { CanvasObjectContent } from '../objects/CanvasObjectContent';
import { ShapePreviewSwatch } from '../objects/ShapePreviewSwatch';
import { TemplatePreviewSwatch } from '../objects/TemplatePreviewSwatch';
import { ToolButton } from '../ToolButton';
import { detectDrawnShape, eraseStrokeAtPoint, snapValue } from '../../lib/canvas-drawing';
import { getArrowheadPath, getAttachedObjectPosition, getCollapsedHiddenIds, getConnectionDragFrame, getConnectionPath, getLabelPosition, getObjectCenter, getRectEdgePoint } from '../../lib/connections';
import { exportNoteAsPng } from '../../lib/export';
import { compressImage } from '../../lib/image';
import { SHAPE_KINDS, defaultShapeContent, isContainerShapeKind, shapeClipPath, shapeInsertSizeOverride } from '../../lib/shapes';
import { colors, readNotes } from '../../lib/storage';
import { uid } from '../../lib/uid';
import { formatZoomLabel } from '../../lib/zoom';
import { useCanvasPanZoom } from '../../hooks/useCanvasPanZoom';
import { useHistory } from '../../hooks/useHistory';
import { useNotebook } from '../../store/notebook-store';
import { CanvasObject, Connection, Note, ObjectType, Page, Point, ResizeHandle, Section, ShapeKind, Stroke, Tool } from '../../types/canvas';

// Default size/content per object type. Module-level (not recreated per render) so both addObject
// and the placement-mode preview (which needs to know a pending object's size before it exists)
// can read the same values.
const OBJECT_DEFAULTS: Record<ObjectType, Partial<CanvasObject>> = {
  text: { width: 220, height: 110, content: 'A thought worth keeping', fill: 'hsl(var(--note-fill))', color: 'hsl(var(--note-ink))' },
  formula: { width: 290, height: 82, content: 'x + y = a useful question', fill: 'hsl(var(--formula-fill))', color: 'hsl(var(--formula-ink))' },
  image: { width: 280, height: 190, content: '', fill: 'hsl(var(--paper-fill))', color: 'hsl(var(--paper-ink))', imageAlt: '', imageCaption: '', cropX: 0, cropY: 0, cropZoom: 1 },
  table: { width: 300, height: 150, content: 'Question\tAnswer\nWhat matters?\tMake it visible', fill: 'hsl(var(--paper-fill))', color: 'hsl(var(--paper-ink))', tableHasHeader: true, tableCellStyles: {}, tableMerges: {} },
  shape: { width: 260, height: 100, content: 'New idea', fill: 'hsl(var(--shape-fill))', color: 'hsl(var(--shape-ink))', shapeKind: 'rectangle' },
  checklist: { width: 240, height: 170, content: '', fill: 'hsl(var(--paper-fill))', color: 'hsl(var(--paper-ink))' },
  code: { width: 300, height: 170, content: '// write some code\nfunction hello() {\n  return "hi";\n}', fill: 'hsl(var(--code-fill))', color: 'hsl(var(--code-ink))', codeLanguage: 'javascript' },
  chart: { width: 320, height: 220, content: 'Chart', fill: 'hsl(var(--paper-fill))', color: 'hsl(var(--paper-ink))', chartKind: 'bar' },
  flashcard: { width: 240, height: 150, content: 'What is this?|||The answer', fill: 'hsl(var(--flashcard-fill))', color: 'hsl(var(--flashcard-ink))', flipped: false },
};
// checklistItems/chartData need fresh ids per object, so they can't live in the static
// OBJECT_DEFAULTS table above — this generates them at creation time instead.
function freshObjectExtras(type: ObjectType): Partial<CanvasObject> {
  if (type === 'checklist') return { checklistItems: [{ id: uid('item'), text: 'First step', done: false }, { id: uid('item'), text: 'Second step', done: false }] };
  if (type === 'chart') return { chartData: [{ id: uid('pt'), label: 'A', value: 4 }, { id: uid('pt'), label: 'B', value: 7 }, { id: uid('pt'), label: 'C', value: 5 }] };
  return {};
}

// Bounds-based container detection (section 1): used only at the moment an object is added/dropped
// or a drag is released — never re-derived on every render, so a container's own move/resize can't
// accidentally re-parent its children (the actual parent-child relationship always lives in
// CanvasObject.containerId, set by the callers below). An object qualifies when its full bounds sit
// inside a container's bounds (not just its center point), matching "dropped so its bounds fall
// inside a container's bounds" from the brief; an object larger than every candidate container is
// correctly never assigned one. When candidate containers overlap, the topmost one (highest
// zIndex) wins.
function findContainerForBounds(objects: CanvasObject[], bounds: { x: number; y: number; width: number; height: number }, excludeId?: string): string | undefined {
  const candidates = objects.filter((candidate) => candidate.id !== excludeId && isContainerShapeKind(candidate.shapeKind)
    && bounds.x >= candidate.x && bounds.y >= candidate.y
    && bounds.x + bounds.width <= candidate.x + candidate.width && bounds.y + bounds.height <= candidate.y + candidate.height);
  if (!candidates.length) return undefined;
  return candidates.reduce((top, candidate) => (candidate.zIndex > top.zIndex ? candidate : top)).id;
}

// Where a line-attached object is actually drawn: derived live from its connector's current
// endpoints rather than from object.x/y (see the parentConnectorId comment on CanvasObject). Falls
// back to the object's own x/y for un-attached objects, or if its connector/endpoints have gone
// missing (e.g. mid-delete, before the object is detached). Returns a top-left, ready for CSS.
function resolveObjectRect(object: CanvasObject, connections: Connection[], objects: CanvasObject[]): { x: number; y: number } {
  if (!object.parentConnectorId) return { x: object.x, y: object.y };
  const connection = connections.find((c) => c.id === object.parentConnectorId);
  if (!connection) return { x: object.x, y: object.y };
  const from = objects.find((o) => o.id === connection.from);
  const to = objects.find((o) => o.id === connection.to);
  if (!from || !to) return { x: object.x, y: object.y };
  const center = getAttachedObjectPosition(object, connection, from, to);
  return { x: center.x - object.width / 2, y: center.y - object.height / 2 };
}

// Run just before a connector is removed: any object attached to it gets its current on-canvas
// position (computed the same way resolveObjectRect draws it) frozen into real x/y and its
// attachment fields cleared, so it stays exactly where it visually was instead of jumping to
// whatever stale x/y it had from before it was ever attached.
function detachObjectsFromConnector(objects: CanvasObject[], connections: Connection[], connectionId: string): CanvasObject[] {
  const connection = connections.find((c) => c.id === connectionId);
  const from = connection && objects.find((o) => o.id === connection.from);
  const to = connection && objects.find((o) => o.id === connection.to);
  return objects.map((object) => {
    if (object.parentConnectorId !== connectionId) return object;
    const rect = connection && from && to ? resolveObjectRect(object, connections, objects) : { x: object.x, y: object.y };
    return { ...object, x: rect.x, y: rect.y, parentConnectorId: undefined, positionAlongLine: undefined, perpendicularOffset: undefined };
  });
}

// CSS position + cursor for each resize handle, relative to the object's own box (module-level
// since it's pure and doesn't depend on props/state).
function resizeHandleStyle(handle: ResizeHandle): { style: { top?: number | string; bottom?: number; left?: number | string; right?: number; transform?: string }; cursor: string } {
  const positions: Record<ResizeHandle, { top?: number | string; bottom?: number; left?: number | string; right?: number; transform?: string }> = {
    n: { top: -5, left: '50%', transform: 'translateX(-50%)' },
    s: { bottom: -5, left: '50%', transform: 'translateX(-50%)' },
    e: { right: -5, top: '50%', transform: 'translateY(-50%)' },
    w: { left: -5, top: '50%', transform: 'translateY(-50%)' },
    ne: { top: -5, right: -5 },
    nw: { top: -5, left: -5 },
    se: { bottom: -5, right: -5 },
    sw: { bottom: -5, left: -5 },
  };
  const cursors: Record<ResizeHandle, string> = { n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize' };
  return { style: positions[handle], cursor: cursors[handle] };
}

export function NoteEditor() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { notes, setNotes, syncState } = useNotebook();
  const note = notes.find((item) => item.id === id);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const currentPage = note?.pages?.[currentPageIndex];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { zoom, setZoom, pan, setPan, isSpacePressed, surfaceRef, resetView, zoomAtPoint, handleWheel, canvasPoint } = useCanvasPanZoom();
  const [tool, setTool] = useState<Tool>('select');
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [shapeMenuOpen, setShapeMenuOpen] = useState(false);
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
  const clipboardRef = useRef<CanvasObject[]>([]);
  const [connectStart, setConnectStart] = useState<string | null>(null);
  const [drawPoints, setDrawPoints] = useState<Point[]>([]);
  const [strokeColor, setStrokeColor] = useState('#1f5e60');
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [strokeStyle, setStrokeStyle] = useState('');
  const [drawTexture, setDrawTexture] = useState<'pen' | 'pencil' | 'brush'>('pen');
  const [arrowBothEnds, setArrowBothEnds] = useState(false);
  const [selectedStrokeId, setSelectedStrokeId] = useState<string | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  // Which connector currently has its "+ Attach" popover open (section 2). Separate from the
  // left-toolbar addMenuOpen — this one is anchored to a connector on the canvas, not the sidebar.
  const [attachMenuConnectionId, setAttachMenuConnectionId] = useState<string | null>(null);
  const [showInspector, setShowInspector] = useState(true);
  const [saveState, setSaveState] = useState('All changes saved');
  const [zenMode, setZenMode] = useState(false);
  const [zenHoverLeft, setZenHoverLeft] = useState(false);
  const [zenHoverRight, setZenHoverRight] = useState(false);
  const [zenHoverTop, setZenHoverTop] = useState(false);
  const [sectionsCollapsed, setSectionsCollapsed] = useState(false);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === '.') {
        event.preventDefault();
        setZenMode((value) => !value);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    if (!zenMode) { setZenHoverLeft(false); setZenHoverRight(false); setZenHoverTop(false); }
  }, [zenMode]);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingObjectId, setEditingObjectId] = useState<string | null>(null);
  const [editingPageIndex, setEditingPageIndex] = useState<number | null>(null);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [lastAddedId, setLastAddedId] = useState<string | null>(null);
  const [marquee, setMarquee] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; objectId?: string } | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [gridStyle, setGridStyle] = useState<'dots' | 'squared' | 'none'>('dots');
  const [gridMenuOpen, setGridMenuOpen] = useState(false);
  const [isInteractingWithCanvas, setIsInteractingWithCanvas] = useState(false);
  const [connectPointer, setConnectPointer] = useState<Point | null>(null);
  const [justConnectedId, setJustConnectedId] = useState<string | null>(null);
  useEffect(() => {
    if (!connectStart || tool !== 'connect') setConnectPointer(null);
  }, [connectStart, tool]);
  const { pushHistorySnapshot, undo: historyUndo, redo: historyRedo } = useHistory(notes, setNotes, setSaveState);
  const requestDeleteObjects = useCallback((ids: string[]) => {
    if (!ids.length) return;
    pushHistorySnapshot();
    setDeletingIds((current) => new Set([...current, ...ids]));
    window.setTimeout(() => {
      setNotes((current) => current.map((n) => n.id === id ? { ...n, pages: n.pages.map((p, idx) => {
        if (idx !== currentPageIndex) return p;
        // Deleting a container deletes what it contains too (transitively, in case of nested
        // containers) — the same behavior most diagram/design tools use for a frame's contents,
        // and simpler than the alternative (un-parenting orphaned children left floating at their
        // old canvas position). See requestDeleteObjects in the brief's section 1.
        const toDelete = new Set(ids);
        let grew = true;
        while (grew) {
          grew = false;
          for (const object of p.objects) {
            if (object.containerId && toDelete.has(object.containerId) && !toDelete.has(object.id) && !object.locked) { toDelete.add(object.id); grew = true; }
          }
        }
        return { ...p, objects: p.objects.filter((o) => !toDelete.has(o.id) || o.locked) };
      }), updatedAt: new Date().toISOString() } : n));
      setDeletingIds((current) => { const next = new Set(current); ids.forEach((objectId) => next.delete(objectId)); return next; });
      setSaveState('Saved locally');
    }, 160);
  }, [id, currentPageIndex, setNotes, pushHistorySnapshot]);
  const imageInputRef = useRef<HTMLInputElement>(null);
  // Image attachment reuses the same file-picker flow as a normal image add (see handleImageUpload
  // below); this ref just remembers which connector to attach to once the file comes back, and a
  // second hidden <input> so the attach flow doesn't fight the sidebar's own pending-placement one.
  const attachImageInputRef = useRef<HTMLInputElement>(null);
  const pendingAttachConnectionIdRef = useRef<string | null>(null);
  const dragRef = useRef<{ kind: 'pan' | 'object' | 'draw' | 'marquee' | 'rotate' | 'stroke' | 'resize' | 'label' | 'attached'; pointerX: number; pointerY: number; startX: number; startY: number; objectId?: string; originX?: number; originY?: number; strokePoints?: Point[]; resizeHandle?: ResizeHandle; startWidth?: number; startHeight?: number; connectionId?: string; startT?: number; startPerp?: number; tangentX?: number; tangentY?: number; normalX?: number; normalY?: number; tangentLength?: number; containerChildStarts?: Record<string, { x: number; y: number }> } | null>(null);
  // Placement-mode workflow (section 4): "+ [type]" entries set this instead of creating the
  // object immediately; the object is created on the next canvas click, at that click's point.
  const [pendingPlacement, setPendingPlacement] = useState<{ type: ObjectType; contentOverride?: string; extra?: Partial<CanvasObject> } | null>(null);
  const [placementPreviewPoint, setPlacementPreviewPoint] = useState<Point | null>(null);
  // Page-link "back" navigation (section 2): a single previous location is enough per the brief —
  // not a full history stack.
  const [backLocation, setBackLocation] = useState<{ pageIndex: number; pan: Point; zoom: number } | null>(null);

  useEffect(() => {
    // Recover if navigation beat localStorage/state merge (legacy race).
    if (!id || note) return;
    const fresh = readNotes().find((item) => item.id === id);
    if (fresh) setNotes((current) => current.some((item) => item.id === id) ? current : [fresh, ...current]);
  }, [id, note, setNotes]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.matches('input, textarea')) return;
      const key = event.key.toLowerCase();
      if (key === 'v') setTool('select');
      if (key === 'h') { setTool('pan'); setConnectStart(null); }
      if (key === 'p' || key === 'd') { setTool('draw'); setConnectStart(null); }
      if (key === 'l') setTool('line');
      if (key === 'a') setTool('arrow');
      if (key === 'e') setTool('eraser');
      if (key === 'c') { setTool('connect'); setConnectStart(null); }
      if ((event.key === 'Backspace' || event.key === 'Delete') && (selectedId || selectedIds.length)) {
        const ids = selectedIds.length ? selectedIds : selectedId ? [selectedId] : [];
        requestDeleteObjects(ids.filter((objectId) => !currentPage?.objects.find((o) => o.id === objectId)?.locked));
        setSelectedId(null); setSelectedIds([]); setSaveState('Saved locally');
      }
      if ((event.key === 'Backspace' || event.key === 'Delete') && selectedStrokeId) {
        setNotes((current) => current.map((n) => n.id === id ? { ...n, pages: n.pages.map((p, idx) => idx === currentPageIndex ? { ...p, strokes: (p.strokes ?? []).filter((stroke) => stroke.id !== selectedStrokeId) } : p), updatedAt: new Date().toISOString() } : n));
        setSelectedStrokeId(null); setSaveState('Stroke deleted');
      }
      if ((event.key === 'Backspace' || event.key === 'Delete') && selectedConnectionId) {
        setNotes((current) => current.map((n) => n.id === id ? { ...n, pages: n.pages.map((p, idx) => idx === currentPageIndex ? { ...p, objects: detachObjectsFromConnector(p.objects, p.connections ?? [], selectedConnectionId), connections: (p.connections ?? []).filter((conn) => conn.id !== selectedConnectionId) } : p), updatedAt: new Date().toISOString() } : n));
        setSelectedConnectionId(null); setSaveState('Connection deleted');
      }
      if (event.key === 'Escape') { setSelectedId(null); setSelectedIds([]); setEditingObjectId(null); setSelectedConnectionId(null); setSelectedStrokeId(null); setContextMenu(null); setMarquee(null); setTemplateMenuOpen(false); setPendingPlacement(null); setPlacementPreviewPoint(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id, selectedId, selectedIds, selectedStrokeId, selectedConnectionId, currentPageIndex, requestDeleteObjects, currentPage]);

  const selected = useMemo(() => currentPage?.objects.find((object) => object.id === selectedId), [currentPage, selectedId]);
  const collapsedHiddenIds = useMemo(() => getCollapsedHiddenIds(currentPage?.objects ?? [], currentPage?.connections ?? []), [currentPage?.objects, currentPage?.connections]);
  const selectedStroke = useMemo(() => currentPage?.strokes?.find((stroke) => stroke.id === selectedStrokeId), [currentPage, selectedStrokeId]);
  const selectedConnection = useMemo(() => currentPage?.connections?.find((conn) => conn.id === selectedConnectionId), [currentPage, selectedConnectionId]);
  const mutateNote = useCallback((updater: (current: Note) => Note, recordHistory = true) => {
    if (recordHistory) pushHistorySnapshot();
    setNotes((current) => current.map((item) => item.id === id ? updater(item) : item));
    setSaveState('Saved locally');
  }, [id, setNotes, pushHistorySnapshot]);
  const mutatePage = useCallback((updater: (current: Page) => Page, recordHistory = true) => {
    mutateNote((note) => ({
      ...note,
      pages: note.pages.map((p, idx) => idx === currentPageIndex ? updater(p) : p)
    }), recordHistory);
  }, [currentPageIndex, mutateNote]);
  const createNewPage = (sectionId?: string) => {
    const newPageTitle = `Page ${(note?.pages.length ?? 0) + 1}`;
    const page: Page = { id: uid('page'), title: newPageTitle, objects: [], strokes: [], connections: [], sectionId };
    mutateNote((n) => ({ ...n, pages: [...n.pages, page] }));
    setCurrentPageIndex((note?.pages.length ?? 0));
    if (sectionId) setExpandedSections((current) => new Set(current).add(sectionId));
  };
  const deletePage = (pageIndex: number) => {
    if ((note?.pages.length ?? 0) <= 1) {
      setSaveState('Cannot delete the last page');
      return;
    }
    mutateNote((n) => ({ ...n, pages: n.pages.filter((_, idx) => idx !== pageIndex) }));
    if (currentPageIndex >= (note?.pages.length ?? 1) - 1) setCurrentPageIndex(Math.max(0, (note?.pages.length ?? 1) - 2));
    setSaveState('Page deleted');
  };
  const setPageTitleDraft = (pageIndex: number, newTitle: string) => {
    setNotes((current) => current.map((n) => n.id === id ? { ...n, pages: n.pages.map((p, idx) => idx === pageIndex ? { ...p, title: newTitle } : p) } : n));
  };
  const renamePage = (pageIndex: number, newTitle: string) => {
    setEditingPageIndex(null);
    if (!newTitle.trim()) return;
    mutateNote((n) => ({ ...n, pages: n.pages.map((p, idx) => idx === pageIndex ? { ...p, title: newTitle } : p) }));
    setSaveState('Page renamed');
  };
  const switchToPage = (pageIndex: number) => {
    setCurrentPageIndex(pageIndex);
    setSelectedId(null);
    setSelectedIds([]);
    setEditingObjectId(null);
  };
  // Page-to-page navigation (section 2). Internal state only (currentPageIndex/pan/zoom) — no new
  // browser tabs. Reuses the same pan convention canvasPoint/zoomAtPoint already use (canvas point
  // 0,0 sits at the screen center, offset by pan and scaled by zoom) rather than inventing new pan
  // math, so centering a target object just means panning so its center lands on that origin.
  const followLink = (link: { pageId: string; objectId?: string }) => {
    const targetIndex = note?.pages.findIndex((p) => p.id === link.pageId) ?? -1;
    if (targetIndex < 0) { setSaveState('Linked page not found'); return; }
    setBackLocation({ pageIndex: currentPageIndex, pan, zoom });
    setCurrentPageIndex(targetIndex);
    setEditingObjectId(null);
    setContextMenu(null);
    const targetObject = link.objectId ? note?.pages[targetIndex]?.objects.find((o) => o.id === link.objectId) : undefined;
    if (targetObject) {
      setSelectedId(targetObject.id);
      setSelectedIds([targetObject.id]);
      setZoom(1);
      setPan({ x: -(targetObject.x + targetObject.width / 2), y: -(targetObject.y + targetObject.height / 2) });
    } else {
      setSelectedId(null);
      setSelectedIds([]);
      resetView();
    }
    setSaveState('Followed link');
  };
  // Hover preview for a linked piece's link badge (section 3): shows the destination page/object
  // without navigating. Delayed on both open and close so a person moving the mouse from the badge
  // to the popup itself (to click "Open") doesn't see it flicker shut in transit — see
  // scheduleShowLinkPreview/scheduleHideLinkPreview below, both of which the badge and the popup
  // itself call from their pointer handlers.
  const [linkPreview, setLinkPreview] = useState<{ link: { pageId: string; objectId?: string }; anchorRect: { top: number; left: number; right: number; bottom: number } } | null>(null);
  const linkPreviewShowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const linkPreviewHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleShowLinkPreview = (link: { pageId: string; objectId?: string }, anchor: HTMLElement) => {
    if (linkPreviewHideTimer.current) { clearTimeout(linkPreviewHideTimer.current); linkPreviewHideTimer.current = null; }
    if (linkPreviewShowTimer.current) clearTimeout(linkPreviewShowTimer.current);
    const rect = anchor.getBoundingClientRect();
    const anchorRect = { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom };
    linkPreviewShowTimer.current = setTimeout(() => setLinkPreview({ link, anchorRect }), 260);
  };
  const scheduleHideLinkPreview = () => {
    if (linkPreviewShowTimer.current) { clearTimeout(linkPreviewShowTimer.current); linkPreviewShowTimer.current = null; }
    if (linkPreviewHideTimer.current) clearTimeout(linkPreviewHideTimer.current);
    linkPreviewHideTimer.current = setTimeout(() => setLinkPreview(null), 180);
  };
  const cancelHideLinkPreview = () => {
    if (linkPreviewHideTimer.current) { clearTimeout(linkPreviewHideTimer.current); linkPreviewHideTimer.current = null; }
  };
  useEffect(() => () => {
    if (linkPreviewShowTimer.current) clearTimeout(linkPreviewShowTimer.current);
    if (linkPreviewHideTimer.current) clearTimeout(linkPreviewHideTimer.current);
  }, []);
  const goBack = () => {
    if (!backLocation) return;
    setCurrentPageIndex(backLocation.pageIndex);
    setPan(backLocation.pan);
    setZoom(backLocation.zoom);
    setSelectedId(null);
    setSelectedIds([]);
    setBackLocation(null);
  };
  const createNewSection = () => {
    const sectionId = uid('section');
    const newSectionTitle = `Section ${(note?.sections.length ?? 0) + 1}`;
    mutateNote((n) => ({ ...n, sections: [...(n.sections ?? []), { id: sectionId, title: newSectionTitle, pages: [] }] }));
    setExpandedSections((current) => new Set(current).add(sectionId));
    setSaveState('Section created — assign pages from the section panel');
  };
  const setSectionTitleDraft = (sectionId: string, newTitle: string) => {
    setNotes((current) => current.map((n) => n.id === id ? { ...n, sections: (n.sections ?? []).map((s) => s.id === sectionId ? { ...s, title: newTitle } : s) } : n));
  };
  const renameSection = (sectionId: string, newTitle: string) => {
    setEditingSectionId(null);
    if (!newTitle.trim()) return;
    mutateNote((n) => ({ ...n, sections: (n.sections ?? []).map((s) => s.id === sectionId ? { ...s, title: newTitle } : s) }));
    setSaveState('Section renamed');
  };
  const deleteSection = (sectionId: string) => {
    mutateNote((n) => ({
      ...n,
      sections: (n.sections ?? []).filter((s) => s.id !== sectionId),
      pages: n.pages.map((p) => p.sectionId === sectionId ? { ...p, sectionId: undefined } : p),
    }));
    setSaveState('Section deleted');
  };
  const toggleSection = (sectionId: string) => {
    setExpandedSections((current) => {
      const next = new Set(current);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  };
  const pagesInSection = (sectionId: string) => (note?.pages ?? []).filter((page) => page.sectionId === sectionId);
  const unsectionedPages = () => (note?.pages ?? []).filter((page) => !page.sectionId);
  const movePageToSection = (pageIndex: number, sectionId: string | undefined) => {
    mutateNote((n) => ({
      ...n,
      pages: n.pages.map((p, idx) => idx === pageIndex ? { ...p, sectionId } : p),
    }));
    if (sectionId) setExpandedSections((current) => new Set(current).add(sectionId));
    setSaveState(sectionId ? 'Page moved to section' : 'Page removed from section');
  };
  const undo = () => { if (historyUndo()) setSelectedId(null); };
  const redo = () => { historyRedo(); };
  const updateObject = (objectId: string, patch: Partial<CanvasObject>, recordHistory = true) => mutatePage((page) => {
    const target = page.objects.find((object) => object.id === objectId);
    const nextObjects = page.objects.map((object) => object.id === objectId ? { ...object, ...patch } : object);
    // Container resize (section 1): when a frame's width/height changes — via the Inspector's
    // number fields, the only way to resize today — scale its children proportionally around the
    // frame's own top-left, so their position stays sensible relative to the container instead of
    // spilling outside it or bunching in a corner.
    if (target && isContainerShapeKind(target.shapeKind) && (patch.width !== undefined || patch.height !== undefined)) {
      const nextWidth = patch.width ?? target.width;
      const nextHeight = patch.height ?? target.height;
      const scaleX = target.width ? nextWidth / target.width : 1;
      const scaleY = target.height ? nextHeight / target.height : 1;
      if (scaleX !== 1 || scaleY !== 1) {
        return { ...page, objects: nextObjects.map((object) => {
          if (object.containerId !== objectId) return object;
          const relX = object.x - target.x;
          const relY = object.y - target.y;
          return { ...object, x: target.x + relX * scaleX, y: target.y + relY * scaleY, width: object.width * scaleX, height: object.height * scaleY };
        }) };
      }
    }
    return { ...page, objects: nextObjects };
  }, recordHistory);
  const bringObject = (objectId: string, direction: 'forward' | 'backward' | 'front' | 'back') => {
    mutatePage((page) => {
      const sorted = [...page.objects].sort((a, b) => a.zIndex - b.zIndex);
      const index = sorted.findIndex((object) => object.id === objectId);
      if (index < 0) return page;
      const next = [...sorted];
      const [item] = next.splice(index, 1);
      if (direction === 'forward') next.splice(Math.min(sorted.length - 1, index + 1), 0, item);
      else if (direction === 'backward') next.splice(Math.max(0, index - 1), 0, item);
      else if (direction === 'front') next.push(item);
      else next.unshift(item);
      return { ...page, objects: next.map((object, zIndex) => ({ ...object, zIndex: zIndex + 1 })) };
    });
  };
  // `at`, when given, is a canvas-space point (from the placement-mode workflow, section 4) to
  // center the new object on instead of the default cascading-offset position. Preserves the
  // existing behavior that contentOverride only actually applies to image objects — every other
  // type's content comes from OBJECT_DEFAULTS/freshObjectExtras regardless of what's passed here
  // (unchanged from before this pass, not something introduced by this change).
  const addObject = (type: ObjectType, contentOverride?: string, extra?: Partial<CanvasObject>, at?: Point) => {
    const preset: Partial<CanvasObject> = { ...OBJECT_DEFAULTS[type], ...freshObjectExtras(type) };
    // Previously only 'image' ever honored contentOverride — every other type (shapes included)
    // silently ignored it and kept OBJECT_DEFAULTS' hardcoded content, so e.g. every shape kind
    // got "New idea" regardless of defaultShapeContent(kind). Applying it generically whenever a
    // caller actually passes one fixes that without changing behavior for callers that don't.
    if (contentOverride !== undefined) preset.content = contentOverride;
    const objectCount = currentPage?.objects.length ?? 0;
    const width = (extra?.width ?? preset.width ?? 0) as number;
    const height = (extra?.height ?? preset.height ?? 0) as number;
    const object: CanvasObject = {
      id: uid(type), type,
      x: at ? at.x - width / 2 : -Number(preset.width) / 2 + objectCount * 22,
      y: at ? at.y - height / 2 : -40 + objectCount * 22,
      rotation: type === 'text' ? -2 : 0, zIndex: objectCount + 1, ...preset, ...extra,
    } as CanvasObject;
    const containerId = findContainerForBounds(currentPage?.objects ?? [], object);
    if (containerId) object.containerId = containerId;
    mutatePage((page) => ({ ...page, objects: [...page.objects, object] }));
    setSelectedId(object.id); setSelectedIds([object.id]); setEditingObjectId(type === 'checklist' || type === 'code' || type === 'chart' || type === 'flashcard' ? null : object.id); setAddMenuOpen(false); setShapeMenuOpen(false); setTool('select');
    setLastAddedId(object.id);
    window.setTimeout(() => setLastAddedId((id) => (id === object.id ? null : id)), 220);
  };
  // Placement-mode entry point (section 4): "+ [type]" buttons call this instead of addObject
  // directly, so the object isn't created until the next canvas click. Behaves like another mode
  // in the same dragRef/tool dispatch the rest of the canvas interactions use — see startPan/
  // startObjectDrag below for where a pending placement is consumed.
  const beginPlacement = (type: ObjectType, contentOverride?: string, extra?: Partial<CanvasObject>) => {
    setPendingPlacement({ type, contentOverride, extra });
    setPlacementPreviewPoint(null);
    setAddMenuOpen(false); setShapeMenuOpen(false); setTemplateMenuOpen(false);
    setConnectStart(null);
  };
  const cancelPlacement = () => { setPendingPlacement(null); setPlacementPreviewPoint(null); };
  // One-click starters for diagram/mind-map layouts and small annotation pieces. Each inserts a
  // batch of shape objects (plus connectors/strokes where needed) built from the same CanvasObject
  // model the rest of the app already uses — no new object types required.
  const insertTemplate = (kind: string) => {
    const baseCount = currentPage?.objects.length ?? 0;
    const objs: CanvasObject[] = [];
    const conns: Connection[] = [];
    const strokesToAdd: Stroke[] = [];
    let z = baseCount;
    const node = (x: number, y: number, w: number, h: number, content: string, fill: string, color: string, shapeKind: ShapeKind = 'rectangle'): CanvasObject => {
      z += 1;
      const obj: CanvasObject = { id: uid('shape'), type: 'shape', x, y, width: w, height: h, rotation: 0, zIndex: z, content, fill, color, shapeKind };
      objs.push(obj);
      return obj;
    };
    const label = (x: number, y: number, w: number, h: number, content: string): CanvasObject => {
      z += 1;
      const obj: CanvasObject = { id: uid('text'), type: 'text', x, y, width: w, height: h, rotation: 0, zIndex: z, content, fill: 'transparent', color: '#334155' };
      objs.push(obj);
      return obj;
    };
    const link = (from: CanvasObject, to: CanvasObject, connLabel?: string, curved = false) => {
      conns.push({ id: uid('connection'), from: from.id, to: to.id, curved, label: connLabel, arrowhead: 'arrow', type: 'default', strokeWidth: 2, strokeColor: 'hsl(var(--primary) / .55)', strokeDasharray: undefined });
    };
    const palette = ['#d9ebe3', '#f7dfbd', '#f4cfc8', '#d8e4ee', '#e4ddf1'];
    const accent = ['#1f5e60', '#8a6a24', '#8a4a41', '#375c78', '#5c4a82'];

    if (kind === 'flowchart') {
      const start = node(-70, -220, 160, 56, 'Start', palette[0], accent[0], 'stadium');
      const proc = node(-70, -130, 160, 64, 'Do the work', palette[1], accent[1], 'rectangle');
      const decision = node(-80, -20, 180, 100, 'Looks right?', palette[3], accent[3], 'diamond');
      const proc2 = node(-260, 120, 160, 64, 'Revise', palette[2], accent[2], 'rectangle');
      const end = node(-70, 220, 160, 56, 'End', palette[0], accent[0], 'stadium');
      link(start, proc); link(proc, decision);
      link(decision, end, 'Yes'); link(decision, proc2, 'No'); link(proc2, proc, undefined, true);
    } else if (kind === 'process-diagram') {
      const steps = ['Gather', 'Analyze', 'Design', 'Ship'];
      let prev: CanvasObject | null = null;
      steps.forEach((step, i) => {
        const n = node(-360 + i * 200, 0, 160, 64, step, palette[i % palette.length], accent[i % accent.length], 'input-output');
        if (prev) link(prev, n);
        prev = n;
      });
    } else if (kind === 'org-chart' || kind === 'tree-diagram' || kind === 'hierarchy-diagram') {
      const root = node(-80, -180, 160, 60, 'Root', palette[0], accent[0], 'rounded-rectangle');
      const children = [-280, -80, 120].map((x, i) => node(x, -30, 160, 56, `Child ${i + 1}`, palette[(i + 1) % palette.length], accent[(i + 1) % accent.length], 'rectangle'));
      children.forEach((c) => link(root, c));
      const grandchildren = [children[0]].flatMap((parent, gi) => [-360, -200].map((x, i) => node(x, 100, 140, 48, `Sub ${gi * 2 + i + 1}`, palette[3], accent[3], 'rectangle')).map((gc) => { link(parent, gc); return gc; }));
      void grandchildren;
    } else if (kind === 'timeline') {
      const stops = ['Kickoff', 'Milestone 1', 'Milestone 2', 'Launch'];
      let prev: CanvasObject | null = null;
      stops.forEach((stop, i) => {
        const n = node(-420 + i * 220, 0, 170, 56, stop, palette[i % palette.length], accent[i % accent.length], 'stadium');
        label(-420 + i * 220, 70, 170, 26, `Date ${i + 1}`);
        if (prev) link(prev, n);
        prev = n;
      });
    } else if (kind === 'cycle-diagram') {
      const steps = ['Plan', 'Build', 'Review', 'Learn'];
      const radius = 170;
      const centers = steps.map((_, i) => {
        const angle = (i / steps.length) * Math.PI * 2 - Math.PI / 2;
        return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
      });
      const nodes = steps.map((step, i) => node(centers[i].x - 75, centers[i].y - 30, 150, 60, step, palette[i % palette.length], accent[i % accent.length], 'ellipse'));
      nodes.forEach((n, i) => link(n, nodes[(i + 1) % nodes.length], undefined, true));
    } else if (kind === 'venn-diagram') {
      z += 1; objs.push({ id: uid('shape'), type: 'shape', x: -180, y: -100, width: 260, height: 260, rotation: 0, zIndex: z, content: 'A', fill: 'rgba(31,94,96,.28)', color: '#1f5e60', shapeKind: 'ellipse' });
      z += 1; objs.push({ id: uid('shape'), type: 'shape', x: -80, y: -100, width: 260, height: 260, rotation: 0, zIndex: z, content: 'B', fill: 'rgba(216,151,60,.28)', color: '#8a6a24', shapeKind: 'ellipse' });
      label(-30, 10, 60, 30, 'Both');
    } else if (kind === 'funnel') {
      const stages = ['Visitors', 'Leads', 'Trials', 'Customers'];
      stages.forEach((stage, i) => {
        const inset = i * 40;
        node(-160 + inset, -160 + i * 90, 320 - inset * 2, 70, stage, palette[i % palette.length], accent[i % accent.length], 'trapezoid');
      });
    } else if (kind === 'pyramid') {
      const levels = ['Vision', 'Strategy', 'Tactics', 'Daily work'];
      levels.forEach((lvl, i) => {
        const width = 120 + i * 90;
        node(-width / 2, -180 + i * 90, width, 74, lvl, palette[(levels.length - i) % palette.length], accent[(levels.length - i) % accent.length], i === 0 ? 'triangle' : 'trapezoid');
      });
    } else if (kind === 'sequence-diagram') {
      const actors = ['Client', 'Server', 'Database'];
      const lanes = actors.map((actor, i) => {
        const x = -300 + i * 300;
        node(x - 60, -220, 120, 44, actor, palette[i % palette.length], accent[i % accent.length], 'rounded-rectangle');
        z += 1; objs.push({ id: uid('shape'), type: 'shape', x, y: -170, width: 2, height: 380, rotation: 0, zIndex: z, content: '', fill: 'hsl(var(--primary) / .35)', color: '#1f5e60', shapeKind: 'rectangle' });
        return x;
      });
      const messages = ['request', 'query', 'response'];
      messages.forEach((msg, i) => {
        z += 1;
        const fromLane = lanes[i % 2]; const toLane = lanes[(i % 2) + 1];
        const y = -100 + i * 90;
        const fromAnchor: CanvasObject = { id: uid('shape'), type: 'shape', x: fromLane, y, width: 1, height: 1, rotation: 0, zIndex: z, content: '', fill: 'transparent', color: 'transparent', shapeKind: 'rectangle' };
        const toAnchor: CanvasObject = { id: uid('shape'), type: 'shape', x: toLane, y, width: 1, height: 1, rotation: 0, zIndex: z, content: '', fill: 'transparent', color: 'transparent', shapeKind: 'rectangle' };
        objs.push(fromAnchor, toAnchor);
        link(fromAnchor, toAnchor, msg);
      });
    } else if (kind === 'number-marker' || kind === 'letter-marker') {
      const text = kind === 'number-marker' ? '1' : 'A';
      node(-16, -16, 36, 36, text, '#1f5e60', '#ffffff', 'ellipse');
    } else if (kind === 'comment-bubble') {
      node(-70, -50, 150, 70, 'Comment…', '#fef3c7', '#78350f', 'speech-bubble');
    } else if (kind === 'circle-highlight') {
      z += 1; objs.push({ id: uid('shape'), type: 'shape', x: -90, y: -60, width: 180, height: 120, rotation: 0, zIndex: z, content: '', fill: 'rgba(253,224,71,.32)', color: 'transparent', shapeKind: 'ellipse' });
    } else if (kind === 'rectangle-highlight') {
      z += 1; objs.push({ id: uid('shape'), type: 'shape', x: -90, y: -60, width: 180, height: 120, rotation: 0, zIndex: z, content: '', fill: 'rgba(253,224,71,.32)', color: 'transparent', shapeKind: 'rectangle' });
    } else if (kind === 'dimension-line') {
      strokesToAdd.push({ id: uid('stroke'), points: [{ x: -120, y: 0 }, { x: 120, y: 0 }], color: '#334155', width: 2, kind: 'arrow', bothEnds: true });
      label(-40, 10, 80, 26, '12 cm');
    } else if (kind === 'underline') {
      strokesToAdd.push({ id: uid('stroke'), points: [{ x: -60, y: 0 }, { x: 60, y: 0 }], color: '#334155', width: 3, kind: 'line' });
    } else if (kind === 'kanban-board') {
      const columns = ['To do', 'In progress', 'Done'];
      columns.forEach((colName, ci) => {
        const colX = -330 + ci * 220;
        z += 1; objs.push({ id: uid('shape'), type: 'shape', x: colX, y: -220, width: 200, height: 420, rotation: 0, zIndex: z, content: colName, fill: 'transparent', color: accent[ci % accent.length], shapeKind: 'frame' });
        [0, 1].forEach((ri) => {
          z += 1;
          objs.push({ id: uid('shape'), type: 'shape', x: colX + 15, y: -180 + ri * 110, width: 170, height: 90, rotation: 0, zIndex: z, content: `Card title|Task detail ${ci * 2 + ri + 1}`, fill: palette[ci % palette.length], color: accent[ci % accent.length], shapeKind: 'ui-card' });
        });
      });
    } else if (kind === 'timeline-cards') {
      const stops = [
        { title: 'Kickoff', date: 'Week 1' },
        { title: 'Milestone 1', date: 'Week 3' },
        { title: 'Milestone 2', date: 'Week 6' },
        { title: 'Launch', date: 'Week 9' },
      ];
      stops.forEach((stop, i) => {
        z += 1;
        objs.push({ id: uid('shape'), type: 'shape', x: -420 + i * 220, y: -40, width: 190, height: 100, rotation: 0, zIndex: z, content: `${stop.title}|${stop.date}`, fill: palette[i % palette.length], color: accent[i % accent.length], shapeKind: 'ui-card' });
      });
    }

    if (!objs.length && !strokesToAdd.length) return;
    mutatePage((page) => ({
      ...page,
      objects: [...page.objects, ...objs],
      connections: [...(page.connections ?? []), ...conns],
      strokes: [...(page.strokes ?? []), ...strokesToAdd],
    }));
    setSelectedIds(objs.map((o) => o.id));
    setSelectedId(objs[0]?.id ?? null);
    setAddMenuOpen(false);
    setTemplateMenuOpen(false);
    setTool('select');
    setSaveState('Template inserted locally');
  };
  const duplicateObject = (objectId: string, offset = 24) => {
    const source = currentPage?.objects.find((object) => object.id === objectId);
    if (!source) return;
    const objectCount = currentPage?.objects.length ?? 0;
    const clone: CanvasObject = { ...JSON.parse(JSON.stringify(source)) as CanvasObject, id: uid(source.type), x: source.x + offset, y: source.y + offset, zIndex: objectCount + 1, locked: false };
    mutatePage((page) => ({ ...page, objects: [...page.objects, clone] }));
    setSelectedId(clone.id); setSelectedIds([clone.id]); setSaveState('Piece duplicated');
    return clone;
  };
  const duplicateSelection = () => {
    const ids = selectedIds.length ? selectedIds : selectedId ? [selectedId] : [];
    if (!ids.length) return;
    const clones = ids.map((objectId) => duplicateObject(objectId)).filter((clone): clone is CanvasObject => !!clone);
    if (clones.length > 1) setSelectedIds(clones.map((clone) => clone.id));
  };
  const pasteClipboard = () => {
    if (!clipboardRef.current.length) return;
    const objectCount = currentPage?.objects.length ?? 0;
    const clones = clipboardRef.current.map((source, index) => ({
      ...JSON.parse(JSON.stringify(source)) as CanvasObject,
      id: uid(source.type),
      x: source.x + 32,
      y: source.y + 32,
      zIndex: objectCount + index + 1,
      locked: false,
    }));
    mutatePage((page) => ({ ...page, objects: [...page.objects, ...clones] }));
    setSelectedIds(clones.map((clone) => clone.id));
    setSelectedId(clones[0]?.id ?? null);
    setSaveState(`Pasted ${clones.length} piece${clones.length > 1 ? 's' : ''}`);
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.matches('input, textarea')) return;
      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && key === 'z' && !event.shiftKey) { event.preventDefault(); undo(); }
      if ((event.metaKey || event.ctrlKey) && (key === 'y' || (key === 'z' && event.shiftKey))) { event.preventDefault(); redo(); }
      if (key === 't' && !event.metaKey && !event.ctrlKey) { event.preventDefault(); beginPlacement('text'); }
      if ((event.metaKey || event.ctrlKey) && key === 'd') { event.preventDefault(); if (selectedId) duplicateObject(selectedId); }
      if ((event.metaKey || event.ctrlKey) && key === 'c') {
        const ids = selectedIds.length ? selectedIds : selectedId ? [selectedId] : [];
        if (ids.length) {
          const objects = (currentPage?.objects ?? []).filter((object) => ids.includes(object.id));
          if (objects.length) { clipboardRef.current = objects.map((object) => JSON.parse(JSON.stringify(object)) as CanvasObject); setSaveState(`Copied ${objects.length} piece${objects.length > 1 ? 's' : ''}`); }
        }
      }
      if ((event.metaKey || event.ctrlKey) && key === 'v') {
        if (clipboardRef.current.length) { event.preventDefault(); pasteClipboard(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const attachTo = pendingAttachConnectionIdRef.current;
    pendingAttachConnectionIdRef.current = null;
    try {
      const content = await compressImage(file);
      if (attachTo) attachObjectToConnection(attachTo, 'image', content);
      else addObject('image', content);
      setSaveState('Compressed image saved locally');
    } catch {
      setSaveState('Unable to add image');
    } finally {
      event.target.value = '';
    }
  };
  const replaceImage = async (objectId: string, file: File) => {
    try {
      updateObject(objectId, { content: await compressImage(file) });
      setSaveState('Compressed image replaced in place');
    } catch {
      setSaveState('Unable to replace image');
    }
  };
  const startPan = (event: React.PointerEvent) => {
    if (pendingPlacement) {
      if (event.button !== 0) return;
      event.preventDefault();
      const point = canvasPoint(event);
      addObject(pendingPlacement.type, pendingPlacement.contentOverride, pendingPlacement.extra, point);
      cancelPlacement();
      return;
    }
    if (event.button === 1) {
      event.preventDefault();
      setContextMenu(null);
      dragRef.current = { kind: 'pan', pointerX: event.clientX, pointerY: event.clientY, startX: pan.x, startY: pan.y };
      setIsInteractingWithCanvas(true);
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      return;
    }
    if (event.button !== 0) return;
    setContextMenu(null);
    const isCanvas = event.target === event.currentTarget;
    if (isSpacePressed || tool === 'pan') {
      dragRef.current = { kind: 'pan', pointerX: event.clientX, pointerY: event.clientY, startX: pan.x, startY: pan.y };
      setIsInteractingWithCanvas(true);
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      return;
    }
    if ((tool === 'draw' || tool === 'line' || tool === 'arrow' || tool === 'highlight') && isCanvas) {
      const point = canvasPoint(event);
      setDrawPoints([point]);
      dragRef.current = { kind: 'draw', pointerX: event.clientX, pointerY: event.clientY, startX: 0, startY: 0 };
      setIsInteractingWithCanvas(true);
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      return;
    }
    if (tool === 'eraser' && isCanvas) {
      const point = canvasPoint(event);
      const radius = 14 / zoom;
      mutatePage((page) => ({
        ...page,
        strokes: (page.strokes ?? []).flatMap((stroke) => eraseStrokeAtPoint(stroke, point, radius)),
      }));
      setSelectedStrokeId(null);
      dragRef.current = { kind: 'draw', pointerX: event.clientX, pointerY: event.clientY, startX: point.x, startY: point.y };
      setIsInteractingWithCanvas(true);
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      return;
    }
    if (tool === 'connect' || !isCanvas) return;
    if (isCanvas && tool === 'select' && !event.altKey) {
      const point = canvasPoint(event);
      setSelectedId(null);
      setSelectedIds([]);
      setMarquee({ x: point.x, y: point.y, width: 0, height: 0 });
      dragRef.current = { kind: 'marquee', pointerX: event.clientX, pointerY: event.clientY, startX: point.x, startY: point.y };
      setIsInteractingWithCanvas(true);
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      return;
    }
    if (isCanvas) {
      dragRef.current = { kind: 'pan', pointerX: event.clientX, pointerY: event.clientY, startX: pan.x, startY: pan.y };
      setIsInteractingWithCanvas(true);
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    }
  };
  const startObjectDrag = (event: React.PointerEvent, object: CanvasObject) => {
    if (pendingPlacement) {
      event.stopPropagation();
      if (event.button !== 0) return;
      event.preventDefault();
      const point = canvasPoint(event);
      addObject(pendingPlacement.type, pendingPlacement.contentOverride, pendingPlacement.extra, point);
      cancelPlacement();
      return;
    }
    if (isSpacePressed || tool === 'pan') return;
    if (tool === 'draw' || tool === 'line' || tool === 'arrow' || tool === 'eraser' || tool === 'highlight') return;
    // Link-follow affordance (section 2): the small link badge rendered on linked objects (see the
    // object-rendering section below) stops its own propagation and calls followLink directly, so
    // it never reaches here — this guard only covers the rare case of Alt-click on the object body
    // itself as a keyboard-friendly alternative to hunting for the badge, gated the same way
    // object.locked already gates normal dragging above.
    if (object.link && event.altKey) {
      event.stopPropagation();
      followLink(object.link);
      return;
    }
    if (object.locked && tool !== 'connect') {
      event.stopPropagation();
      setSelectedId(object.id);
      setSelectedIds([object.id]);
      setSaveState('Object is locked');
      return;
    }
    if (tool === 'connect') {
      event.stopPropagation();
      if (!connectStart) {
        setConnectStart(object.id);
        setSelectedId(object.id);
        setSaveState('Choose another piece');
      } else if (connectStart !== object.id) {
        const exists = (currentPage?.connections ?? []).some((connection) => (connection.from === connectStart && connection.to === object.id) || (connection.from === object.id && connection.to === connectStart));
        if (!exists) {
          const newConnectionId = uid('connection');
          mutatePage((page) => ({ ...page, connections: [...(page.connections ?? []), { id: newConnectionId, from: connectStart, to: object.id, curved: false, arrowhead: 'arrow', type: 'default', strokeWidth: 2, strokeColor: 'hsl(var(--primary) / .45)', strokeDasharray: '7 7' }] }));
          setSaveState('Connection saved locally');
          setJustConnectedId(newConnectionId);
          window.setTimeout(() => setJustConnectedId((current) => current === newConnectionId ? null : current), 450);
        }
        setConnectStart(null);
        setSelectedId(object.id);
        setConnectPointer(null);
      }
      return;
    }
    event.stopPropagation();
    setSelectedId(object.id);
    setSelectedIds(event.shiftKey ? Array.from(new Set([...selectedIds, object.id])) : [object.id]);
    setEditingObjectId(null);
    setContextMenu(null);
    pushHistorySnapshot();
    // If we're grabbing a container, carry its children along by the same delta as it moves
    // (movePointer below) without touching their containerId — capturing each child's starting
    // position here is what lets that be a pure per-frame delta rather than re-deriving anything
    // from bounds mid-drag.
    // A line-attached object drags along its connector's tangent/normal frame (section 4 of the
    // brief) instead of free x/y — exactly the mechanism startLabelDrag already uses for the
    // connector's own label, just targeting this object's positionAlongLine/perpendicularOffset via
    // updateObject instead of the connection's labelPositionAlongLine/labelPerpendicularOffset.
    const parentConnection = object.parentConnectorId ? currentPage?.connections?.find((c) => c.id === object.parentConnectorId) : undefined;
    const parentFrom = parentConnection && currentPage?.objects.find((o) => o.id === parentConnection.from);
    const parentTo = parentConnection && currentPage?.objects.find((o) => o.id === parentConnection.to);
    if (parentConnection && parentFrom && parentTo) {
      const frame = getConnectionDragFrame(parentFrom, parentTo);
      dragRef.current = {
        kind: 'attached', pointerX: event.clientX, pointerY: event.clientY, startX: 0, startY: 0,
        objectId: object.id, connectionId: parentConnection.id,
        startT: object.positionAlongLine ?? 0.5, startPerp: object.perpendicularOffset ?? 0,
        ...frame,
      };
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      return;
    }
    const containerChildStarts = isContainerShapeKind(object.shapeKind)
      ? Object.fromEntries((currentPage?.objects ?? []).filter((candidate) => candidate.containerId === object.id).map((candidate) => [candidate.id, { x: candidate.x, y: candidate.y }]))
      : undefined;
    dragRef.current = { kind: 'object', pointerX: event.clientX, pointerY: event.clientY, startX: object.x, startY: object.y, objectId: object.id, containerChildStarts };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };
  const startResize = (event: React.PointerEvent, object: CanvasObject, handle: ResizeHandle) => {
    event.stopPropagation();
    if (object.locked) return;
    pushHistorySnapshot();
    dragRef.current = { kind: 'resize', pointerX: event.clientX, pointerY: event.clientY, startX: object.x, startY: object.y, objectId: object.id, resizeHandle: handle, startWidth: object.width, startHeight: object.height };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };
  const startRotate = (event: React.PointerEvent, object: CanvasObject) => {
    event.stopPropagation();
    if (object.locked) return;
    // For an attached object, object.x/y aren't its real position (see resolveObjectRect), so the
    // rotate-angle math needs the connector-derived center instead of getObjectCenter's x/y-based one.
    const rect = resolveObjectRect(object, currentPage?.connections ?? [], currentPage?.objects ?? []);
    const center = { x: rect.x + object.width / 2, y: rect.y + object.height / 2 };
    pushHistorySnapshot();
    dragRef.current = { kind: 'rotate', pointerX: event.clientX, pointerY: event.clientY, startX: object.rotation, startY: 0, objectId: object.id, originX: center.x, originY: center.y };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };
  const movePointer = (event: React.PointerEvent) => {
    if (pendingPlacement) setPlacementPreviewPoint(canvasPoint(event));
    if (tool === 'connect' && connectStart) setConnectPointer(canvasPoint(event));
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.kind === 'pan') setPan({ x: drag.startX + event.clientX - drag.pointerX, y: drag.startY + event.clientY - drag.pointerY });
    else if (drag.kind === 'draw' && tool === 'eraser') {
      const point = canvasPoint(event);
      const radius = 14 / zoom;
      mutatePage((page) => ({
        ...page,
        strokes: (page.strokes ?? []).flatMap((stroke) => eraseStrokeAtPoint(stroke, point, radius)),
      }), false);
    }
    else if (drag.kind === 'draw') setDrawPoints((current) => (tool === 'draw' || tool === 'highlight') ? [...current, canvasPoint(event)] : [current[0], canvasPoint(event)]);
    else if (drag.kind === 'marquee') {
      const point = canvasPoint(event);
      setMarquee({
        x: Math.min(drag.startX, point.x),
        y: Math.min(drag.startY, point.y),
        width: Math.abs(point.x - drag.startX),
        height: Math.abs(point.y - drag.startY),
      });
    }
    else if (drag.kind === 'rotate' && drag.objectId != null && drag.originX != null && drag.originY != null) {
      const point = canvasPoint(event);
      const angle = Math.atan2(point.y - drag.originY, point.x - drag.originX) * (180 / Math.PI);
      updateObject(drag.objectId, { rotation: Math.round(angle / 5) * 5 }, false);
    }
    else if (drag.kind === 'label' && drag.connectionId != null && drag.tangentX != null && drag.tangentY != null && drag.normalX != null && drag.normalY != null && drag.tangentLength != null) {
      const dx = (event.clientX - drag.pointerX) / zoom;
      const dy = (event.clientY - drag.pointerY) / zoom;
      // Project the pointer's canvas-space movement onto the line's tangent (how far along the
      // line) and normal (how far off it) directions established when the drag started.
      const deltaAlong = (dx * drag.tangentX + dy * drag.tangentY) / drag.tangentLength;
      const deltaPerp = dx * drag.normalX + dy * drag.normalY;
      const nextT = Math.min(1, Math.max(0, (drag.startT ?? 0.5) + deltaAlong / drag.tangentLength));
      const nextPerp = (drag.startPerp ?? 0) + deltaPerp;
      updateConnection(drag.connectionId, { labelPositionAlongLine: nextT, labelPerpendicularOffset: nextPerp }, false);
    }
    else if (drag.kind === 'attached' && drag.objectId != null && drag.tangentX != null && drag.tangentY != null && drag.normalX != null && drag.normalY != null && drag.tangentLength != null) {
      const dx = (event.clientX - drag.pointerX) / zoom;
      const dy = (event.clientY - drag.pointerY) / zoom;
      const deltaAlong = (dx * drag.tangentX + dy * drag.tangentY) / drag.tangentLength;
      const deltaPerp = dx * drag.normalX + dy * drag.normalY;
      const nextT = Math.min(1, Math.max(0, (drag.startT ?? 0.5) + deltaAlong / drag.tangentLength));
      const nextPerp = (drag.startPerp ?? 0) + deltaPerp;
      updateObject(drag.objectId, { positionAlongLine: nextT, perpendicularOffset: nextPerp }, false);
    }
    else if (drag.kind === 'stroke' && drag.objectId != null && drag.strokePoints) {
      const dx = (event.clientX - drag.pointerX) / zoom;
      const dy = (event.clientY - drag.pointerY) / zoom;
      let nextPoints = drag.strokePoints.map((point) => ({ x: point.x + dx, y: point.y + dy }));
      if (snapEnabled) nextPoints = nextPoints.map((point) => ({ x: snapValue(point.x), y: snapValue(point.y) }));
      updateStroke(drag.objectId, { points: nextPoints }, false);
    }
    else if (drag.kind === 'resize' && drag.objectId != null && drag.resizeHandle && drag.startWidth != null && drag.startHeight != null) {
      // Axis-aligned resize (doesn't account for object.rotation — same simplification the rest
      // of the app's drag math uses elsewhere). Each move event recomputes width/height/x/y from
      // the original drag.startWidth/startHeight/startX/startY, so it can't drift across events;
      // the anchor edge opposite the dragged handle stays fixed by deriving x/y from the final
      // (possibly min-clamped) size rather than the raw pointer delta.
      const dx = (event.clientX - drag.pointerX) / zoom;
      const dy = (event.clientY - drag.pointerY) / zoom;
      const handle = drag.resizeHandle;
      const MIN_SIZE = 32;
      let width = drag.startWidth;
      let height = drag.startHeight;
      let nextX = drag.startX;
      let nextY = drag.startY;
      if (handle.includes('e')) width = Math.max(MIN_SIZE, drag.startWidth + dx);
      if (handle.includes('w')) { width = Math.max(MIN_SIZE, drag.startWidth - dx); nextX = drag.startX + drag.startWidth - width; }
      if (handle.includes('s')) height = Math.max(MIN_SIZE, drag.startHeight + dy);
      if (handle.includes('n')) { height = Math.max(MIN_SIZE, drag.startHeight - dy); nextY = drag.startY + drag.startHeight - height; }
      if (snapEnabled) { width = snapValue(width); height = snapValue(height); nextX = snapValue(nextX); nextY = snapValue(nextY); }
      // Reuses updateObject rather than a parallel path, so a container being resized this way
      // still scales its children (updateObject's own container-resize branch, section 1).
      updateObject(drag.objectId, { width, height, x: nextX, y: nextY }, false);
    }
    else if (drag.objectId) {
      let nextX = drag.startX + (event.clientX - drag.pointerX) / zoom;
      let nextY = drag.startY + (event.clientY - drag.pointerY) / zoom;
      if (snapEnabled) { nextX = snapValue(nextX); nextY = snapValue(nextY); }
      if (drag.containerChildStarts) {
        // Move the container and every captured child by the same delta in one mutatePage call
        // (reusing the existing update path, just batched) rather than N separate updateObject
        // calls — containerId is untouched here, exactly as required.
        const dx = nextX - drag.startX;
        const dy = nextY - drag.startY;
        const childStarts = drag.containerChildStarts;
        const objectId = drag.objectId;
        mutatePage((page) => ({
          ...page,
          objects: page.objects.map((object) => {
            if (object.id === objectId) return { ...object, x: nextX, y: nextY };
            const start = childStarts[object.id];
            return start ? { ...object, x: start.x + dx, y: start.y + dy } : object;
          }),
        }), false);
      } else {
        updateObject(drag.objectId, { x: nextX, y: nextY }, false);
      }
    }
  };
  const endPointer = () => {
    if (dragRef.current?.kind === 'draw' && tool !== 'eraser' && drawPoints.length > 1) {
      const detected = tool === 'line' ? { kind: 'line' as const, points: [drawPoints[0], drawPoints[drawPoints.length - 1]] }
        : tool === 'arrow' ? { kind: 'arrow' as const, points: [drawPoints[0], drawPoints[drawPoints.length - 1]] }
        : tool === 'highlight' ? { kind: 'highlight' as const, points: drawPoints }
        : detectDrawnShape(drawPoints);
      const isHighlighter = tool === 'highlight';
      const texture = tool === 'draw' ? drawTexture : undefined;
      const textureWidth = texture === 'pencil' ? Math.max(1, Math.round(strokeWidth * 0.5)) : texture === 'brush' ? Math.round(strokeWidth * 1.8) : strokeWidth;
      mutatePage((page) => ({ ...page, strokes: [...(page.strokes ?? []), {
        id: uid('stroke'),
        points: detected.points,
        color: isHighlighter ? (strokeColor === '#1f5e60' ? '#fde047' : strokeColor) : strokeColor,
        width: isHighlighter ? Math.max(strokeWidth * 2.5, 14) : textureWidth,
        kind: detected.kind,
        dasharray: isHighlighter ? undefined : (texture === 'pencil' ? '1 2' : strokeStyle || undefined),
        bothEnds: tool === 'arrow' ? arrowBothEnds : undefined,
        textureKind: isHighlighter ? 'highlight' : texture,
      }] }));
      setSaveState(isHighlighter ? 'Highlight saved locally' : !detected.kind || detected.kind === 'free' ? 'Drawing saved locally' : `${detected.kind[0].toUpperCase()}${detected.kind.slice(1)} detected`);
    }
    if (dragRef.current?.kind === 'marquee' && marquee) {
      const hits = (currentPage?.objects ?? []).filter((object) => {
        const ox = object.x, oy = object.y, ow = object.width, oh = object.height;
        return ox >= marquee.x && oy >= marquee.y && ox + ow <= marquee.x + marquee.width && oy + oh <= marquee.y + marquee.height;
      }).map((object) => object.id);
      setSelectedIds(hits);
      setSelectedId(hits[0] ?? null);
    }
    if (dragRef.current?.kind === 'object' && dragRef.current.objectId && !dragRef.current.containerChildStarts) {
      // Re-parenting only happens here, on release, and only for the object actually grabbed (a
      // container's children move via the batched delta above and never go through this branch,
      // and a container being dragged is excluded via containerChildStarts) — so selecting or
      // dragging a container never detaches its children, per the brief's section 1 requirement.
      const draggedId = dragRef.current.objectId;
      const draggedObject = currentPage?.objects.find((object) => object.id === draggedId);
      if (draggedObject && !isContainerShapeKind(draggedObject.shapeKind)) {
        const nextContainerId = findContainerForBounds(currentPage?.objects ?? [], draggedObject, draggedObject.id);
        if (nextContainerId !== draggedObject.containerId) updateObject(draggedId, { containerId: nextContainerId }, false);
      }
    }
    setMarquee(null);
    setDrawPoints([]);
    dragRef.current = null;
    setIsInteractingWithCanvas(false);
  };
  const deleteSelectedObject = () => {
    if (!selected) return;
    requestDeleteObjects([selected.id]);
    setSelectedId(null);
  };
  const updateStroke = (strokeId: string, patch: Partial<Stroke>, recordHistory = true) => mutatePage((page) => ({ ...page, strokes: (page.strokes ?? []).map((stroke) => stroke.id === strokeId ? { ...stroke, ...patch } : stroke) }), recordHistory);
  const updateConnection = (connectionId: string, patch: Partial<Connection>, recordHistory = true) => mutatePage((page) => ({ ...page, connections: (page.connections ?? []).map((conn) => conn.id === connectionId ? { ...conn, ...patch } : conn) }), recordHistory);
  // Drag a connector's label off (or along) the line. `from`/`to` are the connector's current
  // endpoint objects, needed once at drag start to establish the line's local tangent/normal
  // frame — dragging then just projects pointer movement onto that frame, so it works the same
  // way for straight and curved connectors (see the "curved" note in getLabelPosition).
  const startLabelDrag = (event: React.PointerEvent, connection: Connection, from: CanvasObject, to: CanvasObject) => {
    event.stopPropagation();
    pushHistorySnapshot();
    const { start, end } = { start: getRectEdgePoint(from, getObjectCenter(to).x, getObjectCenter(to).y), end: getRectEdgePoint(to, getObjectCenter(from).x, getObjectCenter(from).y) };
    const tangentX = end.x - start.x;
    const tangentY = end.y - start.y;
    const tangentLength = Math.sqrt(tangentX * tangentX + tangentY * tangentY) || 1;
    dragRef.current = {
      kind: 'label', pointerX: event.clientX, pointerY: event.clientY, startX: 0, startY: 0,
      connectionId: connection.id,
      startT: connection.labelPositionAlongLine ?? 0.5,
      startPerp: connection.labelPerpendicularOffset ?? 0,
      tangentX, tangentY, tangentLength,
      normalX: -tangentY / tangentLength, normalY: tangentX / tangentLength,
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };
  const deleteSelectedStroke = () => {
    if (!selectedStroke) return;
    mutatePage((page) => ({ ...page, strokes: (page.strokes ?? []).filter((stroke) => stroke.id !== selectedStroke.id) }));
    setSelectedStrokeId(null);
  };
  const deleteSelectedConnection = () => {
    if (!selectedConnection) return;
    mutatePage((page) => ({ ...page, objects: detachObjectsFromConnector(page.objects, page.connections ?? [], selectedConnection.id), connections: (page.connections ?? []).filter((conn) => conn.id !== selectedConnection.id) }));
    setSelectedConnectionId(null);
  };
  // "+" on a selected connector (section 2 of the brief): creates a normal object via the same
  // addObject path every other "+ Add" entry uses, just with parentConnectorId/positionAlongLine/
  // perpendicularOffset set so it rides the connector instead of sitting at a fixed point. Reusing
  // addObject (rather than a parallel "attached component" creator) is what keeps it on the same
  // rendering/editing/selection/resize/style system as every other component, per the brief.
  const attachObjectToConnection = (connectionId: string, type: ObjectType, contentOverride?: string, extra?: Partial<CanvasObject>) => {
    addObject(type, contentOverride, { ...extra, parentConnectorId: connectionId, positionAlongLine: 0.5, perpendicularOffset: 0 });
    setAttachMenuConnectionId(null);
    setSelectedConnectionId(null);
  };
  const startAttachedImageUpload = (connectionId: string) => {
    pendingAttachConnectionIdRef.current = connectionId;
    setAttachMenuConnectionId(null);
    attachImageInputRef.current?.click();
  };
  const printNote = () => {
    document.title = note?.title ?? 'Mind Map Notebook';
    window.print();
  };

  if (!note) return <div className="flex min-h-[100dvh] items-center justify-center"><div className="text-center"><p className="font-serif text-2xl">This note has wandered off.</p><Link href="/" className="mt-4 inline-block text-sm text-[hsl(var(--primary))]">Return to My Notes</Link></div></div>;

  const strokeControls = (
    <div className="space-y-2 rounded-xl bg-[hsl(var(--muted))] p-2">
      <input type="color" value={strokeColor} onChange={(event) => setStrokeColor(event.target.value)} aria-label="Stroke color" className="h-7 w-full cursor-pointer rounded border-0 bg-transparent" data-testid="input-stroke-color" />
      <input type="range" min="1" max="18" value={strokeWidth} onChange={(event) => setStrokeWidth(Number(event.target.value))} aria-label="Stroke width" className="w-full accent-[hsl(var(--primary))]" data-testid="input-stroke-width" />
      <p className="text-center font-mono text-[11px] text-[hsl(var(--muted-foreground))]">{strokeWidth}px</p>
      <select value={strokeStyle} onChange={(event) => setStrokeStyle(event.target.value)} aria-label="Stroke style" className="w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-1.5 py-1 text-[11.5px] outline-none" data-testid="select-stroke-style">
        <option value="">Solid</option>
        <option value="7 7">Dashed</option>
        <option value="2 4">Dotted</option>
        <option value="10 4 2 4">Dash-dot</option>
      </select>
    </div>
  );

  return (
    <main className="flex min-h-[100dvh] flex-col overflow-hidden bg-[hsl(var(--background))]">
      <header className="z-20 flex h-[72px] shrink-0 items-center justify-between border-b border-[hsl(var(--border))] bg-[hsl(var(--card)/.86)] px-4 backdrop-blur-md sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]" aria-label="Back to notes" data-testid="link-back-notes"><ArrowLeft size={18} /></Link>
          <div className="h-6 w-px bg-[hsl(var(--border))]" />
          <Logo compact />
          <div className="ml-1 hidden h-6 w-px bg-[hsl(var(--border))] sm:block" />
          {editingTitle ? <input autoFocus value={note.title} onChange={(event) => mutateNote((current) => ({ ...current, title: event.target.value }))} onBlur={() => setEditingTitle(false)} onKeyDown={(event) => event.key === 'Enter' && setEditingTitle(false)} className="w-44 rounded-lg border border-[hsl(var(--primary)/.35)] bg-transparent px-2 py-1 text-sm font-semibold outline-none sm:w-64" data-testid="input-note-title" /> : <button type="button" onClick={() => setEditingTitle(true)} className="max-w-[190px] truncate text-left text-sm font-semibold hover:text-[hsl(var(--primary))] sm:max-w-xs" data-testid="button-edit-note-title">{note.title}</button>}
        </div>
         <div className="flex items-center gap-1.5 sm:gap-3">
           <button type="button" onClick={undo} aria-label="Undo" title="Undo" data-testid="button-undo" className="hidden h-9 w-9 items-center justify-center rounded-xl text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] sm:flex"><Undo2 size={16} /></button>
           <button type="button" onClick={redo} aria-label="Redo" title="Redo" data-testid="button-redo" className="hidden h-9 w-9 items-center justify-center rounded-xl text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] sm:flex"><Redo2 size={16} /></button>
           <span className="hidden items-center gap-1.5 text-xs text-[hsl(var(--muted-foreground))] sm:flex" data-testid="status-save"><Check size={14} className="text-[hsl(var(--primary))]" /> {syncState === 'synced' ? 'All changes synced' : saveState}</span>
           <button type="button" onClick={() => void exportNoteAsPng(note, currentPageIndex)} aria-label="Export PNG" title="Export PNG" data-testid="button-export-png" className="flex h-9 w-9 items-center justify-center rounded-xl text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]"><FileImage size={16} /></button>
           {backLocation && (
             <button type="button" onClick={goBack} aria-label="Back to previous page" title="Back to previous page" data-testid="button-link-back" className="flex h-9 w-9 items-center justify-center rounded-xl text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]"><CornerUpLeft size={16} /></button>
           )}
           <button type="button" onClick={printNote} aria-label="Export PDF" title="Print or export PDF" data-testid="button-export-pdf" className="flex h-9 w-9 items-center justify-center rounded-xl text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]"><Download size={16} /></button>
           <button type="button" onClick={() => setZenMode((value) => !value)} className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors ${zenMode ? 'bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]'}`} aria-label="Toggle focus mode" title="Focus mode (⌘.)" data-testid="button-toggle-zen"><Focus size={17} /></button>
           <button type="button" onClick={() => setShowInspector((value) => !value)} className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors ${showInspector ? 'bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]'}`} aria-label="Toggle inspector" data-testid="button-toggle-inspector"><PanelRight size={17} /></button>
            <AuthControls />
         </div>
      </header>
      <div className="z-10 flex h-12 shrink-0 items-center gap-2 border-b border-[hsl(var(--border))] bg-[hsl(var(--card)/.5)] px-4 backdrop-blur-sm sm:px-6">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => switchToPage(Math.max(0, currentPageIndex - 1))} disabled={currentPageIndex === 0} aria-label="Previous page" className="flex h-8 w-8 items-center justify-center rounded-lg text-[hsl(var(--muted-foreground))] transition-colors disabled:opacity-50 hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]"><ChevronLeft size={16} /></button>
          <div className="flex items-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background)/.5)] px-3 py-1.5">
            {editingPageIndex === currentPageIndex ? (
              <input autoFocus value={currentPage?.title ?? ''} onChange={(e) => setPageTitleDraft(currentPageIndex, e.target.value)} onBlur={(e) => renamePage(currentPageIndex, e.target.value)} onKeyDown={(e) => e.key === 'Enter' && renamePage(currentPageIndex, (e.target as HTMLInputElement).value)} className="max-w-28 bg-transparent text-xs font-semibold outline-none" />
            ) : (
              <button type="button" onClick={() => setEditingPageIndex(currentPageIndex)} className="max-w-28 truncate text-xs font-semibold hover:text-[hsl(var(--primary))]">{currentPage?.title ?? 'Page'}</button>
            )}
            <span className="text-xs text-[hsl(var(--muted-foreground))]">{currentPageIndex + 1} / {note?.pages.length ?? 1}</span>
          </div>
          <button type="button" onClick={() => switchToPage(Math.min((note?.pages.length ?? 1) - 1, currentPageIndex + 1))} disabled={currentPageIndex >= (note?.pages.length ?? 1) - 1} aria-label="Next page" className="flex h-8 w-8 items-center justify-center rounded-lg text-[hsl(var(--muted-foreground))] transition-colors disabled:opacity-50 hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]"><ChevronRight size={16} /></button>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={createNewSection} aria-label="Add section" title="Add section" className="flex h-8 w-8 items-center justify-center rounded-lg text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]" data-testid="button-add-section"><Grid2X2 size={16} /></button>
          <button type="button" onClick={() => createNewPage()} aria-label="Add new page" title="Add new page" className="flex h-8 w-8 items-center justify-center rounded-lg text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]"><Plus size={16} /></button>
          {(note?.pages.length ?? 1) > 1 && <button type="button" onClick={() => deletePage(currentPageIndex)} aria-label="Delete page" title="Delete page" className="flex h-8 w-8 items-center justify-center rounded-lg text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--destructive)/.15)] hover:text-[hsl(var(--destructive))]"><Trash2 size={16} /></button>}
        </div>
      </div>
      {(note?.sections.length ?? 0) > 0 && (
        <div className="relative z-10">
          {zenMode && <div className="absolute inset-x-0 top-0 z-20 h-3" onMouseEnter={() => setZenHoverTop(true)} />}
          <div
            onMouseEnter={() => zenMode && setZenHoverTop(true)}
            onMouseLeave={() => zenMode && setZenHoverTop(false)}
            className={zenMode
              ? `absolute left-1/2 top-2 z-30 max-h-48 w-[min(92vw,560px)] -translate-x-1/2 overflow-y-auto rounded-2xl bg-[hsl(var(--card)/.96)] backdrop-blur-sm elev-3 transition-all duration-300 ${zenHoverTop ? 'translate-y-0 opacity-100 pointer-events-auto' : '-translate-y-[140%] opacity-0 pointer-events-none'}`
              : `overflow-y-auto border-b border-[hsl(var(--border))] bg-[hsl(var(--card)/.3)] backdrop-blur-sm transition-[max-height] duration-300 ${sectionsCollapsed ? 'max-h-0' : 'max-h-48'}`}
            data-testid="panel-sections"
          >
          <div className="space-y-1 p-2">
            <div className="mb-1 flex flex-wrap items-center gap-2 px-1">
              <span className="text-[11.5px] font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Sections</span>
              <select
                aria-label="Move current page to section"
                value={currentPage?.sectionId ?? ''}
                onChange={(event) => movePageToSection(currentPageIndex, event.target.value || undefined)}
                className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1 text-[11.5px] outline-none"
                data-testid="select-page-section"
              >
                <option value="">Unsectioned</option>
                {(note?.sections ?? []).map((section) => <option key={section.id} value={section.id}>{section.title}</option>)}
              </select>
              <button
                type="button"
                onClick={() => setSectionsCollapsed((value) => !value)}
                aria-label={sectionsCollapsed ? 'Expand sections' : 'Collapse sections'}
                title={sectionsCollapsed ? 'Expand sections' : 'Collapse sections'}
                className="ml-auto flex h-6 w-6 items-center justify-center rounded text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]"
                data-testid="button-toggle-sections-panel"
              >
                <ChevronDown size={14} style={{ transform: sectionsCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
              </button>
            </div>
            {!sectionsCollapsed && note?.sections.map((section) => {
              const sectionPages = pagesInSection(section.id);
              return (
              <div key={section.id} className="rounded-lg border border-[hsl(var(--border)/.5)] bg-[hsl(var(--card)/.4)] p-2">
                <div className="flex items-center gap-1.5">
                  <button type="button" onClick={() => toggleSection(section.id)} className="flex h-6 w-6 items-center justify-center rounded text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]">
                    <ChevronDown size={14} style={{ transform: expandedSections.has(section.id) ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s' }} />
                  </button>
                  {editingSectionId === section.id ? (
                    <input autoFocus value={section.title} onChange={(e) => setSectionTitleDraft(section.id, e.target.value)} onBlur={(e) => renameSection(section.id, e.target.value)} onKeyDown={(e) => e.key === 'Enter' && renameSection(section.id, (e.target as HTMLInputElement).value)} className="max-w-24 flex-1 bg-transparent text-xs font-semibold outline-none" />
                  ) : (
                    <button type="button" onClick={() => setEditingSectionId(section.id)} className="flex-1 truncate text-left text-xs font-semibold hover:text-[hsl(var(--primary))]">{section.title} <span className="opacity-50">({sectionPages.length})</span></button>
                  )}
                  <button type="button" onClick={() => createNewPage(section.id)} title="Add page in section" className="flex h-6 w-6 items-center justify-center rounded text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]"><Plus size={14} /></button>
                  <button type="button" onClick={() => deleteSection(section.id)} className="flex h-6 w-6 items-center justify-center rounded text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--destructive)/.15)] hover:text-[hsl(var(--destructive))]"><Trash2 size={14} /></button>
                </div>
                {expandedSections.has(section.id) && (
                  <div className="ml-6 mt-1 space-y-1">
                    {sectionPages.length === 0 ? <p className="px-2 py-1 text-[11.5px] text-[hsl(var(--muted-foreground))]">No pages yet — use + or the section dropdown.</p> : sectionPages.map((page) => (
                      <button key={page.id} type="button" onClick={() => { const pageIdx = note.pages.findIndex(p => p.id === page.id); if (pageIdx >= 0) switchToPage(pageIdx); }} className={`block w-full truncate rounded text-left text-xs ${currentPage?.id === page.id ? 'bg-[hsl(var(--primary)/.15)] px-2 py-1 font-semibold text-[hsl(var(--primary))]' : 'px-2 py-0.5 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]'}`}>
                        {page.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );})}
            {!sectionsCollapsed && unsectionedPages().length > 0 && (
              <div className="rounded-lg border border-dashed border-[hsl(var(--border))] p-2">
                <p className="mb-1 text-[11.5px] font-semibold text-[hsl(var(--muted-foreground))]">Unsectioned pages</p>
                <div className="space-y-1">
                  {unsectionedPages().map((page) => (
                    <button key={page.id} type="button" onClick={() => { const pageIdx = note!.pages.findIndex(p => p.id === page.id); if (pageIdx >= 0) switchToPage(pageIdx); }} className={`block w-full truncate rounded text-left text-xs ${currentPage?.id === page.id ? 'bg-[hsl(var(--primary)/.15)] px-2 py-1 font-semibold text-[hsl(var(--primary))]' : 'px-2 py-0.5 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]'}`}>
                      {page.title}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          </div>
        </div>
      )}
      {templateMenuOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[hsl(30_20%_15%/.45)] p-4 backdrop-blur-sm" data-testid="modal-templates" onClick={() => setTemplateMenuOpen(false)}>
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-[0_28px_70px_hsl(30_20%_15%/.35)]" onClick={(event) => event.stopPropagation()}>
            <div className="flex shrink-0 items-center justify-between border-b border-[hsl(var(--border))] px-5 py-4">
              <h2 className="font-serif text-lg font-semibold">Diagram / marker</h2>
              <button type="button" onClick={() => setTemplateMenuOpen(false)} aria-label="Close" title="Close" className="flex h-8 w-8 items-center justify-center rounded-lg text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]" data-testid="button-close-templates"><X size={16} /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
              <p className="mb-2.5 font-mono text-[11px] uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))]">Diagrams</p>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {[
                  ['flowchart', 'Flowchart'], ['process-diagram', 'Process'], ['org-chart', 'Org chart'], ['tree-diagram', 'Tree'],
                  ['timeline', 'Timeline'], ['cycle-diagram', 'Cycle'], ['venn-diagram', 'Venn'], ['funnel', 'Funnel'],
                  ['pyramid', 'Pyramid'], ['sequence-diagram', 'Sequence'], ['kanban-board', 'Kanban'], ['timeline-cards', 'Cards'],
                ].map(([kind, name]) => (
                  <button key={kind} type="button" title={name} onClick={() => insertTemplate(kind)} className="flex flex-col items-center gap-2 rounded-2xl bg-[hsl(var(--muted))] p-3 transition-shadow hover:ring-2 hover:ring-[hsl(var(--primary)/.35)]" data-testid={`button-template-${kind}`}>
                    <span className="block h-16 w-16"><TemplatePreviewSwatch kind={kind} /></span>
                    <span className="max-w-full truncate text-xs font-medium leading-tight text-[hsl(var(--muted-foreground))]">{name}</span>
                  </button>
                ))}
              </div>
              <p className="mb-2.5 mt-5 font-mono text-[11px] uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))]">Markers & annotations</p>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {[
                  ['number-marker', 'Number'], ['letter-marker', 'Letter'], ['comment-bubble', 'Comment'],
                  ['circle-highlight', 'Circle'], ['rectangle-highlight', 'Rect'], ['dimension-line', 'Dimension'],
                  ['underline', 'Underline'],
                ].map(([kind, name]) => (
                  <button key={kind} type="button" title={name} onClick={() => insertTemplate(kind)} className="flex flex-col items-center gap-2 rounded-2xl bg-[hsl(var(--muted))] p-3 transition-shadow hover:ring-2 hover:ring-[hsl(var(--primary)/.35)]" data-testid={`button-template-${kind}`}>
                    <span className="block h-16 w-16"><TemplatePreviewSwatch kind={kind} /></span>
                    <span className="max-w-full truncate text-xs font-medium leading-tight text-[hsl(var(--muted-foreground))]">{name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
         {zenMode && <div className="absolute inset-y-0 left-0 z-20 w-3" onMouseEnter={() => setZenHoverLeft(true)} />}
         <aside onMouseEnter={() => zenMode && setZenHoverLeft(true)} onMouseLeave={() => zenMode && setZenHoverLeft(false)}
           className={zenMode
             ? `absolute left-3 top-24 z-30 flex w-[118px] flex-col items-center rounded-2xl bg-[hsl(var(--card)/.96)] px-3 py-5 backdrop-blur-sm elev-3 transition-all duration-300 ${zenHoverLeft ? 'translate-x-0 opacity-100 pointer-events-auto' : '-translate-x-[140%] opacity-0 pointer-events-none'}`
             : 'relative z-10 flex w-[118px] shrink-0 flex-col items-center border-r border-[hsl(var(--border))] bg-[hsl(var(--card)/.7)] px-3 py-5 backdrop-blur-sm transition-opacity duration-300'}>
           <div className="flex w-full flex-col gap-2">
             <div className="relative">
               <ToolButton label="+ Add" onClick={() => setAddMenuOpen((value) => !value)} active={addMenuOpen} testId="button-add" icon={<Plus size={16} />} />
               <input ref={imageInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" data-testid="input-image-upload" />
               <input ref={attachImageInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" data-testid="input-attach-image-upload" />
               {addMenuOpen && <div className="absolute left-[calc(100%+10px)] top-0 z-30 max-h-[min(80vh,560px)] w-44 overflow-y-auto overscroll-contain rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-2 shadow-[0_16px_30px_hsl(30_20%_40%/.14)]" data-testid="menu-add">
                 <p className="px-2 pb-1.5 pt-1 font-mono text-[11px] uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))]">Add to canvas</p>
                 <button type="button" onClick={() => beginPlacement('text')} className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-xs font-semibold hover:bg-[hsl(var(--muted))]"><FileText size={15} /> Text note</button>
                 <button type="button" onClick={() => beginPlacement('formula')} className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-xs font-semibold hover:bg-[hsl(var(--muted))]"><Sigma size={15} /> Math formula</button>
                 <button type="button" onClick={() => imageInputRef.current?.click()} className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-xs font-semibold hover:bg-[hsl(var(--muted))]"><ImageIcon size={15} /> Image</button>
                 <button type="button" onClick={() => beginPlacement('table')} className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-xs font-semibold hover:bg-[hsl(var(--muted))]"><Table2 size={15} /> Table</button>
                 <button type="button" onClick={() => setShapeMenuOpen((value) => !value)} className={`flex w-full items-center justify-between gap-2 rounded-xl px-2 py-2 text-left text-xs font-semibold hover:bg-[hsl(var(--muted))] ${shapeMenuOpen ? 'bg-[hsl(var(--muted))]' : ''}`}><span className="flex items-center gap-2"><Shapes size={15} /> Shape</span><ChevronRight size={13} /></button>
                 {shapeMenuOpen && <div className="mt-1 grid grid-cols-4 gap-1.5 rounded-xl bg-[hsl(var(--muted))] p-2" data-testid="menu-shape-kinds">
                   {SHAPE_KINDS.map((kind) => (
                     <button key={kind.value} type="button" title={kind.label} onClick={() => beginPlacement('shape', defaultShapeContent(kind.value), { shapeKind: kind.value, ...shapeInsertSizeOverride(kind.value) })} className="flex h-9 w-9 items-center justify-center rounded-lg bg-[hsl(var(--card))] hover:ring-2 hover:ring-[hsl(var(--primary)/.35)]" data-testid={`button-shapekind-${kind.value}`}>
                       <span className="block h-5 w-5"><ShapePreviewSwatch kind={kind.value} /></span>
                     </button>
                   ))}
                 </div>}
                 <button type="button" onClick={() => { setTemplateMenuOpen(true); setAddMenuOpen(false); setShapeMenuOpen(false); }} className="flex w-full items-center justify-between gap-2 rounded-xl px-2 py-2 text-left text-xs font-semibold hover:bg-[hsl(var(--muted))]"><span className="flex items-center gap-2"><Grid2X2 size={15} /> Diagram / marker</span><ChevronRight size={13} /></button>
                 <button type="button" onClick={() => beginPlacement('chart')} className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-xs font-semibold hover:bg-[hsl(var(--muted))]"><BarChart3 size={15} /> Chart</button>
                 <button type="button" onClick={() => beginPlacement('checklist')} className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-xs font-semibold hover:bg-[hsl(var(--muted))]"><ListChecks size={15} /> Checklist</button>
                 <button type="button" onClick={() => beginPlacement('code')} className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-xs font-semibold hover:bg-[hsl(var(--muted))]"><Code2 size={15} /> Code block</button>
                 <button type="button" onClick={() => beginPlacement('flashcard')} className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-xs font-semibold hover:bg-[hsl(var(--muted))]"><FileText size={15} /> Flashcard</button>
               </div>}
             </div>
             <ToolButton label="Select" onClick={() => { setTool('select'); setConnectStart(null); }} active={tool === 'select'} testId="button-select" icon={<MousePointer2 size={16} />} />
             <ToolButton label="Hand" onClick={() => { setTool((value) => value === 'pan' ? 'select' : 'pan'); setConnectStart(null); }} active={tool === 'pan'} testId="button-hand" icon={<Hand size={16} />} />
             <div className="relative">
               <ToolButton label="Draw" onClick={() => { setTool((value) => value === 'draw' ? 'select' : 'draw'); setConnectStart(null); }} active={tool === 'draw'} testId="button-draw" icon={<Pencil size={16} />} />
               {tool === 'draw' && <div className="absolute left-[calc(100%+10px)] top-0 z-30 w-44 space-y-2 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-2 shadow-[0_16px_30px_hsl(30_20%_40%/.14)]" data-testid="popover-draw">
                 <p className="px-1 pb-0.5 font-mono text-[10px] uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))]">Draw</p>
                 <div className="flex gap-1 rounded-xl bg-[hsl(var(--muted))] p-1" data-testid="select-draw-texture">
                   {(['pen', 'pencil', 'brush'] as const).map((texture) => (
                     <button key={texture} type="button" onClick={() => setDrawTexture(texture)} className={`flex-1 rounded-lg px-1 py-1 text-[11px] font-semibold capitalize ${drawTexture === texture ? 'bg-[hsl(var(--primary)/.2)] text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))]'}`} data-testid={`button-texture-${texture}`}>{texture}</button>
                   ))}
                 </div>
                 {strokeControls}
               </div>}
             </div>
             <div className="relative">
               <ToolButton label="Line" onClick={() => setTool((value) => value === 'line' ? 'select' : 'line')} active={tool === 'line'} testId="button-line" icon={<Minus size={16} />} />
               {tool === 'line' && <div className="absolute left-[calc(100%+10px)] top-0 z-30 w-44 space-y-2 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-2 shadow-[0_16px_30px_hsl(30_20%_40%/.14)]" data-testid="popover-line">
                 <p className="px-1 pb-0.5 font-mono text-[10px] uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))]">Line</p>
                 {strokeControls}
               </div>}
             </div>
             <div className="relative">
               <ToolButton label="Arrow" onClick={() => setTool((value) => value === 'arrow' ? 'select' : 'arrow')} active={tool === 'arrow'} testId="button-arrow" icon={<ArrowRight size={16} />} />
               {tool === 'arrow' && <div className="absolute left-[calc(100%+10px)] top-0 z-30 w-44 space-y-2 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-2 shadow-[0_16px_30px_hsl(30_20%_40%/.14)]" data-testid="popover-arrow">
                 <p className="px-1 pb-0.5 font-mono text-[10px] uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))]">Arrow</p>
                 <label className="flex items-center gap-1.5 rounded-xl bg-[hsl(var(--muted))] px-2 py-1.5 text-[11px] font-semibold text-[hsl(var(--muted-foreground))]"><input type="checkbox" checked={arrowBothEnds} onChange={(event) => setArrowBothEnds(event.target.checked)} className="h-3 w-3 accent-[hsl(var(--primary))]" data-testid="checkbox-arrow-both-ends" />Both ends</label>
                 {strokeControls}
               </div>}
             </div>
             <div className="relative">
               <ToolButton label="Marker" onClick={() => setTool((value) => value === 'highlight' ? 'select' : 'highlight')} active={tool === 'highlight'} testId="button-highlight" icon={<Highlighter size={16} />} />
               {tool === 'highlight' && <div className="absolute left-[calc(100%+10px)] top-0 z-30 w-44 space-y-2 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-2 shadow-[0_16px_30px_hsl(30_20%_40%/.14)]" data-testid="popover-marker">
                 <p className="px-1 pb-0.5 font-mono text-[10px] uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))]">Marker</p>
                 {strokeControls}
               </div>}
             </div>
             <ToolButton label="Erase" onClick={() => setTool((value) => value === 'eraser' ? 'select' : 'eraser')} active={tool === 'eraser'} testId="button-eraser" icon={<Eraser size={16} />} />
             <ToolButton label="Connect" onClick={() => { setTool((value) => value === 'connect' ? 'select' : 'connect'); setConnectStart(null); }} active={tool === 'connect'} testId="button-connect" icon={<Link2 size={16} />} />
             <button type="button" onClick={() => setSnapEnabled((value) => !value)} className={`mt-1 rounded-lg px-2 py-1 text-[11px] font-semibold ${snapEnabled ? 'bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))]'}`} data-testid="button-toggle-snap">Snap {snapEnabled ? 'on' : 'off'}</button>
           </div>
           <div className="mt-auto flex flex-col items-center gap-2 pt-8 text-[11.5px] text-[hsl(var(--muted-foreground))]">
             <MousePointer2 size={15} />
             <span className="text-center leading-4">{tool === 'draw' ? 'Draw freely' : tool === 'eraser' ? 'Erase strokes' : tool === 'connect' ? (connectStart ? 'Choose another piece' : 'Link two pieces') : tool === 'pan' ? 'H drag to move canvas' : tool === 'select' ? 'V select · drag marquee' : 'Select and move'}</span>
             <span className="text-center font-mono text-[8px] leading-3 opacity-70">V P L A E C T</span>
           </div>
        </aside>
         <section ref={surfaceRef} className={`relative min-w-0 flex-1 overflow-hidden ${pendingPlacement ? 'cursor-crosshair' : isSpacePressed || tool === 'pan' ? (isInteractingWithCanvas ? 'cursor-grabbing' : 'cursor-grab') : tool === 'draw' || tool === 'line' || tool === 'arrow' || tool === 'eraser' || tool === 'highlight' ? 'cursor-crosshair' : tool === 'connect' ? 'cursor-cell' : 'cursor-default'} ${gridStyle === 'dots' ? 'dot-grid' : gridStyle === 'squared' ? 'grid-squared' : 'grid-none'} ${isInteractingWithCanvas ? 'canvas-moving' : ''}`}
           // touch-action: none stops the browser's own pinch-to-zoom/pan gesture from firing on
           // this element at all, so only our own wheel/gesture handlers (which zoom just the
           // canvas transform, not the page) ever respond to a trackpad pinch. Without this the
           // OS/browser can zoom the whole page — including the fixed toolbar and side panels —
           // at the same time our JS zooms the canvas, which is the "panels move/distort" bug.
           style={{ touchAction: 'none', overscrollBehavior: 'contain' }}
           onPointerDown={startPan} onPointerMove={movePointer} onPointerUp={endPointer} onPointerCancel={endPointer} onWheel={handleWheel} onContextMenu={(event) => { event.preventDefault(); setContextMenu({ x: event.clientX, y: event.clientY, objectId: selectedId ?? undefined }); }} data-testid="canvas-surface">
          {selected && (
            <div className="absolute left-1/2 top-4 z-20 flex -translate-x-1/2 items-center gap-1 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card)/.95)] p-1.5 shadow-sm backdrop-blur-md" data-testid="contextual-toolbar">
              <button type="button" title="Bring forward" onClick={() => bringObject(selected.id, 'forward')} className="rounded-lg px-2 py-1 text-[11.5px] font-semibold hover:bg-[hsl(var(--muted))]">Forward</button>
              <button type="button" title="Send backward" onClick={() => bringObject(selected.id, 'backward')} className="rounded-lg px-2 py-1 text-[11.5px] font-semibold hover:bg-[hsl(var(--muted))]">Back</button>
              <button type="button" title={selected.locked ? 'Unlock' : 'Lock'} onClick={() => updateObject(selected.id, { locked: !selected.locked })} className="rounded-lg px-2 py-1 text-[11.5px] font-semibold hover:bg-[hsl(var(--muted))]">{selected.locked ? 'Unlock' : 'Lock'}</button>
              <button type="button" title="Delete" onClick={deleteSelectedObject} className="rounded-lg px-2 py-1 text-[11.5px] font-semibold text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive)/.1)]">Delete</button>
            </div>
          )}
          <div className="absolute left-1/2 top-1/2 h-0 w-0 transition-transform duration-100 ease-out" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
             {currentPage?.objects.filter((object) => !collapsedHiddenIds.has(object.id)).map((object) => {
               // Line-attached objects (parentConnectorId set) are positioned live from their
               // connector's current endpoints instead of their own x/y — see resolveObjectRect.
               // This is the one line that makes an attached component "move when the line moves"
               // and "follow the line when its endpoints move" (section 2/3 of the brief): it's
               // re-derived on every render, not cached, so it's always in sync.
               const pos = resolveObjectRect(object, currentPage?.connections ?? [], currentPage?.objects ?? []);
               return (
               <div key={object.id} className={`canvas-object absolute flex items-center justify-center overflow-hidden text-center shadow-[0_8px_18px_hsl(30_20%_40%/.11)] transition-shadow ${object.id === lastAddedId ? 'animate-pop' : ''} ${deletingIds.has(object.id) ? 'animate-delete' : ''} ${(selectedId === object.id || selectedIds.includes(object.id)) ? 'ring-2 ring-[hsl(var(--accent))] ring-offset-4 ring-offset-[hsl(var(--background))] shadow-[0_2px_4px_hsl(210_20%_25%/.07),0_12px_28px_hsl(183_30%_25%/.16)]' : 'hover:shadow-[0_12px_22px_hsl(30_20%_40%/.17)]'} ${object.type === 'text' ? 'sticky-note' : object.type === 'shape' ? 'rounded-2xl' : 'rounded-xl'} ${object.locked ? 'opacity-90' : ''} ${object.parentConnectorId ? 'ring-1 ring-[hsl(var(--accent)/.4)]' : ''}`}
                 style={{ left: pos.x, top: pos.y, width: object.width, height: object.height, zIndex: object.zIndex, backgroundColor: (object.shapeKind === 'frame' || object.shapeKind === 'ui-divider' || object.shapeKind === 'cube' || object.shapeKind === 'box-3d') ? 'transparent' : object.fill, color: object.color, transform: `rotate(${object.rotation}deg)`, clipPath: object.type === 'shape' ? shapeClipPath(object.shapeKind) : undefined, boxShadow: (object.shapeKind === 'frame' || object.shapeKind === 'cube' || object.shapeKind === 'box-3d') ? 'none' : undefined }} onPointerDown={(event) => startObjectDrag(event, object)} onDoubleClick={() => object.type !== 'image' && !object.locked && setEditingObjectId(object.id)} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); setSelectedId(object.id); setSelectedIds([object.id]); setContextMenu({ x: event.clientX, y: event.clientY, objectId: object.id }); }} data-testid={`canvas-object-${object.id}`}>
                 <CanvasObjectContent object={object} editing={editingObjectId === object.id} onUpdate={updateObject} onBlur={() => setEditingObjectId(null)} />
                 {object.locked && <Lock size={13} className="absolute left-1.5 top-1.5 opacity-40" style={{ color: object.color }} aria-hidden="true" />}
                 {selectedId === object.id && <span className="absolute -right-2 -top-2 h-3 w-3 rounded-full border-2 border-[hsl(var(--background))] bg-[hsl(var(--accent))]" />}
                 {selectedId === object.id && !object.locked && (
                   <button type="button" aria-label="Rotate" title="Rotate" onPointerDown={(event) => startRotate(event, object)} className="absolute -top-5 left-1/2 z-20 h-3.5 w-3.5 -translate-x-1/2 cursor-grab rounded-full border-2 border-[hsl(var(--background))] bg-[hsl(var(--primary))]" data-testid="handle-rotate" />
                 )}
                 {selectedId === object.id && !object.locked && (['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as ResizeHandle[]).map((handle) => {
                   const { style, cursor } = resizeHandleStyle(handle);
                   return (
                     <button
                       key={handle}
                       type="button"
                       aria-label={`Resize ${handle}`}
                       title="Resize"
                       onPointerDown={(event) => startResize(event, object, handle)}
                       className="absolute z-20 h-2.5 w-2.5 rounded-sm border-2 border-[hsl(var(--background))] bg-[hsl(var(--primary))]"
                       style={{ ...style, cursor }}
                       data-testid={`handle-resize-${handle}-${object.id}`}
                     />
                   );
                 })}
                 {(currentPage?.connections ?? []).some((connection) => connection.from === object.id) && (
                   <button type="button" aria-label={object.collapsed ? 'Expand children' : 'Collapse children'} title={object.collapsed ? 'Expand children' : 'Collapse children'} onClick={(event) => { event.stopPropagation(); updateObject(object.id, { collapsed: !object.collapsed }); }} onPointerDown={(event) => event.stopPropagation()} className="absolute -bottom-3 left-1/2 z-20 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full border-2 border-[hsl(var(--background))] bg-[hsl(var(--primary))] text-[11px] font-bold leading-none text-white" data-testid={`button-collapse-${object.id}`}>
                     {object.collapsed ? '+' : '\u2212'}
                   </button>
                 )}
                 {object.link && (
                   <button
                     type="button"
                     aria-label="Follow link (hover to preview)"
                     title="Follow link"
                     onClick={(event) => { event.stopPropagation(); setLinkPreview(null); followLink(object.link!); }}
                     onPointerDown={(event) => event.stopPropagation()}
                     onMouseEnter={(event) => scheduleShowLinkPreview(object.link!, event.currentTarget)}
                     onMouseLeave={scheduleHideLinkPreview}
                     onFocus={(event) => scheduleShowLinkPreview(object.link!, event.currentTarget)}
                     onBlur={scheduleHideLinkPreview}
                     className="absolute -bottom-2 -right-2 z-20 flex h-5 w-5 items-center justify-center rounded-full border-2 border-[hsl(var(--background))] bg-[hsl(var(--accent))] text-white"
                     data-testid={`button-follow-link-${object.id}`}
                   >
                     <Link2 size={11} />
                   </button>
                 )}
               </div>
               );
             })}
             {pendingPlacement && placementPreviewPoint && (() => {
               const previewWidth = (pendingPlacement.extra?.width ?? OBJECT_DEFAULTS[pendingPlacement.type].width ?? 200) as number;
               const previewHeight = (pendingPlacement.extra?.height ?? OBJECT_DEFAULTS[pendingPlacement.type].height ?? 120) as number;
               return (
                 <div
                   className="pointer-events-none absolute rounded-xl border-2 border-dashed opacity-70"
                   style={{ left: placementPreviewPoint.x - previewWidth / 2, top: placementPreviewPoint.y - previewHeight / 2, width: previewWidth, height: previewHeight, borderColor: 'hsl(var(--primary))', backgroundColor: 'hsl(var(--primary) / .08)', zIndex: 9999 }}
                   data-testid="placement-preview"
                 />
               );
             })()}
<svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width="1" height="1" style={{ zIndex: 10000 }}>
                {(currentPage?.connections ?? []).filter((connection) => !collapsedHiddenIds.has(connection.from) && !collapsedHiddenIds.has(connection.to)).map((connection) => {
                  const from = currentPage?.objects.find((object) => object.id === connection.from);
                  const to = currentPage?.objects.find((object) => object.id === connection.to);
                  if (!from || !to) return null;
                  const path = getConnectionPath(connection, from, to);
                  const strokeColor = connection.strokeColor ?? 'hsl(var(--primary) / .45)';
                  const strokeWidth = connection.strokeWidth ?? 2;
                  const strokeDasharray = connection.strokeDasharray ?? '7 7';
                  const labelPos = getLabelPosition(connection, from, to);
                  const isSelected = selectedConnectionId === connection.id;
                  const selectConnection = (event: React.PointerEvent<SVGElement>) => { event.stopPropagation(); setSelectedConnectionId(connection.id); setSelectedId(null); setSelectedStrokeId(null); };
                  return (
                    <g key={connection.id} className="pointer-events-auto cursor-pointer" onPointerDown={selectConnection}>
                      {/* Invisible wide hit target: a solid, transparent-stroked copy of the same
                          path, stroked much thicker than the visible line and with no dasharray.
                          Dashes leave most of the path empty of pixels, so clicking the visible
                          line alone means aiming for a few-pixel dash; this gives a generous,
                          zoom-consistent click area (in canvas units, so it scales with zoom like
                          everything else) without changing how the line looks. */}
                      <path d={path} fill="none" stroke="transparent" strokeWidth={Math.max(20, strokeWidth + 16)} strokeLinecap="round" strokeLinejoin="round" />
                      <path d={path} fill="none" stroke={strokeColor} strokeWidth={strokeWidth + (isSelected ? 2 : 0)} strokeDasharray={strokeDasharray} strokeLinecap="round" strokeLinejoin="round" className={connection.id === justConnectedId ? 'connection-settle' : undefined} style={isSelected ? { filter: 'drop-shadow(0 0 4px hsl(var(--accent)))' } : undefined} />
                      {getArrowheadPath(connection, from, to, false)}
                      {connection.arrowhead === 'both' && getArrowheadPath(connection, from, to, true)}
                      {connection.label && (() => {
                        const onLineAnchor = getLabelPosition({ ...connection, labelPerpendicularOffset: 0 }, from, to);
                        const isOffLine = Math.abs(connection.labelPerpendicularOffset ?? 0) > 0.5;
                        return (
                          <g>
                            {/* When the label has been dragged off the line, a thin leader connects it back to
                                the point on the line it's anchored to — otherwise a moved label reads as
                                disconnected from its connector. */}
                            {isOffLine && <line x1={onLineAnchor.x} y1={onLineAnchor.y} x2={labelPos.x} y2={labelPos.y} stroke={strokeColor} strokeWidth={1} strokeDasharray="2 2" opacity={0.6} pointerEvents="none" />}
                            {/* A transparent, generously-sized rect under the text gives the label a real
                                grab target (text glyphs alone are a poor hit area) and is how the user pulls
                                the label away from the line per requirement #4. */}
                            <rect x={labelPos.x - 40} y={labelPos.y - 22} width={80} height={20} fill="transparent" className="cursor-grab" onPointerDown={(event) => startLabelDrag(event, connection, from, to)} data-testid={`handle-connection-label-${connection.id}`} />
                            <text x={labelPos.x} y={labelPos.y - 8} textAnchor="middle" dominantBaseline="alphabetic" fontSize="11" fill={strokeColor} fontWeight="500" pointerEvents="none">
                              {connection.label}
                            </text>
                          </g>
                        );
                      })()}
                      {/* "+" to attach a real component to this connector (section 2 of the brief) —
                          only shown while the connector is selected, same as the label's grab handle.
                          Offset off the line (like an off-line label) so it doesn't sit on top of the
                          connector's own text label when both are present. */}
                      {isSelected && (() => {
                        const anchor = getLabelPosition({ ...connection, labelPositionAlongLine: 0.5, labelPerpendicularOffset: -34 }, from, to);
                        const menuOpen = attachMenuConnectionId === connection.id;
                        return (
                          <foreignObject x={anchor.x - 14} y={anchor.y - 14} width={menuOpen ? 220 : 28} height={menuOpen ? 260 : 28} style={{ overflow: 'visible' }}>
                            <div className="pointer-events-auto">
                              <button
                                type="button"
                                aria-label="Attach component to line"
                                title="Attach component to line"
                                onPointerDown={(event) => event.stopPropagation()}
                                onClick={(event) => { event.stopPropagation(); setAttachMenuConnectionId((current) => current === connection.id ? null : connection.id); }}
                                className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[hsl(var(--background))] bg-[hsl(var(--primary))] text-white shadow-sm"
                                data-testid={`button-attach-${connection.id}`}
                              >
                                <Plus size={14} />
                              </button>
                              {menuOpen && (
                                <div className="mt-1 w-44 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-2 shadow-[0_16px_30px_hsl(30_20%_40%/.14)]" onPointerDown={(event) => event.stopPropagation()} data-testid={`menu-attach-${connection.id}`}>
                                  <p className="px-2 pb-1.5 pt-1 font-mono text-[11px] uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))]">Attach to line</p>
                                  <button type="button" onClick={() => attachObjectToConnection(connection.id, 'text')} className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-xs font-semibold hover:bg-[hsl(var(--muted))]"><FileText size={15} /> Text</button>
                                  <button type="button" onClick={() => attachObjectToConnection(connection.id, 'formula')} className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-xs font-semibold hover:bg-[hsl(var(--muted))]"><Sigma size={15} /> Math</button>
                                  <button type="button" onClick={() => startAttachedImageUpload(connection.id)} className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-xs font-semibold hover:bg-[hsl(var(--muted))]"><ImageIcon size={15} /> Image</button>
                                  <button type="button" onClick={() => attachObjectToConnection(connection.id, 'shape', defaultShapeContent('rounded-rectangle'), { shapeKind: 'rounded-rectangle', ...shapeInsertSizeOverride('rounded-rectangle') })} className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-xs font-semibold hover:bg-[hsl(var(--muted))]"><Shapes size={15} /> Shape</button>
                                  <button type="button" onClick={() => attachObjectToConnection(connection.id, 'table')} className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-xs font-semibold hover:bg-[hsl(var(--muted))]"><Table2 size={15} /> Table</button>
                                  <button type="button" onClick={() => attachObjectToConnection(connection.id, 'checklist')} className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-xs font-semibold hover:bg-[hsl(var(--muted))]"><ListChecks size={15} /> Checklist</button>
                                </div>
                              )}
                            </div>
                          </foreignObject>
                        );
                      })()}
                    </g>
                  );
                })}
                {tool === 'connect' && connectStart && connectPointer && (() => {
                  const fromObject = currentPage?.objects.find((object) => object.id === connectStart);
                  if (!fromObject) return null;
                  const anchor = getRectEdgePoint(fromObject, connectPointer.x, connectPointer.y);
                  return (
                    <path d={`M ${anchor.x} ${anchor.y} L ${connectPointer.x} ${connectPointer.y}`} fill="none" stroke="hsl(var(--primary) / .55)" strokeWidth={2} strokeDasharray="7 7" strokeLinecap="round" className="connection-draft" data-testid="connection-live-preview" />
                  );
                })()}
                {(currentPage?.strokes ?? []).map((stroke) => {
                 const color = stroke.color ?? 'hsl(var(--primary) / .65)'; const width = stroke.width ?? 4; const active = selectedStrokeId === stroke.id; const dash = stroke.dasharray;
                 const selectStroke = (event: React.PointerEvent<SVGElement>) => {
                   event.stopPropagation();
                   setSelectedStrokeId(stroke.id);
                   setSelectedId(null);
                   pushHistorySnapshot();
                   dragRef.current = { kind: 'stroke', pointerX: event.clientX, pointerY: event.clientY, startX: 0, startY: 0, objectId: stroke.id, strokePoints: stroke.points };
                   (event.currentTarget as SVGElement).setPointerCapture(event.pointerId);
                 };
                 if (stroke.kind === 'rectangle' && stroke.points[1]) { const [a, b] = stroke.points; return <rect key={stroke.id} x={Math.min(a.x, b.x)} y={Math.min(a.y, b.y)} width={Math.abs(b.x - a.x)} height={Math.abs(b.y - a.y)} fill="none" stroke={color} strokeWidth={width} strokeDasharray={dash} className="pointer-events-auto cursor-pointer" onPointerDown={selectStroke} />; }
                 if (stroke.kind === 'circle' && stroke.points[0] && stroke.points[1]) { const [center, radiusPoint] = stroke.points; return <circle key={stroke.id} cx={center.x} cy={center.y} r={radiusPoint.x} fill="none" stroke={color} strokeWidth={width} strokeDasharray={dash} className="pointer-events-auto cursor-pointer" onPointerDown={selectStroke} />; }
                 if (stroke.kind === 'ellipse' && stroke.points[1]) { const [a, b] = stroke.points; const cx = (a.x + b.x) / 2; const cy = (a.y + b.y) / 2; return <ellipse key={stroke.id} cx={cx} cy={cy} rx={Math.abs(b.x - a.x) / 2} ry={Math.abs(b.y - a.y) / 2} fill="none" stroke={color} strokeWidth={width} strokeDasharray={dash} className="pointer-events-auto cursor-pointer" onPointerDown={selectStroke} />; }
                 if (stroke.kind === 'triangle' && stroke.points.length >= 3) { return <polygon key={stroke.id} points={stroke.points.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke={color} strokeWidth={width} strokeDasharray={dash} className="pointer-events-auto cursor-pointer" onPointerDown={selectStroke} />; }
                 const points = stroke.points.map((point) => `${point.x},${point.y}`).join(' ');
                 const end = stroke.points[stroke.points.length - 1]; const beforeEnd = stroke.points[Math.max(0, stroke.points.length - 2)]; const angle = Math.atan2(end.y - beforeEnd.y, end.x - beforeEnd.x); const arrow = stroke.kind === 'arrow' ? `${end.x},${end.y} ${end.x - 12 * Math.cos(angle - .45)},${end.y - 12 * Math.sin(angle - .45)} ${end.x - 12 * Math.cos(angle + .45)},${end.y - 12 * Math.sin(angle + .45)}` : undefined;
                 const start = stroke.points[0]; const afterStart = stroke.points[Math.min(stroke.points.length - 1, 1)]; const startAngle = Math.atan2(start.y - afterStart.y, start.x - afterStart.x);
                 const startArrow = stroke.kind === 'arrow' && stroke.bothEnds ? `${start.x},${start.y} ${start.x - 12 * Math.cos(startAngle - .45)},${start.y - 12 * Math.sin(startAngle - .45)} ${start.x - 12 * Math.cos(startAngle + .45)},${start.y - 12 * Math.sin(startAngle + .45)}` : undefined;
                 const strokeOpacity = stroke.textureKind === 'highlight' ? 0.38 : stroke.textureKind === 'pencil' ? 0.7 : 1;
                 return <g key={stroke.id} className="pointer-events-auto cursor-pointer" onPointerDown={selectStroke}><polyline points={points} fill="none" stroke={color} strokeWidth={width} strokeDasharray={dash} strokeLinecap={stroke.textureKind === 'highlight' ? 'square' : 'round'} strokeLinejoin="round" opacity={strokeOpacity} style={active ? { filter: 'drop-shadow(0 0 3px hsl(var(--accent)))' } : undefined} />{arrow && <polygon points={arrow} fill={color} opacity={strokeOpacity} />}{startArrow && <polygon points={startArrow} fill={color} opacity={strokeOpacity} />}</g>;
               })}
               {drawPoints.length > 1 && <polyline points={drawPoints.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke={strokeColor} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />}
               {marquee && <rect x={marquee.x} y={marquee.y} width={marquee.width} height={marquee.height} fill="hsl(var(--ring) / .12)" stroke="hsl(var(--ring) / .65)" strokeWidth={1 / zoom} />}
             </svg>
          </div>
          {(currentPage?.objects.length ?? 0) === 0 && <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center"><div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]"><Sparkles size={23} /></div><p className="font-serif text-2xl">Start with one thought</p><p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">Choose a tool on the left to begin arranging.</p></div>}
          {contextMenu && (
            <div className="fixed z-50 min-w-40 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-1.5 shadow-lg" style={{ left: contextMenu.x, top: contextMenu.y }} data-testid="context-menu">
              {contextMenu.objectId ? (
                <>
                  <button type="button" className="block w-full rounded-lg px-3 py-1.5 text-left text-xs hover:bg-[hsl(var(--muted))]" onClick={() => { bringObject(contextMenu.objectId!, 'forward'); setContextMenu(null); }}>Bring forward</button>
                  <button type="button" className="block w-full rounded-lg px-3 py-1.5 text-left text-xs hover:bg-[hsl(var(--muted))]" onClick={() => { bringObject(contextMenu.objectId!, 'backward'); setContextMenu(null); }}>Send backward</button>
                  <button type="button" className="block w-full rounded-lg px-3 py-1.5 text-left text-xs hover:bg-[hsl(var(--muted))]" onClick={() => { bringObject(contextMenu.objectId!, 'front'); setContextMenu(null); }}>Bring to front</button>
                  <button type="button" className="block w-full rounded-lg px-3 py-1.5 text-left text-xs hover:bg-[hsl(var(--muted))]" onClick={() => { bringObject(contextMenu.objectId!, 'back'); setContextMenu(null); }}>Send to back</button>
                  <button type="button" className="block w-full rounded-lg px-3 py-1.5 text-left text-xs hover:bg-[hsl(var(--muted))]" onClick={() => { const obj = currentPage?.objects.find((o) => o.id === contextMenu.objectId); if (obj) updateObject(obj.id, { locked: !obj.locked }); setContextMenu(null); }}>{currentPage?.objects.find((o) => o.id === contextMenu.objectId)?.locked ? 'Unlock' : 'Lock'}</button>
                  <button type="button" className="block w-full rounded-lg px-3 py-1.5 text-left text-xs text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive)/.08)]" onClick={() => { const objectId = contextMenu.objectId!; requestDeleteObjects([objectId]); setSelectedId(null); setSelectedIds([]); setContextMenu(null); }}>Delete</button>
                </>
              ) : (
                <>
                  <button type="button" className="block w-full rounded-lg px-3 py-1.5 text-left text-xs hover:bg-[hsl(var(--muted))]" onClick={() => { beginPlacement('text'); setContextMenu(null); }}>Add text</button>
                  <button type="button" className="block w-full rounded-lg px-3 py-1.5 text-left text-xs hover:bg-[hsl(var(--muted))]" onClick={() => { setTool('draw'); setContextMenu(null); }}>Draw</button>
                  <button type="button" className="block w-full rounded-lg px-3 py-1.5 text-left text-xs hover:bg-[hsl(var(--muted))]" onClick={() => { setSnapEnabled((v) => !v); setContextMenu(null); }}>Toggle snap</button>
                </>
              )}
            </div>
          )}
          <div className="absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card)/.9)] p-1.5 shadow-[0_8px_20px_hsl(30_20%_40%/.09)] backdrop-blur-md">
            <IconButton label="Zoom out" onClick={() => zoomAtPoint((surfaceRef.current?.getBoundingClientRect().left ?? 0) + (surfaceRef.current?.getBoundingClientRect().width ?? 0) / 2, (surfaceRef.current?.getBoundingClientRect().top ?? 0) + (surfaceRef.current?.getBoundingClientRect().height ?? 0) / 2, zoom / 1.25)} testId="button-zoom-out"><Minus size={15} /></IconButton>
            <button type="button" onClick={resetView} className="min-w-12 rounded-lg px-1 py-2 font-mono text-[11.5px] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]" data-testid="button-reset-view">{formatZoomLabel(zoom)}</button>
            <IconButton label="Zoom in" onClick={() => zoomAtPoint((surfaceRef.current?.getBoundingClientRect().left ?? 0) + (surfaceRef.current?.getBoundingClientRect().width ?? 0) / 2, (surfaceRef.current?.getBoundingClientRect().top ?? 0) + (surfaceRef.current?.getBoundingClientRect().height ?? 0) / 2, zoom * 1.25)} testId="button-zoom-in"><ZoomIn size={15} /></IconButton>
            <div className="mx-1 h-5 w-px bg-[hsl(var(--border))]" />
            <IconButton label="Fit canvas" onClick={resetView} testId="button-fit-canvas"><Maximize2 size={15} /></IconButton>
            <div className="mx-1 h-5 w-px bg-[hsl(var(--border))]" />
            <div className="relative">
              <IconButton label="Grid style" onClick={() => setGridMenuOpen((value) => !value)} active={gridMenuOpen} testId="button-grid-style"><Grid3X3 size={15} /></IconButton>
              {gridMenuOpen && (
                <div className="absolute bottom-full left-1/2 z-20 mb-2 w-32 -translate-x-1/2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-1.5 shadow-lg" data-testid="menu-grid-style">
                  {([['dots', 'Dots'], ['squared', 'Squared'], ['none', 'None']] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => { setGridStyle(value); setGridMenuOpen(false); }}
                      className={`block w-full rounded-lg px-3 py-1.5 text-left text-xs ${gridStyle === value ? 'bg-[hsl(var(--primary)/.15)] font-semibold text-[hsl(var(--primary))]' : 'hover:bg-[hsl(var(--muted))]'}`}
                      data-testid={`button-grid-style-${value}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
        {zenMode && (
          <div className="pointer-events-none absolute inset-x-0 bottom-4 z-30 flex items-end justify-between px-4">
            <span className="pointer-events-auto flex items-center gap-2 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card)/.92)] px-3 py-1.5 font-mono text-[11.5px] text-[hsl(var(--muted-foreground))] backdrop-blur-md elev-1" data-testid="status-zen-save">
              <span className={`h-1.5 w-1.5 rounded-full ${syncState === 'synced' ? 'bg-[hsl(var(--ok))]' : 'bg-[hsl(var(--warn))]'}`} />
              {syncState === 'synced' ? 'Saved · local' : saveState}
            </span>
            <button type="button" onClick={() => setZenMode(false)} aria-label="Exit focus mode" title="Exit focus mode (⌘.)" data-testid="button-exit-zen"
              className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card)/.92)] text-[hsl(var(--muted-foreground))] backdrop-blur-md transition-colors hover:text-[hsl(var(--foreground))] elev-1">
              <X size={16} />
            </button>
          </div>
        )}
         {zenMode && <div className="absolute inset-y-0 right-0 z-20 w-3" onMouseEnter={() => setZenHoverRight(true)} />}
         {showInspector && (zenMode
           ? <div onMouseEnter={() => setZenHoverRight(true)} onMouseLeave={() => setZenHoverRight(false)}
               className={`absolute right-3 top-24 z-30 transition-all duration-300 ${zenHoverRight ? 'translate-x-0 opacity-100 pointer-events-auto' : 'translate-x-[140%] opacity-0 pointer-events-none'}`}>
               <Inspector object={selected} stroke={selectedStroke} connection={selectedConnection} pages={note.pages} onUpdate={updateObject} onUpdateStroke={updateStroke} onUpdateConnection={updateConnection} onReplaceImage={replaceImage} onBring={bringObject} onDelete={selected ? deleteSelectedObject : selectedStroke ? deleteSelectedStroke : selectedConnection ? deleteSelectedConnection : undefined} onFollowLink={followLink} floating />
             </div>
           : <Inspector object={selected} stroke={selectedStroke} connection={selectedConnection} pages={note.pages} onUpdate={updateObject} onUpdateStroke={updateStroke} onUpdateConnection={updateConnection} onReplaceImage={replaceImage} onBring={bringObject} onDelete={selected ? deleteSelectedObject : selectedStroke ? deleteSelectedStroke : selectedConnection ? deleteSelectedConnection : undefined} onFollowLink={followLink} />
         )}
         {linkPreview && (
           <LinkPreviewPopup
             link={linkPreview.link}
             pages={note.pages}
             anchorRect={linkPreview.anchorRect}
             onOpen={() => { setLinkPreview(null); followLink(linkPreview.link); }}
             onPointerEnter={cancelHideLinkPreview}
             onPointerLeave={scheduleHideLinkPreview}
           />
         )}
      </div>
    </main>
  );
}