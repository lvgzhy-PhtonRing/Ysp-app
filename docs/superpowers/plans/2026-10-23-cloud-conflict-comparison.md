# Cloud Conflict Comparison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make cloud/local differences legible before the user chooses which data to keep.

**Architecture:** Extend the pure conflict-diff computation to cover object slots and preserve display precision. Add a small pure summary helper for the two payloads, then render a wider responsive comparison in the existing App.vue modal without changing sync decisions.

**Tech Stack:** Vue 3, Vitest, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-10-23-cloud-conflict-comparison-design.md`

## Global Constraints

- Keep the ten existing slot choices, overwrite warnings, backups, and cloud protocol unchanged.
- Display monetary values with two decimal places, highlight price deltas, translate statuses such as sold to 已出售, and do not truncate conflict values.
- Leave unrelated untracked files alone.

## Review Focus

- Object slots (`calc`, `ownerRegistry`) must never appear as a false zero-difference row.
- Missing values, zero, negative amounts and decimal amounts remain distinguishable.
- Long names and nested fields remain readable in the modal.
- The quick choice applies to all listed slots, while fine choice stays per slot.
- Normalization-only changes must not create phantom differences.

### Task 1: Complete conflict difference data

**Files:** `src/data/store.js`, `src/data/store.test.js`

- [x] Add failing tests for `calc`, `ownerRegistry`, decimal prices, localized statuses, long text, and normalized equal items.
- [x] Run the focused tests and verify the expected failures.
- [x] Extend `computeConflictDiff(localPayload, cloudPayload)` to include object slots and full-precision display values.
- [x] Run the focused tests and verify they pass.

### Task 2: Summary and comparison modal

**Files:** `src/data/cloudConflictSummary.js`, `src/data/cloudConflictSummary.test.js`, `src/App.vue`

- [x] Add failing tests for item totals, inventory count/cost, sold count and per-slot record count.
- [x] Run focused tests and verify expected failures.
- [x] Implement pure summary helper and render top comparison plus expanded slot details in App.vue.
- [x] Verify at desktop and narrow widths, plus keyboard operation.

### Task 3: Final verification

**Files:** above files only.

- [x] Run `npm test` and `npm run build`.
- [x] Review diff for unchanged sync decision code and pre-existing untracked files.
