---
name: Structured canvas storage
description: notes_pages/canvas_objects mirror the note blob so pages and objects are independently queryable and partially updatable, without changing what's authoritative.
---

The note's `pages`/`objects` are decomposed into `notes_pages` and `canvas_objects` tables on every write, alongside the existing `notesTable.note` jsonb blob. The blob remains authoritative for `GET /notes` and the whole-note last-write-wins conflict check (see cloud-sync-conflicts.md) — the structured tables are a mirror, not a replacement, kept in sync by `decomposeNoteIntoStructuredStorage()` (delete-then-insert, scoped to one note, inside the same transaction as the blob write).

**Why:** A single jsonb blob makes "list the objects on this page" or "move this one object" require reading and rewriting the entire note. The structured tables make both cheap and safe: `GET /notes/:id/pages/:pageId/objects` reads directly from `canvas_objects`, and `PATCH /notes/:id/pages/:pageId/objects/:objectId` updates one row without touching sibling objects — while still patching the same object inside the blob so the two paths can't drift apart.

**How to apply:** Any new write path that changes pages/objects must update both the blob and the structured tables in the same transaction, or the two will drift. The delete-then-insert decomposition strategy is only correct for whole-note writes (the common case) — a future path that does many small structured updates per second should update `canvas_objects` directly (like the PATCH route does) rather than going through the delete-then-insert helper. If/when every read path moves off `notesTable.note`, that's the point to stop dual-writing it and make the structured tables the sole source of truth — until then, don't.
