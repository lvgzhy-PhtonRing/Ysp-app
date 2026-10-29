# 销售确认入账与税务工作簿实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为每笔销售增加确认入账日，自动汇总 Papa 与 Payton 未确认金额，并按已确认销售的入账日生成税务核对工作簿。

**Architecture:** 继续以现有商品记录的 `saleDetails` 为销售事实来源，添加确认状态、入账日期和售前库存快照。新增纯计算层统一产生销售净额与待确认总额；销售、首页支付宝计算器、每日快照和税务工作簿共同调用该层，避免重复公式。工作簿在浏览器本地生成并下载，不上传或提交申报。

**Tech Stack:** Vue 3、JavaScript ES modules、Vitest、浏览器下载 API、`xlsx` 浏览器端工作簿生成依赖。

**Spec:** `docs/superpowers/specs/2026-10-29-sale-confirmation-design.md`

## Global Constraints

- 新销售默认未确认；确认时入账日默认为当天，允许编辑。
- 待确认金额为 `成交价 − 平台手续费 − 扣减`，不扣快递费。
- 销售登记即时更新现有销售/Payton 资金；确认开关只改变待确认扣减与税务入账日，不再次记账。
- Papa 与 Payton 的未确认销售都纳入首页待确认总额；旧版手工 `calc.unconfirmed` 迁移为 0。
- 旧销售默认已确认，入账日为原销售日期；无原销售日期时不猜日期，列入待确认事项。
- 新销售需保存售前库存状态和数量；旧销售回滚有包含售前状态的日志按日志恢复，否则先让用户确认恢复状态。
- 销售成本按每件商品自身实际成本记录；不得平均分摊或跨件混成本。
- 税务工作簿按入账日筛选已确认销售，不显示下单日；费用/利润是核对参考，不声称系统自动判定税法处理。
- 工作簿只在浏览器生成并下载；不登录、操作或提交税务网站，不上传工作簿。

## Review Focus

- 旧 JSON 缺少新字段时，所有历史销售都应迁移为已确认且不得产生自动待确认额；由 Task 1 的迁移测试覆盖。只有真实存在的 `YYYY-MM-DD` 日历日期才用于初始化 `entryDate`。
- 正负补差和手续费共同影响待确认金额，快递费已支出且不重复扣待收；由 Task 2 的公式测试覆盖。
- Payton 与 Papa 在各自页面筛选下都必须进入全局待确认合计，且首页/每日快照公式一致；由 Task 5 的跨 Owner 测试覆盖。
- 有售前库存快照与无日志旧销售回滚时恢复规则不同；由 Task 3 的回滚测试覆盖。
- 缺少入账日、非法日期或未确认销售不得悄悄进入税期汇总；由 Task 6 的工作簿测试覆盖。

---

## 文件结构

- `src/data/migrations/index.js`：旧销售确认字段及旧手工待确认值迁移。
- `src/data/migrations/index.test.js`：迁移兼容与缺日期用例。
- `src/modules/sales/saleAccounting.js`：纯函数，统一计算净回款、单笔待确认额和 Papa/Payton 待确认总额。
- `src/modules/sales/saleAccounting.test.js`：金额公式边界用例。
- `src/modules/sales/useSales.js`：保存售前状态、确认/取消确认、设置入账日、整笔回滚并冲销 Payton 资金。
- `src/modules/sales/useSales.test.js`：销售状态转换、余额不重复记账、回滚及资金恢复。
- `src/modules/sales/SalesModule.vue`、`src/modules/sales/SalesModule.test.js`：销售列表确认状态和入账日操作。
- `src/modules/inventory/sellPayload.test.js`：确保批量售出仍逐件保留独立销售行；默认状态由 `useSales.test.js` 覆盖。
- `src/data/store.js`、相关 store 测试：`takeDailySnapshot` 使用自动待确认总额，导入/导出字段自然随 `saleDetails` 保存。
- `src/data/cloudSlotPlan.test.js`：确认新增销售字段保留在云同步 items 槽位。
- `src/modules/home/HomeModule.vue`、`src/modules/home/HomeModule.test.js`：移除手工待确认输入，展示自动合计并传入支付宝计算器明细。
- `src/modules/tax-export/buildTaxWorkbook.js`：按入账日构建工作簿数据与工作表。
- `src/modules/tax-export/buildTaxWorkbook.test.js`：期间筛选、明细、汇总和待确认事项。
- `src/modules/tax-export/TaxExportModal.vue`、`src/modules/tax-export/TaxExportModal.test.js`：税期选择、预览与本地下载。
- `src/App.vue`、`src/components/AppSidebar.vue`、`src/components/AppSidebar.test.js`、`src/components/DataHelpModal.vue`：从“数据操作”打开报税导出并更新数据说明。
- `docs/2026-10-12-上海个体工商户报税系统调研与自动化建议.md`：将销售日期来源更新为入账日，并注明不展示下单日和参考口径。
- `package.json`、`package-lock.json`、`pnpm-lock.yaml`：增加 `xlsx` 浏览器端写出依赖并同步两份锁文件。

