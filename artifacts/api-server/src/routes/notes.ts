import { Router, type RequestHandler } from "express";
import { and, desc, eq, lt, or } from "drizzle-orm";
import { z } from "zod/v4";
import { canvasObjectsTable, db, notesTable } from "@workspace/db";
import { decomposeNoteIntoStructuredStorage } from "../lib/note-decompose";
import { parseNotePayload } from "../lib/note-schema";

const router = Router();

const getUserId = (req: { headers: Record<string, string | string[] | undefined> }): string | null => {
  const header = req.headers['x-user-id'];
  const userId = Array.isArray(header) ? header[0] : header;
  return typeof userId === 'string' && userId.length > 0 ? userId : null;
};

function paramString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

const requireUserId: RequestHandler = (req, res, next) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "User id required" });
    return;
  }
  res.locals.userId = userId;
  next();
};

function parseClientDate(noteUpdatedAt: string, fallback?: unknown) {
  const value = typeof fallback === "string" ? fallback : noteUpdatedAt;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

// Reconstructs the flat CanvasObject shape the frontend expects from a
// structured row (position/content/zIndex split back out into one object).
type CanvasObjectRow = typeof canvasObjectsTable.$inferSelect;
function rowToCanvasObject(row: CanvasObjectRow) {
  return {
    id: row.id,
    type: row.type,
    ...row.position,
    zIndex: row.zIndex,
    ...(row.content as Record<string, unknown>),
  };
}

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

// Keyset (a.k.a. seek) pagination, not offset — offset pagination on a table
// that's actively being written to (notes sync frequently) skips or repeats
// rows as inserts/deletes shift the offset out from under a paged-through
// client. The cursor instead pins "everything after this exact row" by
// (serverUpdatedAt, id), which stays correct regardless of concurrent writes.
type NotesCursor = { serverUpdatedAt: string; id: string };

function encodeCursor(cursor: NotesCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(raw: unknown): NotesCursor | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (
      parsed && typeof parsed === "object" &&
      typeof parsed.serverUpdatedAt === "string" && typeof parsed.id === "string" &&
      !Number.isNaN(new Date(parsed.serverUpdatedAt).valueOf())
    ) {
      return parsed as NotesCursor;
    }
  } catch {
    // fall through to null — an invalid/tampered cursor is treated as "start over"
  }
  return null;
}

