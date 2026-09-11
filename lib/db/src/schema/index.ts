import { integer, jsonb, pgTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

export const notesTable = pgTable("mind_map_notes", {
  id: varchar("id", { length: 120 }).primaryKey(),
  userId: varchar("user_id", { length: 160 }).notNull(),
  title: text("title").notNull(),
  note: jsonb("note").notNull(),
  clientUpdatedAt: timestamp("client_updated_at", { withTimezone: true }).notNull(),
  serverUpdatedAt: timestamp("server_updated_at", { withTimezone: true }).defaultNow().notNull(),
  version: integer("version").default(1).notNull(),
}, (table) => ({
  userNoteUnique: uniqueIndex("mind_map_notes_user_note_unique").on(table.userId, table.id),
}));

export type NoteRow = typeof notesTable.$inferSelect;
export type NewNoteRow = typeof notesTable.$inferInsert;