### Task 1: 迁移旧销售字段与历史手工待确认值

**Files:**
- Modify: `src/data/migrations/index.js`
- Test: `src/data/migrations/index.test.js`

**Interfaces:**
- Migration contract: `migratePayload(payload)` continues returning a cloned, backward-compatible payload.
- Historical sold rows gain `saleDetails.isConfirmed: true` and `saleDetails.entryDate` equal to a real calendar date matching `YYYY-MM-DD` in `saleDetails.date`; if absent/invalid, keep `isConfirmed: true` and leave `entryDate` empty for the tax export issue list.
- Sales that already have explicit confirmation fields retain them.
- Ensure `data.calc` is an object and normalize `data.calc.unconfirmed` to `0` during this migration.

- [ ] **Step 1: Write failing migration tests**
  - Add `migratesLegacySalesAsConfirmedWithOrderDateAsEntryDate` for dated sold rows.
  - Add `keepsExplicitConfirmationAndEntryDate` for already migrated rows.
  - Add `doesNotInventEntryDateForUndatedLegacySales`.
  - Add `doesNotCopyInvalidOrderDateToEntryDate` for malformed calendar dates.
  - Add `resetsLegacyManualUnconfirmedTotalToZero`.
- [ ] **Step 2: Run only the new migration tests and verify they fail**

Run: `npm test -- src/data/migrations/index.test.js`

Expected: the new assertions fail because migration does not currently populate these fields or reset the manual total.

- [ ] **Step 3: Implement the migration in `src/data/migrations/index.js`**
  - Modify only `saleDetails` on sold items and `data.calc.unconfirmed`.
  - Do not assign an entry date when source sale date is missing or invalid.
- [ ] **Step 4: Run migration tests**

Run: `npm test -- src/data/migrations/index.test.js`

Expected: all tests in the migration suite pass.

- [ ] **Step 5: Commit Task 1**

### Task 2: Centralize sales and pending amount calculations

**Files:**
- Create: `src/modules/sales/saleAccounting.js`
- Create: `src/modules/sales/saleAccounting.test.js`
- Modify: `src/modules/sales/useSales.js`
- Test: `src/modules/sales/useSales.test.js`

**Interfaces:**
- `getSaleNetProceeds(details) -> number`: `price - express - price * feeRate - deduction`.
- `getSalePendingAmount(item) -> number`: `price - price * feeRate - deduction` for sold, unconfirmed items; otherwise `0`.
- `getUnconfirmedSalesTotal(items) -> number`: sum pending amount over all Owners, independent of current UI filters.
- `useSales.js` imports `getSaleNetProceeds` instead of maintaining a private duplicate formula.

- [ ] **Step 1: Write failing tests for calculation helpers**
  - Add `pendingAmountExcludesFreightButIncludesFeeAndSignedDeduction` with 100 price, 8 freight, 1% fee, +10 deduction => pending `89`; with −10 deduction => `109`.
  - Add `unconfirmedTotalCombinesOwnersAndSkipsConfirmedRows` for Papa + Payton while ignoring confirmed and non-sold items.
  - Add `zeroAndInvalidNumericValuesAreSafe`.
- [ ] **Step 2: Run helper tests and verify they fail**

Run: `npm test -- src/modules/sales/saleAccounting.test.js`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the three pure helpers**
  - Treat non-finite/missing amounts as zero, matching `useSales.js` numeric handling.
  - For a pending row, retain the signed deduction in the exact formula; do not subtract freight.
- [ ] **Step 4: Add a regression assertion for the calculator reconciliation**
  - In `src/modules/sales/useSales.test.js`, assert that a Payton sale with price 100, freight 8, fee 1, deduction 0 produces account/fund delta 91 and pending amount 99; pending-adjusted delta is −8.
- [ ] **Step 5: Run the targeted sale calculation tests**

Run: `npm test -- src/modules/sales/saleAccounting.test.js src/modules/sales/useSales.test.js`

