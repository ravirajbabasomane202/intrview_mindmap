# [Project name]

_Replace the heading above with the project's name, and this line with one sentence describing what this app does for users._

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- DB schema (source of truth): `lib/db/src/schema/` — `notes.ts` (notes table + denormalized metadata columns), `folders.ts`, `canvas.ts` (structured `notes_pages`/`canvas_objects`, mirrored from `notes.note`)
- Notes API: `artifacts/api-server/src/routes/notes.ts`, with the payload-validation and structured-storage-decomposition helpers in `artifacts/api-server/src/lib/note-schema.ts` and `note-decompose.ts`
- All routers are wired up in `artifacts/api-server/src/routes/index.ts` — a route file existing under `routes/` does **not** mean it's live; it must be `router.use()`'d there too
- Frontend note/page/object types: `artifacts/mind-map-notebook/src/types/canvas.ts` (not imported by the API server — the two sides validate independently)

## Architecture decisions

- `notesTable.note` (the whole-note jsonb blob) stays the source of truth for `GET /notes` and the whole-note last-write-wins conflict check (see `.agents/memory/cloud-sync-conflicts.md`). `notes_pages`/`canvas_objects` are a mirror, kept in sync on every write, that exists purely to make pages/objects independently queryable and partially updatable — see `.agents/memory/structured-canvas-storage.md`.
- Notes/pages/objects use client-generated, non-globally-unique ids (see `lib/uid.ts`), so every structured table's primary key is scoped by the full ownership chain (e.g. `canvas_objects` PK is `(id, pageId, noteId, userId)`), matching the pattern `notesTable` already used for `(id, userId)`.
- The note payload is validated with Zod (`artifacts/api-server/src/lib/note-schema.ts`) before any of it is trusted for indexed columns or structured decomposition — deliberately not exhaustive on type-specific canvas-object fields (chart data, table styles, ...), which stay schemaless in `content`.

## Gotchas

- New route files under `artifacts/api-server/src/routes/` must be added to `routes/index.ts` or they're dead code — this had already happened once (`notes.ts`/`folders.ts` existed but weren't mounted) before being fixed.
- After editing `lib/db/src/schema/*`, run `pnpm --filter @workspace/db run push` (or `push-force` for a throwaway/dev DB) before the API server will actually have the new tables/columns.
- If `tsc --build` complains an output `.d.ts` "has not been built from source", the `lib/*/dist` build info is stale — delete `lib/*/dist` and any `lib/*/*.tsbuildinfo` and rerun.

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
