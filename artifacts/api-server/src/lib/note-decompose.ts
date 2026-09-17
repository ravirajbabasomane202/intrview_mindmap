import { and, eq } from "drizzle-orm";
import { canvasObjectsTable, db, notesPagesTable } from "@workspace/db";
import type { ValidatedNotePayload, ValidatedPage } from "./note-schema";

type Executor = Pick<typeof db, "insert" | "delete">;

// Mirrors the note's pages/objects into notes_pages/canvas_objects so they
// become independently queryable and partially updatable (see
// lib/db/src/schema/canvas.ts) — the actual fix for "no object-level query
// or partial update possible" that a single jsonb blob couldn't support.
//
// Uses a delete-then-insert replace strategy scoped to this note: simple
// and correct for whole-note writes (the common case today — see the PUT
// route), at the cost of being the wrong tool once true per-object partial
// updates are common, since it would blow away sibling objects' rows on
// every edit. The PATCH object route below updates both storage paths
// directly instead of going through this function, for exactly that
// reason.
export async function decomposeNoteIntoStructuredStorage(
  tx: Executor,
  args: { noteId: string; userId: string; note: ValidatedNotePayload },
) {
  const { noteId, userId, note } = args;

  await tx.delete(notesPagesTable)
    .where(and(eq(notesPagesTable.noteId, noteId), eq(notesPagesTable.userId, userId)));

  // Legacy (pre-multi-page) notes only carry top-level objects/strokes/
  // connections — synthesize the same single default page the frontend's
  // own migrateNoteToNewFormat() would produce, so structured storage
  // never depends on which format a given note happens to be in.
  const pages: ValidatedPage[] = note.pages && note.pages.length > 0
    ? note.pages
    : [{
      id: `${noteId}:legacy-page`,
      title: "Default Page",
      objects: note.objects ?? [],
      strokes: note.strokes ?? [],
      connections: note.connections ?? [],
      sectionId: undefined,
    }];

  await tx.insert(notesPagesTable).values(pages.map((page, index: number) => ({
    id: page.id,
    noteId,
    userId,
    title: page.title,
    sectionId: page.sectionId ?? null,
    orderIndex: index,
    strokes: page.strokes ?? [],
    connections: page.connections ?? [],
  })));

  const objectRows = pages.flatMap((page) => page.objects.map((object) => {
    const { id, type, x, y, width, height, rotation, zIndex, ...rest } = object;
    return {
      id,
      pageId: page.id,
      noteId,
      userId,
      type,
      position: { x, y, width, height, rotation },
      zIndex,
      content: rest,
    };
  }));

  if (objectRows.length > 0) {
    await tx.insert(canvasObjectsTable).values(objectRows);
  }
}