Expected: both suites pass, including existing net proceeds tests.

- [ ] **Step 6: Commit Task 2**

### Task 3: Confirmation transitions, inventory snapshot and full rollback

**Files:**
- Modify: `src/modules/sales/useSales.js`
- Modify: `src/modules/sales/useSales.test.js`
- Modify: `src/data/logReplay.js`
- Modify: `src/data/operationLogDisplay.js`
- Modify: `src/data/operationLogDisplay.test.js`
- Modify: `src/data/operationLogCompleteness.test.js`
- Create: `src/data/logReplay.test.js`

**Interfaces:**
- `setSaleConfirmation(itemId, confirmed, entryDate = '') -> boolean`.
  - On `confirmed === true`, set `isConfirmed = true`; preserve an explicitly supplied valid date or use today's local calendar date (not UTC date). No account mutation.
  - On `confirmed === false`, set `isConfirmed = false`, clear `entryDate`, and do not mutate account balances.
- `rollbackSale(itemId, restoreState = null) -> { status: 'rolled-back' | 'requires-restore-confirmation' }`.
  - Resolve restore state in this order: `saleDetails.beforeSaleState`, matching `sales_submit` log's `details.before`, explicit user-confirmed `restoreState`. If none exists return `requires-restore-confirmation` without mutation. On success reverse Payton's previously posted `getSaleNetProceeds(saleDetails)` once, restore state, remove `saleDetails`, and log full before/after state.
- `submitSell` stores `saleDetails.beforeSaleState = { status, stock }` before setting `status='sold'` and `stock=0`.
- `submitSell` always initializes new `saleDetails.isConfirmed = false` and `saleDetails.entryDate = ''`; confirmation happens only through `setSaleConfirmation` after sale creation.
- `revertSale` replay prefers `saleDetails.beforeSaleState`; legacy logs without it retain existing replay behavior.

- [x] **Step 1: Write failing tests for state changes**
  - `confirmationUsesLocalTodayAndDoesNotChangePaytonBalance`.
  - `unconfirmClearsEntryDateAndDoesNotChangePaytonBalance`.
  - `rollbackRestoresSavedStockAndReversesPaytonNetProceedsOnce`.
  - `legacyRollbackRequiresExplicitRestoreStateWhenNoBeforeSnapshotExists`.
  - Add log replay tests for snapshot-based restore and legacy log fallback.
  - Add readable operation-log display and completeness coverage for confirmation transitions.
- [x] **Step 2: Run targeted tests and verify they fail**

Run: `npm test -- src/modules/sales/useSales.test.js src/data/logReplay.test.js src/data/operationLogDisplay.test.js src/data/operationLogCompleteness.test.js`

Expected: FAIL because confirmation and centralized rollback functions are not implemented.

- [x] **Step 3: Implement the transitions and preserve operation-log reversibility**
  - Use `saleDetails.isConfirmed`/`entryDate` as the only confirmation source.
  - Preserve `beforeSaleState` through edits and backup serialization.
  - Do not make rollback silently restore one unit for a legacy sale without a snapshot.
- [x] **Step 4: Run targeted tests**

Run: `npm test -- src/modules/sales/useSales.test.js src/data/logReplay.test.js src/data/operationLogDisplay.test.js src/data/operationLogCompleteness.test.js`

Expected: both suites pass; existing edit operations still adjust only the net-proceeds delta.

- [x] **Step 5: Commit Task 3**

### Task 4: Surface confirmation controls and safe rollback in the sales UI

**Files:**
- Modify: `src/modules/sales/SalesModule.vue`
- Modify: `src/modules/sales/SalesModule.test.js`
- Modify: `src/modules/inventory/sellPayload.test.js`

**Interfaces:**
- Sales list shows a clear confirmed/unconfirmed status and entry date for each row.
- User can toggle confirmation and edit entry date from the sale edit dialog; toggling on sets local today by default.
- Inventory `卖出成交` already routes each item through `submitSell`; Task 3 makes that shared path create `isConfirmed: false` and blank `entryDate`; each item in a multi-item sale still keeps its own cost and its own sale row.
- Full rollback routes through `rollbackSale`; if no snapshot or log has both original status and stock, show a dialog requiring the user to choose a restore status and stock quantity before calling it.

