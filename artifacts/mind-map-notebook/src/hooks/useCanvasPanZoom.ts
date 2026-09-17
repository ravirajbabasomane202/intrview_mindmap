import { useEffect, useRef, useState } from 'react';
import { clampZoom } from '../lib/zoom';
import { Point } from '../types/canvas';

/**
 * Owns pan/zoom state for the canvas surface, the space-bar-to-pan keyboard
 * listener, and the client-to-canvas coordinate conversion that depends on
 * both. Extracted verbatim from NoteEditor — `zoomAtPoint`, `resetView`,
 * `handleWheel`, and `canvasPoint` are unchanged in behavior.
 *
 * `surfaceRef` must be attached to the canvas surface element by the caller.
 * `dragRef.current.kind === 'pan'` handling in the pointer-move dispatcher
 * still lives in NoteEditor (it's interleaved with object/draw/marquee drag
 * kinds that this hook doesn't know about) — it just calls the `setPan`
 * returned here.
 */
export function useCanvasPanZoom() {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const surfaceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space' && !isTypingTarget(event.target)) {
        event.preventDefault();
        setIsSpacePressed(true);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') setIsSpacePressed(false);
    };
    const onBlur = () => setIsSpacePressed(false);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  // zoomAtPoint and pan/zoom are read fresh via refs inside the native listener below (see the
  // effect), since a native (non-React) event listener closes over whatever values were in scope
  // when it was attached, not the latest render's state. Keeping a ref in sync avoids re-attaching
  // the listener on every pan/zoom change (which would itself cause jank during a gesture).
  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { panRef.current = pan; }, [pan]);

  const zoomAtPoint = (clientX: number, clientY: number, nextZoom: number) => {
    const bounds = surfaceRef.current?.getBoundingClientRect();
    const clamped = clampZoom(nextZoom);
    if (!bounds) { setZoom(clamped); return; }
    const currentZoom = zoomRef.current;
    const currentPan = panRef.current;
    const mouseOffsetX = clientX - bounds.left - bounds.width / 2 - currentPan.x;
    const mouseOffsetY = clientY - bounds.top - bounds.height / 2 - currentPan.y;
    const ratio = 1 - clamped / currentZoom;
    setPan({ x: currentPan.x + mouseOffsetX * ratio, y: currentPan.y + mouseOffsetY * ratio });
    setZoom(clamped);
  };

  const handleWheel = (event: React.WheelEvent) => {
    event.preventDefault();
    // Trackpad pinch is delivered to the browser as a wheel event with ctrlKey set (Chrome,
    // Firefox, Edge synthesize this for pinch gestures; it's also what ctrl+scroll sends, which
    // we treat the same way). This is the authoritative "the user is pinching" signal — check it
    // before the deltaX/deltaY heuristic below, since a fast pinch can otherwise register a
    // nonzero deltaX and get misread as a pan.
    if (event.ctrlKey) {
      // Pinch deltaY is typically small and comes in a fast burst; a gentler exponent than plain
      // wheel keeps the zoom from jumping/stuttering as those events arrive.
      const factor = Math.exp(-event.deltaY * 0.01);
      zoomAtPoint(event.clientX, event.clientY, zoomRef.current * factor);
      return;
    }
    // Trackpad two-finger swipe (or shift+wheel) pans the view — the most natural gesture
    // for moving around without changing the zoom level.
    if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY) * 1.15) {
      const currentPan = panRef.current;
      setPan({ x: currentPan.x - event.deltaX, y: currentPan.y - event.deltaY });
      return;
    }
    // Plain vertical wheel scroll (real mouse wheel) zooms smoothly, centered on the cursor —
    // scroll up to zoom in, scroll down to zoom out, with no hard min/max (see MIN_ZOOM / MAX_ZOOM).
    const factor = Math.exp(-event.deltaY * 0.0018);
    zoomAtPoint(event.clientX, event.clientY, zoomRef.current * factor);
  };

  // Safari's trackpad pinch does NOT fire ctrlKey wheel events the way Chrome/Firefox do — it
  // fires the non-standard gesturestart/gesturechange/gestureend events instead, which have no
  // React synthetic equivalent and must be bound natively. Left unhandled, Safari falls back to
  // zooming the whole page (toolbar, side panels and all), which is exactly the "panels move or
  // distort while zooming" symptom. We prevent that default and drive the same zoomAtPoint logic
  // off event.scale instead.
  useEffect(() => {
    const node = surfaceRef.current;
    if (!node) return;
    let gestureStartZoom = 1;
    const onGestureStart = (event: any) => {
      event.preventDefault();
      gestureStartZoom = zoomRef.current;
    };
    const onGestureChange = (event: any) => {
      event.preventDefault();
      zoomAtPoint(event.clientX, event.clientY, gestureStartZoom * event.scale);
    };
    const onGestureEnd = (event: any) => { event.preventDefault(); };
    node.addEventListener('gesturestart', onGestureStart as EventListener);
    node.addEventListener('gesturechange', onGestureChange as EventListener);
    node.addEventListener('gestureend', onGestureEnd as EventListener);
    return () => {
      node.removeEventListener('gesturestart', onGestureStart as EventListener);
      node.removeEventListener('gesturechange', onGestureChange as EventListener);
      node.removeEventListener('gestureend', onGestureEnd as EventListener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surfaceRef.current]);

  const canvasPoint = (event: React.PointerEvent): Point => {
    const bounds = surfaceRef.current?.getBoundingClientRect();
    if (!bounds) return { x: 0, y: 0 };
    return {
      x: (event.clientX - bounds.left - bounds.width / 2 - pan.x) / zoom,
      y: (event.clientY - bounds.top - bounds.height / 2 - pan.y) / zoom,
    };
  };

  return {
    zoom, setZoom,
    pan, setPan,
    isSpacePressed,
    surfaceRef,
    resetView,
    zoomAtPoint,
    handleWheel,
    canvasPoint,
  };
}
