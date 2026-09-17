export const MIN_ZOOM = 0.001;
export const MAX_ZOOM = 1000;
export const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
export const formatZoomLabel = (value: number) => {
  const pct = value * 100;
  if (pct >= 100 || pct === 0) return `${Math.round(pct)}%`;
  if (pct >= 10) return `${pct.toFixed(1)}%`;
  if (pct >= 1) return `${pct.toFixed(2)}%`;
  return `${pct.toFixed(3)}%`;
};
