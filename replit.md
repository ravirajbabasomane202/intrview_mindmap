# Mind Map Notebook

A calm, local-first educational note-taking app for arranging ideas on a soft 3D infinite canvas.

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

- `artifacts/mind-map-notebook/src/App.tsx` — notes home, canvas editor, canvas objects, drawing, connections, and local persistence.
- `artifacts/mind-map-notebook/src/index.css` — notebook theme tokens, typography, motion, and canvas texture.
- `attached_assets/Pasted--Redesigned-Prompt-Minimal-3D-Mind-Map-Notebook-1-Produ_1789073353556.txt` — original product brief.

## Architecture decisions

- The first release is frontend-only and stores notes, objects, strokes, and connections in localStorage so the canvas works without an account or network.
- The 3D effect is intentionally 2.5D: paper-like surfaces, soft elevation, and a dotted infinite canvas instead of WebGL or heavy camera controls.
- The editor keeps the permanent toolbar to Add, Draw, and Connect; object formatting stays in the contextual inspector.

## Product

- My Notes home with search, favorites, note creation, deletion, and responsive note cards.
- Canvas editor with pan, zoom, fit/reset, draggable text/formula/shape objects, inline editing, sizing, rotation, color changes, deletion, freehand drawing, and object connections.
- Automatic local saving with a save status indicator and tolerant legacy storage normalization.

## User preferences

 - Keep the canvas visually primary and the interface minimal.

## Gotchas

- Browser storage is treated as user data; format changes need read-time normalization so existing notes remain usable.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
