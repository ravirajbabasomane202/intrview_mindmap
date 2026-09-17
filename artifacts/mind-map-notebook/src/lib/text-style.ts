import { CanvasObject } from '../types/canvas';

// Single source of truth for "what font size does this object's text render at". Both the canvas
// (CanvasObjectContent.tsx) and the PNG export (export.ts) call this so a person who never touched
// the font-size control still sees the same size in both places, and a person who does set
// object.fontSize sees that exact px value everywhere too.
export const MIN_FONT_SIZE = 10;
export const MAX_FONT_SIZE = 48;

// Per-type baseline, matching each object type's previous hard-coded size so existing notes don't
// visually shift just because this control shipped.
const DEFAULT_FONT_SIZE_BY_TYPE: Record<string, number> = {
  text: 14,
  shape: 24,
  checklist: 14,
  code: 11,
  formula: 20,
  table: 13,
  flashcard: 15,
};

export function getDefaultFontSize(objectType: CanvasObject['type']): number {
  return DEFAULT_FONT_SIZE_BY_TYPE[objectType] ?? 14;
}

export function getFontSize(object: Pick<CanvasObject, 'type' | 'fontSize'>): number {
  const size = object.fontSize ?? getDefaultFontSize(object.type);
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, size));
}
