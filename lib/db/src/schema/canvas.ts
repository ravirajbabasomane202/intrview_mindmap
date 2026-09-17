import { foreignKey, index, integer, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { notesTable } from "./notes";

// Structured, per-object storage for a note's canvas content. This sits
// alongside `notesTable.note` (still the source of truth for whole-note
// reads/writes and the whole-note last-write-wins conflict policy — see
// .agents/memory/cloud-sync-conflicts.md) rather than replacing it yet:
// the API mirrors writes here so pages and objects become independently
// queryable and partially updatable, which the single jsonb blob could
// never support. A future cutover can make this the source of truth and
// stop writing `note` once every read path has moved over.

export const notesPagesTable = pgTable("notes_pages", {
  // Page ids are client-generated (see uid() in the frontend) the same
  // way note ids are, and aren't guaranteed globally unique — so, like
  // notesTable, the primary key scopes by (noteId, userId) rather than
  // trusting `id` alone.
  id: text("id").notNull(),
  noteId: text("note_id").notNull(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  sectionId: text("section_id"),
  // Pages are an ordered array on the note, not something an id or
  // timestamp encodes, so order is preserved explicitly.
  orderIndex: integer("order_index").notNull().default(0),
  // Kept as page-level jsonb rather than fully normalized: strokes and
  // connections are high-count, low-value-per-row (a stroke is little
  // more than a point list) and — unlike objects — aren't queried or
  // updated individually today, so per-row storage wouldn't earn its
  // cost yet. Revisit if per-stroke editing/sync is ever needed.
  strokes: jsonb("strokes").notNull().default([]),
  connections: jsonb("connections").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.id, table.noteId, table.userId] }),
  foreignKey({
    columns: [table.noteId, table.userId],
    foreignColumns: [notesTable.id, notesTable.userId],
    name: "notes_pages_note_fk",
  }).onDelete("cascade"),
  index("notes_pages_note_id_user_id_idx").on(table.noteId, table.userId),
]);

export const canvasObjectsTable = pgTable("canvas_objects", {
  // Object ids are client-generated per page and aren't guaranteed
  // globally unique either (seed data alone reuses short ids like "p1"
  // across different notes) — scope the same way pages/notes do.
  id: text("id").notNull(),
  pageId: text("page_id").notNull(),
  noteId: text("note_id").notNull(),
  userId: text("user_id").notNull(),
  type: text("type").notNull(),
  // Geometry, grouped so a move/resize is a single-column update.
  position: jsonb("position").$type<{ x: number; y: number; width: number; height: number; rotation: number }>().notNull(),
  zIndex: integer("z_index").notNull().default(0),
  // Everything else (content, color, fill, and the type-specific fields
  // — checklist items, chart data, table styling, etc.). Still schemaless
  // like the old blob, but now addressable per object instead of only as
  // part of the whole note.
  content: jsonb("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.id, table.pageId, table.noteId, table.userId] }),
  foreignKey({
    columns: [table.pageId, table.noteId, table.userId],
    foreignColumns: [notesPagesTable.id, notesPagesTable.noteId, notesPagesTable.userId],
    name: "canvas_objects_page_fk",
  }).onDelete("cascade"),
  // Supports "objects on this page" (the partial-read/partial-update
  // path this table exists for) without relying on primary-key column
  // order.
  index("canvas_objects_page_id_idx").on(table.pageId),
  index("canvas_objects_note_id_user_id_idx").on(table.noteId, table.userId),
]);

export const insertNotePageSchema = createInsertSchema(notesPagesTable).omit({ createdAt: true, updatedAt: true });
export type InsertNotePage = z.infer<typeof insertNotePageSchema>;
export type NotePageRow = typeof notesPagesTable.$inferSelect;

export const insertCanvasObjectSchema = createInsertSchema(canvasObjectsTable).omit({ createdAt: true, updatedAt: true });
export type InsertCanvasObject = z.infer<typeof insertCanvasObjectSchema>;
export type CanvasObjectRow = typeof canvasObjectsTable.$inferSelect;