- [ ] **Step 1: Add failing component tests**
  - Add `rendersOrderDateAndEntryDateAsSeparateFields`: assert order date and entry date use distinct labels and values.
  - Add `rendersConfirmedAndPendingStates`: assert both status labels appear for corresponding rows.
  - Add `requiresRestoreChoiceWhenLegacyRollbackHasNoSnapshot`: assert the restore dialog opens before any inventory mutation.
  - In the existing `useSales.test.js`, assert the inventory-shared `submitSell` path defaults to pending; in `sellPayload.test.js`, assert each batch item still has its own sale payload.
- [ ] **Step 2: Run the targeted component tests and verify they fail**

Run: `npm test -- src/modules/sales/SalesModule.test.js src/modules/sales/useSales.test.js src/modules/inventory/sellPayload.test.js`

Expected: FAIL on missing confirmation status/date controls and rollback confirmation.

- [ ] **Step 3: Implement minimal UI changes**
  - Keep the existing order-date field and shop selector behavior.
  - Add entry date separate from order date; label both plainly so they cannot be confused.
  - Keep existing deduction help text: “赔给买家填正数；买家补给我填负数”.
- [ ] **Step 4: Run targeted component tests**

Run: `npm test -- src/modules/sales/SalesModule.test.js src/modules/sales/useSales.test.js src/modules/inventory/sellPayload.test.js`

Expected: both suites pass and the sales row still displays/order-sorts by order date.

- [ ] **Step 5: Commit Task 4**

### Task 5: Replace manual home input and align saved snapshots

**Files:**
- Modify: `src/modules/home/HomeModule.vue`
- Modify: `src/modules/home/HomeModule.test.js`
- Modify: `src/data/store.js`
- Modify: `src/data/store.test.js`

**Interfaces:**
- Home module derives `unconfirmedTotal = getUnconfirmedSalesTotal(store.items)` and passes it to `calcAlipayBalance` and `buildAlipayBreakdown`.
- Remove the manual number input bound to `store.calc.unconfirmed`; display the computed amount as a read-only value.
- `takeDailySnapshot` records the derived total so cash-flow history agrees with the live calculator.
- Existing `calc.unconfirmed` remains in the persisted schema for backward compatibility but is initialized to zero by migration and is not used as the live source.

- [ ] **Step 1: Add failing tests for live calculator and snapshot totals**
  - Home with one Papa pending 99 and one Payton pending 50 shows total 149 even when `currentOwner` is either Papa or Payton.
  - Marking one sale confirmed reduces the total by exactly its pending amount.
  - Snapshot records the same calculated total as the live home view.
- [ ] **Step 2: Run targeted tests and verify they fail**

Run: `npm test -- src/modules/home/HomeModule.test.js src/data/store.test.js`

Expected: FAIL because home and snapshot still read the manual field.

- [ ] **Step 3: Use the shared helper in home and snapshot calculations**
  - Import only the pure accounting helper from `saleAccounting.js`; avoid importing `useSales.js` into `store.js`.
- [ ] **Step 4: Run targeted tests**

Run: `npm test -- src/modules/home/HomeModule.test.js src/data/store.test.js`

Expected: both suites pass; no calculator path uses the stale hand-entered amount.

- [ ] **Step 5: Commit Task 5**

### Task 6: Generate and download the tax workbook by entry date

**Files:**
- Create: `src/modules/tax-export/buildTaxWorkbook.js`
- Create: `src/modules/tax-export/buildTaxWorkbook.test.js`
- Create: `src/modules/tax-export/TaxExportModal.vue`
- Create: `src/modules/tax-export/TaxExportModal.test.js`
- Modify: `src/App.vue`
- Modify: `src/components/AppSidebar.vue`
- Modify: `src/components/AppSidebar.test.js`
- Modify: `src/components/DataHelpModal.vue`
- Modify: `package.json` and the repository lock file
- Modify: `docs/2026-10-12-上海个体工商户报税系统调研与自动化建议.md`

**Interfaces:**
- `buildTaxWorkbookData(payload, { startDate, endDate, taxpayer, owners }) -> { sheets, issues }` returns plain row arrays before XLSX serialization.
- `writeTaxWorkbook(workbookData, filename) -> void` creates and downloads the `.xlsx` entirely in the browser.
- Include only confirmed sales with valid `entryDate` within the inclusive selected period; do not include `saleDetails.date` (order date) in workbook output.
- Include separately: gross sale, each item cost, platform fee amount, express, signed adjustment and reference profit. Reference profit uses `price - cost - platformFee - express - deduction`; display the agreed 41 example only when deduction is zero.
- Missing/invalid entry dates and unconfirmed sales appear in “待确认事项”, not silently in period totals.
- The workbook contains the existing design's “阅读说明、申报步骤清单、增值税核对、A表经营数据、销售明细、收支明细、待确认事项” sheets; missing tax classifications and taxpayer mapping remain visibly marked for manual review.

