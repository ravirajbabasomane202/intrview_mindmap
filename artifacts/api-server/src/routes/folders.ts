import { Router, type RequestHandler } from "express";
import { and, eq } from "drizzle-orm";
import { db, foldersTable } from "@workspace/db";
import { randomBytes } from "crypto";

const router = Router();

const getUserId = (req: { headers: Record<string, string | string[] | undefined> }): string | null => {
  const header = req.headers['x-user-id'];
  const userId = Array.isArray(header) ? header[0] : header;
  return typeof userId === 'string' && userId.length > 0 ? userId : null;
};

const requireUserId: RequestHandler = (req, res, next) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "User id required" });
    return;
  }
  res.locals.userId = userId;
  next();
};

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${randomBytes(3).toString('hex')}`;
}

// Get all folders for the user
router.get("/folders", requireUserId, async (_req, res) => {
  const userId = res.locals.userId as string;
  const folders = await db.select().from(foldersTable)
    .where(eq(foldersTable.userId, userId));
  res.json(folders);
});

// Get a specific folder
router.get("/folders/:id", requireUserId, async (req, res) => {
  const userId = res.locals.userId as string;
  const folderId = typeof req.params.id === "string" ? req.params.id : null;
  
  if (!folderId) {
    res.status(400).json({ error: "Invalid folder id" });
    return;
  }

  const folder = await db.select().from(foldersTable)
    .where(and(eq(foldersTable.userId, userId), eq(foldersTable.id, folderId)))
    .limit(1);

  if (!folder.length) {
    res.status(404).json({ error: "Folder not found" });
    return;
  }

  res.json(folder[0]);
});

// Create a new folder
router.post("/folders", requireUserId, async (req, res) => {
  const userId = res.locals.userId as string;
  const { name, parentFolderId } = req.body;

  if (!name || typeof name !== "string") {
    res.status(400).json({ error: "Folder name is required" });
    return;
  }

  if (parentFolderId && typeof parentFolderId !== "string") {
    res.status(400).json({ error: "Invalid parentFolderId" });
    return;
  }

  const folderId = generateId("folder");
  const now = new Date();
  
  const folder = await db.insert(foldersTable).values({
    id: folderId,
    userId,
    name: name.trim(),
    parentFolderId: parentFolderId || undefined,
    createdAt: now,
    updatedAt: now,
  }).returning();

  res.status(201).json(folder[0]);
});

// Update a folder
router.put("/folders/:id", requireUserId, async (req, res) => {
  const userId = res.locals.userId as string;
  const folderId = typeof req.params.id === "string" ? req.params.id : null;
  const { name, parentFolderId } = req.body;

  if (!folderId) {
    res.status(400).json({ error: "Invalid folder id" });
    return;
  }

  if (name && typeof name !== "string") {
    res.status(400).json({ error: "Folder name must be a string" });
    return;
  }

  if (parentFolderId && typeof parentFolderId !== "string") {
    res.status(400).json({ error: "Invalid parentFolderId" });
    return;
  }

  const existing = await db.select().from(foldersTable)
    .where(and(eq(foldersTable.userId, userId), eq(foldersTable.id, folderId)))
    .limit(1);

  if (!existing.length) {
    res.status(404).json({ error: "Folder not found" });
    return;
  }

  const updateData: { name?: string; parentFolderId?: string | null; updatedAt: Date } = {
    updatedAt: new Date(),
  };

  if (name) updateData.name = name.trim();
  if (parentFolderId !== undefined) updateData.parentFolderId = parentFolderId || null;

  const updated = await db.update(foldersTable)
    .set(updateData)
    .where(and(eq(foldersTable.userId, userId), eq(foldersTable.id, folderId)))
    .returning();

  res.json(updated[0]);
});

// Delete a folder
router.delete("/folders/:id", requireUserId, async (req, res) => {
  const userId = res.locals.userId as string;
  const folderId = typeof req.params.id === "string" ? req.params.id : null;

  if (!folderId) {
    res.status(400).json({ error: "Invalid folder id" });
    return;
  }

  await db.delete(foldersTable)
    .where(and(eq(foldersTable.userId, userId), eq(foldersTable.id, folderId)));

  res.status(204).end();
});

export default router;
