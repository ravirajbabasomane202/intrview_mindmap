import { index, pgTable, text, timestamp, type AnyPgColumn } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const foldersTable = pgTable("folders", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  // Self-referencing: a folder's parent is another row in this same table.
  // `onDelete: "set null"` means deleting a parent folder re-parents its
  // direct children to the root (they become top-level) instead of leaving
  // a dangling parentFolderId or requiring the API to walk the tree itself.
  parentFolderId: text("parent_folder_id").references((): AnyPgColumn => foldersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("folders_user_id_idx").on(table.userId),
  index("folders_parent_folder_id_idx").on(table.parentFolderId),
]);

export const insertFolderSchema = createInsertSchema(foldersTable).omit({ createdAt: true, updatedAt: true });
export type InsertFolder = z.infer<typeof insertFolderSchema>;
export type Folder = typeof foldersTable.$inferSelect;