- [ ] **Step 1: Add failing workbook builder tests**
  - `filtersConfirmedSalesByInclusiveEntryDate`.
  - `excludesUnconfirmedRowsAndListsThemAsIssues`.
  - `listsMissingEntryDateWithoutGuessing`.
  - `listsInvalidEntryDateWithoutGuessing`.
  - `keepsPerItemCostsAndSeparatesSignedAdjustments`.
  - `aggregatesOwnerAndPeriodTotalsWithoutOrderDateColumn`.
- [ ] **Step 2: Run workbook builder tests and verify they fail**

Run: `npm test -- src/modules/tax-export/buildTaxWorkbook.test.js`

Expected: FAIL because the exporter does not exist.

- [ ] **Step 3: Implement the plain-data workbook builder**
  - Keep data extraction separate from XLSX serialization so financial rules remain testable without a browser download.
  - Use the chosen browser XLSX writer only for workbook serialization; do not introduce server-side export.
- [ ] **Step 4: Implement export modal and route it from Data Operations**
  - Select inclusive period, taxpayer label, and Owner set; preview row counts, totals, and issues before download.
  - Do not imply that Owner identity automatically maps to a tax entity.
- [ ] **Step 5: Update tax-export design documentation**
  - Change the sales period field from `saleDetails.date` to `saleDetails.entryDate`.
  - State that order date is omitted and that timing/expense/profit outputs are preparation references subject to manual tax review.
- [ ] **Step 6: Run targeted export tests**

Run: `npm test -- src/modules/tax-export/buildTaxWorkbook.test.js src/modules/tax-export/TaxExportModal.test.js src/components/AppSidebar.test.js`

Expected: the builder and UI suites pass; export downloads locally and no upload/network call is made.

- [ ] **Step 7: Commit Task 6**

### Task 7: End-to-end regression and backup compatibility

**Files:**
- Modify: `src/data/store.test.js`
- Modify: `src/data/cloudSlotPlan.test.js`

**Interfaces:**
- A sale's `isConfirmed`, `entryDate`, and `beforeSaleState` survive `exportData` → JSON serialization → `migratePayload` → `loadData`.
- Old payloads migrate per Task 1; new payloads retain explicit user changes.

- [ ] **Step 1: Add a round-trip regression test**
  - Add `roundTripsPendingSaleConfirmationFieldsThroughJsonExportAndLoad`: export a pending Payton sale with before-state; serialize/parse; load it; assert pending total, stock restore snapshot and sale fields survive.
  - Add `roundTripsConfirmedHistoricalSaleEntryDateThroughJsonExportAndLoad` for an already-confirmed Papa sale.
  - Add `itemSlotSerializationKeepsConfirmationFields` in `src/data/cloudSlotPlan.test.js` to assert the cloud-sync item slot retains the new fields.
- [ ] **Step 2: Run the targeted regression tests and verify the new test fails**

Run: `npm test -- src/data/store.test.js src/data/migrations/index.test.js`

Expected: the new round-trip test fails until serialization/migration preserves all sale fields.

- [ ] **Step 3: Fix only the serialization or slot-normalization path if either round-trip test drops the new fields**
- [ ] **Step 4: Run the full automated test suite and production build**

Run: `npm test`

Expected: all Vitest suites pass.

Run: `npm run build`

Expected: Vite finishes without errors and generates the production bundle.

- [ ] **Step 5: Commit Task 7**

## Self-Review

- **Spec coverage:** Sales order-date behavior is Task 4; confirmation and entry date are Tasks 1–4; Payton/Papa calculations are Tasks 2 and 5; rollback and restoration are Task 3; JSON/backup compatibility is Tasks 1 and 7; tax workbook filtering, display, and caveats are Task 6.
- **Step scan:** Each task has named tests, implementation paths, and expected command results; no code implementation is embedded in the plan.
- **Type consistency:** Shared amounts use plain JS numbers; confirmation field is `saleDetails.isConfirmed`; tax date is `saleDetails.entryDate`; pre-sale state is `saleDetails.beforeSaleState`.
- **Review Focus:** All five cases map to Tasks 1–6 and have named tests.
- **Proportion:** Seven independent, reviewable task deliverables cover data migration, accounting logic, UI, home totals, workbook output, and backup round-trips.
