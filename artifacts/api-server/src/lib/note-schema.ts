import { z } from "zod/v4";

// Validates just enough of the note payload to safely derive the
// denormalized columns (title/favorite/archived/inTrash/tags/folderId)
// and to decompose pages/objects into structured storage — see
// lib/db/src/schema/canvas.ts. This intentionally does not attempt to
// fully validate every type-specific canvas-object field (chart data,
// table styling, checklist items, ...): those stay schemaless in
// `content`/the blob, same as before. What changes is that the fields
// the API actually reads and writes into typed SQL columns can no
// longer silently diverge from — or crash on — whatever shape the
// client sent.

const canvasObjectSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  rotation: z.number(),
  zIndex: z.number(),
  content: z.string(),
  color: z.string(),
  fill: z.string(),
}).loose(); // extra, type-specific fields (chartData, checklistItems, ...) pass through untouched

const pageSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  objects: z.array(canvasObjectSchema).default([]),
  strokes: z.array(z.unknown()).default([]),
  connections: z.array(z.unknown()).default([]),
  sectionId: z.string().nullable().optional(),
});

export const notePayloadSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  template: z.string(),
  createdAt: z.string().optional(),
  updatedAt: z.string(),
  favorite: z.boolean().default(false),
  archived: z.boolean().default(false),
  inTrash: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
  folderId: z.string().nullable().optional(),
  pages: z.array(pageSchema).optional(),
  sections: z.array(z.unknown()).optional(),
  // Legacy single-page compatibility (pre-pages format) — at least one
  // of `pages` or `objects` must be present; enforced below.
  objects: z.array(canvasObjectSchema).optional(),
  strokes: z.array(z.unknown()).optional(),
  connections: z.array(z.unknown()).optional(),
}).loose().refine(
  (note: { pages?: unknown[]; objects?: unknown[] }) =>
    (note.pages && note.pages.length > 0) || note.objects !== undefined,
  { message: "note must have either `pages` or legacy `objects`" },
);

export type ValidatedNotePayload = z.infer<typeof notePayloadSchema>;
export type ValidatedPage = z.infer<typeof pageSchema>;
export type ValidatedCanvasObject = z.infer<typeof canvasObjectSchema>;

export function parseNotePayload(body: unknown, noteIdParam: string) {
  const result = notePayloadSchema.safeParse(body);
  if (!result.success) {
    return { ok: false as const, error: result.error.issues[0]?.message ?? "Invalid note payload" };
  }
  if (result.data.id !== noteIdParam) {
    return { ok: false as const, error: "Note id does not match URL" };
  }
  return { ok: true as const, note: result.data };
}
