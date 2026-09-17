import { boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { foldersTable } from "./folders";

export const notesTable = pgTable("notes", {
  // `id` is client-generated (see uid() in the frontend) and is not globally
  // unique across users by itself in this model — routes always scope by
  // both id and userId, so the primary key (and the onConflictDoUpdate
  // target in notes.ts) is the composite of the two, not id alone.
  id: text("id").notNull(),
  userId: text("user_id").notNull(),

  // Denormalized metadata, pulled out of `note` on every write so it can be
  // indexed/filtered without touching the blob. Keeping these in sync with
  // `note` is the API layer's job (see notes.ts) — this schema only stores
  // what it's given.
  title: text("title").notNull(),
  favorite: boolean("favorite").notNull().default(false),
  archived: boolean("archived").notNull().default(false),
  inTrash: boolean("in_trash").notNull().default(false),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  // `onDelete: "set null"` — deleting a folder moves its notes to Unfiled
  // rather than leaving a dangling folderId or requiring the API to do it.
  folderId: text("folder_id").references(() => foldersTable.id, { onDelete: "set null" }),

  // The opaque document itself: pages/objects/strokes/connections as one
  // JSON blob. This is the piece flagged as needing a real document model
  // or CRDT — this schema change only unblocks compilation, it doesn't fix
  // that underlying issue.
  note: jsonb("note").notNull(),

  // Last-write-wins bookkeeping. `clientUpdatedAt` is the device's own
  // clock (see the 409 check in notes.ts) — not authoritative, just what's
  // compared today. `version` is an optimistic-concurrency counter that
  // isn't currently checked against the client's expected version.
  clientUpdatedAt: timestamp("client_updated_at", { withTimezone: true }).notNull(),
  serverUpdatedAt: timestamp("server_updated_at", { withTimezone: true }).notNull().defaultNow(),
  version: integer("version").notNull().default(1),
}, (table) => [
  primaryKey({ columns: [table.id, table.userId] }),
  index("notes_user_id_idx").on(table.userId),
  index("notes_folder_id_idx").on(table.folderId),
  // Supports the GET /notes keyset-pagination query: filter by userId,
  // order by (serverUpdatedAt desc, id desc). Without this the userId-only
  // index above still narrows to one user's rows, but Postgres then has to
  // sort them all in memory on every page — this index lets it walk the
  // rows already in the right order and stop at `limit`.
  index("notes_user_id_server_updated_at_id_idx").on(table.userId, table.serverUpdatedAt.desc(), table.id.desc()),
]);

export const insertNoteSchema = createInsertSchema(notesTable).omit({ serverUpdatedAt: true, version: true });
export type InsertNote = z.infer<typeof insertNoteSchema>;
export type NoteRow = typeof notesTable.$inferSelect;
