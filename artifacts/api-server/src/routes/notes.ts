import { Router, type RequestHandler } from "express";
import { getAuth } from "@clerk/express";
import { and, eq } from "drizzle-orm";
import { db, notesTable } from "@workspace/db";

const router = Router();

const requireAuth: RequestHandler = (req, res, next) => {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Sign in required" });
    return;
  }
  res.locals.userId = userId;
  next();
};

function isNotePayload(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const note = value as Record<string, unknown>;
  return typeof note.id === "string" && typeof note.title === "string" &&
    typeof note.template === "string" && typeof note.updatedAt === "string" &&
    Array.isArray(note.objects);
}

function parseClientDate(note: Record<string, unknown>, fallback?: unknown) {
  const value = typeof fallback === "string" ? fallback : note.updatedAt;
  const parsed = new Date(value as string);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

router.get("/notes", requireAuth, async (_req, res) => {
  const rows = await db.select().from(notesTable).where(eq(notesTable.userId, res.locals.userId));
  res.json(rows.map((row) => row.note));
});

router.put("/notes/:id", requireAuth, async (req, res) => {
  const note = req.body?.note;
  const noteId = typeof req.params.id === "string" ? req.params.id : null;
  if (!noteId || !isNotePayload(note) || note.id !== noteId) {
    res.status(400).json({ error: "Invalid note payload" });
    return;
  }
  const clientUpdatedAt = parseClientDate(note, req.body?.clientUpdatedAt);
  if (!clientUpdatedAt) {
    res.status(400).json({ error: "Note updatedAt must be an ISO date" });
    return;
  }

  const userId = res.locals.userId as string;
  const existing = await db.select().from(notesTable)
    .where(and(eq(notesTable.userId, userId), eq(notesTable.id, noteId)))
    .limit(1);
  if (existing[0] && existing[0].clientUpdatedAt.getTime() > clientUpdatedAt.getTime()) {
    res.status(409).json({ error: "A newer copy already exists", note: existing[0].note });
    return;
  }

  const saved = await db.insert(notesTable).values({
    id: note.id as string,
    userId,
    title: note.title as string,
    note,
    clientUpdatedAt,
    version: existing[0] ? existing[0].version + 1 : 1,
  }).onConflictDoUpdate({
    target: [notesTable.id, notesTable.userId],
    set: {
      title: note.title as string,
      note,
      clientUpdatedAt,
      serverUpdatedAt: new Date(),
      version: existing[0] ? existing[0].version + 1 : 1,
    },
  }).returning();

  res.json(saved[0]?.note ?? note);
});

router.delete("/notes/:id", requireAuth, async (req, res) => {
  const noteId = typeof req.params.id === "string" ? req.params.id : null;
  if (!noteId) {
    res.status(400).json({ error: "Invalid note id" });
    return;
  }
  await db.delete(notesTable)
    .where(and(eq(notesTable.userId, res.locals.userId as string), eq(notesTable.id, noteId)));
  res.status(204).end();
});

export default router;