---
name: Cloud sync conflict policy
description: The notebook's account sync remains local-first and resolves concurrent note edits at whole-note granularity.
---

The notebook uses localStorage as the always-available cache and Clerk-authenticated API records as the optional cloud copy. Sync compares each note's client timestamp and rejects a write when the server already has a newer version; it does not merge individual canvas objects.

**Why:** Whole-note conflict handling keeps the MVP predictable and avoids silently combining incompatible canvas moves, deletions, and drawings.

**How to apply:** Preserve the local cache and offline editing path when extending sync. If finer collaboration is needed later, add explicit operation or object-level versioning rather than silently changing this policy.