router.get("/notes", requireUserId, async (req, res) => {
  const userId = res.locals.userId as string;

  const rawLimit = Number(req.query.limit);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0
    ? Math.min(Math.floor(rawLimit), MAX_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE;

  const cursor = decodeCursor(req.query.cursor);
  if (req.query.cursor && !cursor) {
    res.status(400).json({ error: "Invalid cursor" });
    return;
  }

  const cursorDate = cursor ? new Date(cursor.serverUpdatedAt) : null;
  const whereClause = cursorDate
    ? and(
      eq(notesTable.userId, userId),
      or(
        lt(notesTable.serverUpdatedAt, cursorDate),
        and(eq(notesTable.serverUpdatedAt, cursorDate), lt(notesTable.id, cursor!.id)),
      ),
    )
    : eq(notesTable.userId, userId);

  // Fetch one extra row so we can tell whether there's a next page without
  // a separate count query.
  const rows = await db.select().from(notesTable)
    .where(whereClause)
    .orderBy(desc(notesTable.serverUpdatedAt), desc(notesTable.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const nextCursor = hasMore && last
    ? encodeCursor({ serverUpdatedAt: last.serverUpdatedAt.toISOString(), id: last.id })
    : null;

  res.json({ notes: page.map((row) => row.note), nextCursor });
});

// Object-level read: list a single page's objects without fetching (or the
// client having to walk) the whole note document. Backed by canvas_objects,
// not the note blob.
router.get("/notes/:id/pages/:pageId/objects", requireUserId, async (req, res) => {
  const userId = res.locals.userId as string;
  const noteId = paramString(req.params.id);
  const pageId = paramString(req.params.pageId);
  if (!noteId || !pageId) {
    res.status(400).json({ error: "Invalid note or page id" });
    return;
  }

  const rows = await db.select().from(canvasObjectsTable)
    .where(and(
      eq(canvasObjectsTable.noteId, noteId),
      eq(canvasObjectsTable.pageId, pageId),
      eq(canvasObjectsTable.userId, userId),
    ));

  res.json({ objects: rows.map(rowToCanvasObject) });
});

const objectPatchSchema = z.object({
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  rotation: z.number().optional(),
  zIndex: z.number().optional(),
}).loose(); // color/fill/content/checklistItems/... pass through into `content`

// Object-level partial update: moves/resizes/edits a single canvas object
// without reading, rewriting, or holding a lock on the whole note — the
// concrete case whole-note storage couldn't support. Updates canvas_objects
// directly, then patches the same object inside notesTable.note so the two
// storage paths can't drift apart (the blob stays the source of truth for
// GET /notes and the whole-note conflict check — see
// .agents/memory/cloud-sync-conflicts.md).
router.patch("/notes/:id/pages/:pageId/objects/:objectId", requireUserId, async (req, res) => {
  const userId = res.locals.userId as string;
  const noteId = paramString(req.params.id);
  const pageId = paramString(req.params.pageId);
  const objectId = paramString(req.params.objectId);
  if (!noteId || !pageId || !objectId) {
    res.status(400).json({ error: "Invalid note, page, or object id" });
    return;
  }

  const parsedPatch = objectPatchSchema.safeParse(req.body);
  if (!parsedPatch.success) {
    res.status(400).json({ error: parsedPatch.error.issues[0]?.message ?? "Invalid object patch" });
    return;
  }
  const { x, y, width, height, rotation, zIndex, ...contentPatch } = parsedPatch.data;
  if (x === undefined && y === undefined && width === undefined && height === undefined
    && rotation === undefined && zIndex === undefined && Object.keys(contentPatch).length === 0) {
    res.status(400).json({ error: "Patch body is empty" });
    return;
  }

  const result = await db.transaction(async (tx) => {
    const existingRows = await tx.select().from(canvasObjectsTable)
      .where(and(
        eq(canvasObjectsTable.id, objectId),
        eq(canvasObjectsTable.pageId, pageId),
        eq(canvasObjectsTable.noteId, noteId),
        eq(canvasObjectsTable.userId, userId),
      )).limit(1);
    const existingRow = existingRows[0];
    if (!existingRow) return null;

    const nextPosition = {
      x: x ?? existingRow.position.x,
      y: y ?? existingRow.position.y,
      width: width ?? existingRow.position.width,
      height: height ?? existingRow.position.height,
      rotation: rotation ?? existingRow.position.rotation,
    };
    const nextZIndex = zIndex ?? existingRow.zIndex;
    const nextContent = { ...(existingRow.content as Record<string, unknown>), ...contentPatch };

    const [objectRow] = await tx.update(canvasObjectsTable)
      .set({ position: nextPosition, zIndex: nextZIndex, content: nextContent, updatedAt: new Date() })
      .where(and(
        eq(canvasObjectsTable.id, objectId),
        eq(canvasObjectsTable.pageId, pageId),
        eq(canvasObjectsTable.noteId, noteId),
        eq(canvasObjectsTable.userId, userId),
      ))
      .returning();

    const noteRows = await tx.select().from(notesTable)
      .where(and(eq(notesTable.id, noteId), eq(notesTable.userId, userId))).limit(1);
    const noteRow = noteRows[0];
    if (!noteRow || !objectRow) return null;

    const noteBlob = noteRow.note as Record<string, unknown>;
    const pages = Array.isArray(noteBlob.pages) ? noteBlob.pages as Record<string, unknown>[] : [];
    const page = pages.find((candidate) => candidate.id === pageId);
    const objects = page && Array.isArray(page.objects) ? page.objects as Record<string, unknown>[] : null;
    const objectIndex = objects ? objects.findIndex((candidate) => candidate.id === objectId) : -1;
    if (!objects || objectIndex === -1) return null;

    objects[objectIndex] = { ...objects[objectIndex], ...nextPosition, zIndex: nextZIndex, ...nextContent };

    const [updatedNoteRow] = await tx.update(notesTable)
      .set({ note: noteBlob, clientUpdatedAt: new Date(), serverUpdatedAt: new Date(), version: noteRow.version + 1 })
      .where(and(eq(notesTable.id, noteId), eq(notesTable.userId, userId)))
      .returning();

    return { object: objectRow, note: updatedNoteRow?.note };
  });

  if (!result) {
    res.status(404).json({ error: "Object not found" });
    return;
  }
  res.json({ object: rowToCanvasObject(result.object), note: result.note });
});

router.put("/notes/:id", requireUserId, async (req, res) => {
  const noteIdParam = typeof req.params.id === "string" ? req.params.id : null;
  if (!noteIdParam) {
    res.status(400).json({ error: "Invalid note id" });
    return;
  }

  // Validates the payload (not just loose `as` casts) so the denormalized
  // columns below are derived from a shape we've actually checked, and so
  // pages/objects can be safely decomposed into structured storage — see
  // lib/note-schema.ts.
  const parsed = parseNotePayload(req.body?.note, noteIdParam);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const note = parsed.note;

  const clientUpdatedAt = parseClientDate(note.updatedAt, req.body?.clientUpdatedAt);
  if (!clientUpdatedAt) {
    res.status(400).json({ error: "Note updatedAt must be an ISO date" });
    return;
  }

  const userId = res.locals.userId as string;
  const existing = await db.select().from(notesTable)
    .where(and(eq(notesTable.userId, userId), eq(notesTable.id, note.id)))
    .limit(1);
  if (existing[0] && existing[0].clientUpdatedAt.getTime() > clientUpdatedAt.getTime()) {
    res.status(409).json({ error: "A newer copy already exists", note: existing[0].note });
    return;
  }

  // Derived straight from the validated payload above, so these can no
  // longer silently diverge from `note` the way separately-cast fields
  // could — they're read from the same checked object, not re-trusted.
  const metadata = {
    title: note.title,
    favorite: note.favorite,
    archived: note.archived,
    inTrash: note.inTrash,
    tags: note.tags,
    folderId: note.folderId,
  };
  const nextVersion = existing[0] ? existing[0].version + 1 : 1;

  const saved = await db.transaction(async (tx) => {
    const [row] = await tx.insert(notesTable).values({
      id: note.id,
      userId,
      ...metadata,
      note,
      clientUpdatedAt,
      version: nextVersion,
    }).onConflictDoUpdate({
      target: [notesTable.id, notesTable.userId],
      set: {
        ...metadata,
        note,
        clientUpdatedAt,
        serverUpdatedAt: new Date(),
        version: nextVersion,
      },
    }).returning();

    // Mirrors pages/objects into structured storage alongside the blob
    // write above — see lib/note-decompose.ts for why this is a
    // delete-then-insert rather than a diff.
    await decomposeNoteIntoStructuredStorage(tx, { noteId: note.id, userId, note });

    return row;
  });

  res.json(saved?.note ?? note);
});

router.delete("/notes/:id", requireUserId, async (req, res) => {
  const noteId = typeof req.params.id === "string" ? req.params.id : null;
  if (!noteId) {
    res.status(400).json({ error: "Invalid note id" });
    return;
  }
  // notes_pages/canvas_objects rows cascade-delete via their FKs to notes
  // (see lib/db/src/schema/canvas.ts) — no separate cleanup needed here.
  await db.delete(notesTable)
    .where(and(eq(notesTable.userId, res.locals.userId as string), eq(notesTable.id, noteId)));
  res.status(204).end();
});

export default router;
