---
name: Local storage migrations
description: Durable browser state can outlive seeded defaults and needs read-time normalization when content formats change.
---

Treat localStorage payloads as user data, not disposable seed data. When a seeded or persisted shape changes, normalize legacy values while reading before rendering, and keep that migration tolerant of missing optional fields.

**Why:** The canvas app had already persisted its initial seeded content in the browser, so correcting the seed alone did not update the visible note; read-time normalization was required.

**How to apply:** For future local-first features, add a small migration/normalization step in the storage reader whenever a field's format or meaning changes.