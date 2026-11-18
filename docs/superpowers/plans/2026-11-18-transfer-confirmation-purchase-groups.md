# Transfer Confirmation Purchase Groups Implementation Plan

> **For agentic workers:** Implement this plan task-by-task in the current session.

**Goal:** Make same-named pending-transfer items distinguishable by purchase group in the transfer confirmation dialog.

**Architecture:** Add a pure grouping helper beside the existing purchase-group identity logic. Scope groups by batch plus `getPurchaseGroupKey`, then aggregate rows by SID within each group. Render the groups in `PurchaseModule.vue` while keeping selection keyed to underlying item IDs. Bump the patch version and push the completed commits.

**Tech Stack:** Vue 3 `<script setup>`, existing purchase grouping helpers, npm package metadata, Git.

---

### Task 1: Group pending transfer items

**Files:**
- Modify: `src/modules/purchase/purchaseGrouping.js`
- Modify: `src/modules/purchase/PurchaseModule.vue`

- [x] Add a helper that preserves first-seen group and item order. Group identity is the pair of `item.batch` and `getPurchaseGroupKey(item)`. Each group exposes `purchaseGroupId`, `purchaseDate`, a display label for legacy groups without an ID, and SID rows with `itemIds`, `qty`, `preTransferCost`, and summed `transferCoefficient`.
- [x] Replace the flat `groupedTransferItemsBySid` computed value with the helper applied to `filteredTransferItems` and `selectedItemIds`.
- [x] Render one group heading before its rows. Show the persisted purchase group ID, or a stable legacy group ordinal when absent, plus purchase date or “日期未记录”. Keep product name, SID, batch, quantity, in-transit cost, coefficient, checkbox, and global select/deselect controls.
- [x] Ensure row selection adds/removes only the `itemIds` for that SID in that group. Keep submit behavior, batch filtering, and fee allocation unchanged.

### Task 2: Bump patch version

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [x] Read the current version and increment the patch component by one in both files without changing dependencies.

### Task 3: Review and publish

**Files:**
- Review: `src/modules/purchase/purchaseGrouping.js`
- Review: `src/modules/purchase/PurchaseModule.vue`
- Review: `package.json`
- Review: `package-lock.json`

- [x] Run `git diff --check` and inspect the final diff for selection ID preservation, group boundaries, and version consistency.
- [x] Run the project production build as a compile check; it passed after installing the missing declared `exceljs` dependency.
- [ ] Commit implementation and version bump with a focused message.
- [ ] Push `main` to `origin` and verify the branch is synchronized.
