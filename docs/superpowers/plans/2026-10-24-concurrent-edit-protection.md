# Concurrent Edit Protection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent stale browser tabs and devices from silently overwriting newer YSP data.

**Architecture:** Browser Web Locks grant one editor per origin, with UI and persistence guards. A database `revision` on the `main` row provides atomic compare-and-swap; the client retries from fresh cloud state on collision without applying an uncommitted merge locally.

**Tech Stack:** Vue 3, Vitest, Supabase REST/PostgreSQL.

**Spec:** `docs/superpowers/specs/2026-10-24-concurrent-edit-protection-design.md`

## Global Constraints

- Keep `car` row and all business-data fields unchanged.
- Fail closed if `main.revision` is unavailable; never deploy the new client before the SQL migration.
- Preserve local unsynced data and existing conflict choices on errors.

## Review Focus

- Two tabs acquiring concurrently: only one may save.
- Lock holder closes or writes from an old tab: the other page must reread before editing.
- Two devices precheck the same revision: only one upload succeeds.
- Cloud changes while a user is reading the conflict dialog: choice must be rechecked against fresh cloud state.
- Existing `main` with old payload, missing revision migration, and unrelated `car` writes.

---

### Task 1: Cloud revision contract and migration

**Files:** Create `scripts/sql/2026-10-24-ysp-main-revision.sql`; modify `src/services/cloudStore.js`; test `src/services/cloudStore.test.js`; update `README.md`.

**Interfaces:** `fetchCloudState()` returns `revision`; `saveCloudState(...,{expectedRevision})` returns `revision` or throws with `code: 'CLOUD_REVISION_CONFLICT'`.

- [x] Write tests for initial insert, conditional PATCH, zero-row collision, missing revision, and `car` isolation SQL contract; run and observe failure.
- [x] Add SQL migration and minimum cloud transport changes; rerun focused tests.
- [x] Run full suite and commit task files.

### Task 2: Sync retry without premature local application

**Files:** Modify `src/data/store.js`, `src/data/cloudSlotPlan.js`, `src/App.vue`; test `src/data/store.test.js`, `src/data/cloudSlotPlan.test.js`.

**Interfaces:** `performSyncDecision` forwards revision to cloud writer, on collision re-reads/replans at most twice, and applies merged data locally only after a successful cloud commit or pure cloud adoption.

- [x] Write failing tests for racing uploads, fresh conflict re-evaluation, merge preservation, and aligned-slot revision monotonicity.
- [x] Implement bounded retry and deferred apply, including pre-apply validation in the App handler.
- [x] Run focused and full tests; commit task files.

### Task 3: Single-editor browser lock and UI

**Files:** Create `src/utils/editorLock.js`, `src/utils/editorLock.test.js`; modify `src/App.vue`, `src/data/store.js`; test `src/data/store.test.js` and browser interaction.

**Interfaces:** `acquireEditorLock`, `releaseEditorLock`, `isEditorLockHeld`; store registers a synchronous write-permission checker; read-only tab cannot save or sync.

- [x] Write failing unit tests for acquisition, refusal, release/retry, and store write guard.
- [x] Implement Web Lock lifecycle, blocking overlay/inert content, and reloading local data after retry.
- [x] Verify two tabs manually or in automated browser, run full suite/build, and commit task files.

### Task 4: End-to-end release readiness

**Files:** Documentation and migration rollout notes only unless verification finds a bug.

- [ ] Recheck SQL migration against current schema and RLS; verify `main` old-client rejection and `car` unaffected when database access is available. 本地静态核对完成；线上数据库权限缺失，等待迁移。
- [x] Run full tests, build, diff check, and concurrency simulation; review the final diff.
- [ ] Confirm migration is applied before publishing; otherwise leave implementation local with explicit rollout instructions.
