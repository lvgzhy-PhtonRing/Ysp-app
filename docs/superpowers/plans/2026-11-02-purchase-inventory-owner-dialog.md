# Purchase Inventory Owner Dialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace sequential owner prompts with one accessible inventory assignment dialog for 5.1.4, and use the corrected PhotonRing brand in current UI and backup filenames.

**Architecture:** Keep data mutations in the existing purchase actions. `PurchaseModule.vue` will stage the pending item list and assignments, show one confirmation modal, then call the existing single or batch action only after confirmation. The modal previews owner, Payton account classification, affected items, and totals without mutating store data.

**Tech Stack:** Vue 3 Composition API, existing Tailwind styles, Vitest and Vue Test Utils.

**Spec:** `docs/superpowers/specs/2026-11-02-purchase-inventory-owner-dialog.md`

## Global Constraints

- Preserve existing purchase and Payton balance mutation behavior.
- Support mixed Papa / Payton ownership within one purchase batch.
- Papa uses blue capsules; Payton uses purple capsules; Payton purpose uses Invest / Self-reserve capsules.
- Keep all confirmation and item scope details in the single dialog; no `prompt()` owner input.
- Set package version to `5.1.4`.
- Preserve the sales-channel value `PhtonRIng`; only correct the product name and generated backup filenames to `PhotonRing`.
- Initialize default Owner finance registries when a clean browser has no saved data, so Payton inventory intake can complete on first use.

## Review Focus

- Single-item action linked to a transfer moves and displays the full pending transfer group.
- Batch/group/transfer entry points pass all intended items exactly once.
- Cancel does not update item status or Payton balances.
- Payton investment and self-reserve balance preview matches the existing balance adjustment logic.
- Long lists remain readable and scrollable on narrow screens.

## Tasks

### Task 1: Lock down assignment rules and empty-browser defaults

Files: create `src/modules/purchase/inventoryAssignment.test.js`; update `src/data/store.test.js`.

1. Assert default Papa ownership and Payton's default investment classification.
2. Assert batch Owner application followed by row override yields mixed assignments and accurate totals.
3. Assert a blank local browser initializes the Payton registry before an intake action can adjust the account.

Expected: regression coverage fails before each corresponding fix.

### Task 2: Implement unified staging and confirmation

Files: update `src/modules/purchase/PurchaseModule.vue`.

1. Replace `promptOwnerAssignments()` and separated SID confirmation with one staged action model and one modal.
2. Wire single, selected batch, purchase group, and transfer record entry points to prepare rows and scope explanations.
3. Implement batch Owner capsules, per-item Papa/Payton capsules, conditional Invest/Self-reserve capsules, cost summaries, and non-mutating preview.
4. Confirm through existing single/batch store actions; cancel or close without mutation.
5. Re-run assignment helper, store, and focused `usePurchase` tests.

Expected: all acceptance behavior passes while preserving account mutations and operation logging.

### Task 3: Version and verify user-facing behavior

Files: update `package.json`, `package-lock.json`, and `pnpm-lock.yaml` version metadata.

1. Change only the app version from `5.1.3` to `5.1.4` in all lock metadata.
2. Run focused purchase tests, the full test suite, and production build.
3. Review the rendered dialog at desktop and narrow viewport sizes; check labels, scope, no overflow, and confirmation totals.
4. Review the final diff for unrelated changes, commit, and push the authorized 5.1.4 release to `main`.
5. Verify the sidebar title, remote read-only page title, help copy, and generated JSON backup names use the corrected brand.

Expected: clean checks, coherent mixed-owner flow, and GitHub Pages deployment triggered from the 5.1.4 main commit.
