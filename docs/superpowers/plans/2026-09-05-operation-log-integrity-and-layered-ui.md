# 操作日志：完整性补全 + 自动验证 + UI 分层重构（计划书）

> 日期：2026-09-05 · 状态：执行中（进度见 `docs/操作日志改造执行中断记录-20260905.md`）

## 用户需求（原始）

1. 只做操作日志的研究/改造，不要改进别的功能
2. 验证操作日志内容的完整性：完整性要求「每日快照 + 操作日志」能完整回溯到某个时间点的数据
3. 改进"查看详情"：第一层显示简要信息（如动作分类"删除了5件库存"），点击详情显示详细信息（如 5 件商品的详细名称）
4. 设计分层显示：第一层简要清晰，第二层能看到详情；没有第二层信息的日志不显示查看详情按钮

## 用户已确认的方案决策

- **验证深度**：补全日志 + 自动验证（不新增用户可见的"恢复到某时间点"功能界面）
- **详情形态**：行内展开（点击行原地展开第二层详情），**移除**现有无用的日志详情弹窗

## 研究结论（现状与问题）

日志写入集中在 `src/data/store.js` 的 `addOperationLog`（~1076 行：`{id, time, type, message, detail}`，500 条上限，存于 localStorage `ysp_ui`）。已确认三类问题：

1. **完整性缺口（无法回溯）**：`inventory_delete`/`purchase_delete` 只记 `{name, sid, itemId}`，完整商品对象（成本、采购/销售明细）随删除永久丢失；`sales_rollback`（SalesModule.vue）不记被清除的 `saleDetails`；`purchase_transfer_delete` 只记 `{transferId}`；finance 删除类不记完整记录；多种批量操作缺商品名称/id。每日快照仅 8 个汇总指标（`takeDailySnapshot`），无商品级数据，无法兜底。
2. **详情弹窗无用（已确认）**：App.vue 1268-1385 的日志详情弹窗重复显示 message，`日志ID/详情字段数` 无意义，`getLogDetailEntries` 白名单只显示 13 个字段，嵌套对象显示"[复杂数据，请查看上方明细]"占位符。
3. **层级混乱**：每个折叠行都显示"点击查看详情"（App.vue ~1263），即使该日志无任何额外信息；标题写"(近7天)"实际是 `slice(0, 100)`。

**回溯模型**（写入验证报告）：日志补全后，每条日志含完整 before 数据即可从当前状态**反向回放**还原到任意时间点（`reconstructCalcField` 已验证此模式）；500 条窗口之外以每日 JSON 备份（含全量数据+日志）为基线正向回放。每日快照保持 8 指标不变（2026-06-08 设计已论证体积原因：1KB/天 vs 1MB/天）。

**硬约束**：
- 写时 `message` 不能改（`attachHistoryMetaFromOperationLog` 将 message 供 undo 栈标签复用）；第一层简要语句由 UI 层从 detail 生成，旧日志回退显示 message
- 只增加 `detail` 字段，不改业务逻辑
- 旧日志（已存量的）缺的数据无法追补，UI 以回退方式兼容

---

## 改动一：日志内容补全（数据层）

| 调用点 | 补全内容 |
|---|---|
| `useInventory.js` deleteItem | detail 增加 `deletedItems: [clone(完整item)]`（含 cost/purchaseDetails/saleDetails/status） |
| `useInventory.js` submitManualAdd | detail 增加 `itemId` |
| `usePurchase.js` deletePurchaseItem | 同 deleteItem，加完整 item 克隆 |
| `usePurchase.js` submitTransfer | itemCosts 每项 `{itemId, sid, name, costBefore, costAfter}`（costBefore 在变更前捕获） |
| `SalesModule.vue` rollbackSale | 增加 `itemId` + `before: {status, stock, saleDetails: 克隆}`（变更前捕获） |
| `useSales.js` sales_edit | 增加 `itemId`、`name`（原来只有 sid） |
| `useSales.js` sales_unlist | 增加 `itemId`、`before: {status: 'sold'}` |
| `useFinance.js` finance_add_record | 增加 `recordId` |
| `useFinance.js` finance_delete_record | 增加完整 `record: clone(record)` |
| `useFinance.js` finance_update_record | 增加 `recordId` |
| `useFinance.js` finance_add_loan | 增加 `loanId` |
| `useFinance.js` finance_delete_loan | 增加完整 `loan: clone(loan)` |
| `PurchaseModule.vue` purchase_group_edit | 增加 `itemNames` |
| `PurchaseModule.vue` 编辑购买组时逐条 purchase_delete（removedRows） | 增加 `deletedItems` 完整克隆 |
| `PurchaseModule.vue` purchase_transfer_delete | 增加完整 `transfer: clone(record)` + `affectedItems`（每件变更前的 cost/transferId/transferBatch/transferStatus/transferCost）+ `count` |
| `PurchaseModule.vue` purchase_edit（submitEdit） | 增加 `name` |
| `InventoryModule.vue` inventory_sales_sync | logMap 增加 itemIds 收集；detail 增加 `name`、`itemIds` |
| `InventoryModule.vue` inventory_long_term | 增加 `itemIds` |

**store.js 删除聚合同步扩展**：500ms 合并窗口内累加 `deletedItems` 数组（完整对象随合并保留）。

## 改动二：自动完整性验证

1. **新模块 `src/data/logReplay.js`**（纯函数，不依赖 store 实例）：
   - `LOG_DETAIL_CONTRACT`：每种日志类型的回溯必需字段契约表
   - `validateLogDetail(log)` → `{ok, missing[]}`
   - `reconstructAtTime(currentState, logs, targetTime)`：逆序回放日志（时间 > targetTime，从新到旧应用逆操作），操作 `{items, financeRecords, loanRecords, transfers, calc}`，返回 `{state, skipped[], barriers[]}`
   - 逆操作 handler 覆盖：delete 类（重插 deletedItems 克隆）、edit 类（应用 changes.before）、sales_submit/rollback/unlist（恢复 before 状态/ saleDetails）、purchase_to_inventory（恢复 status='purchase'、删 inStockDate）、purchase_transfer（恢复 costBefore、清 transfer 字段、transfers 移除该记录）、purchase_transfer_delete（重插 transfer + 恢复 affectedItems）、finance 增删改、calc_update
   - **回放屏障**（遇到即停止并记录）：`app_import`、`cloud_pull`、`app_undo`、`app_redo`（整体状态替换，日志无法表达）
   - 无业务变更的日志类型（cloud_sync 等）为 no-op；无法精确逆放的类型（如 market_price_update）记入 skipped
2. **测试**（vitest，co-located）：
   - `src/data/operationLogCompleteness.test.js`：契约测试（执行每个模块的增删改后断言 detail 含必需字段，重点：删除后能从日志还原完整商品）+ 往返测试（种子数据→记录 T0→执行 采购/转运/入库/销售/编辑/回滚/删除/财务 序列→仅用日志反向回放→与 T0 状态深度相等，**items 比较按 id 排序后对比**，不比较数组顺序）
   - `src/data/operationLogDisplay.test.js`：brief/sections/hasLogDetail 按类型测试 + 旧日志回退
3. **验证报告** `docs/操作日志完整性验证报告-20260905.md`：研究发现（含 file:line）、逐类型回溯能力覆盖表（可完整回溯/部分/仅契约校验/回放屏障）、已知边界（500 条上限、日志仅存本机 `ysp_ui` 不同步云端、旧日志无法补录、快照仅汇总指标的原因）、回溯模型说明。

## 改动三：UI 分层重构（行内两层，移除详情弹窗）

1. **新模块 `src/data/operationLogDisplay.js`**（从 App.vue 迁出并重构）：
   - `LOG_TYPE_META`：label/icon/pillClass（迁移 App.vue 74-211 现有映射）；`getLogMeta(type)` 含未知类型回退；`getLogModule(type)`（App.vue 264-277 迁移）
   - `getLogBrief(log)` → 第一层简短语句，按类型模板从 detail 生成，回退 `log.message`。示例：
     - 多件删除 → `删除了5件库存` / 单件 → `删除库存：商品A`
     - `记录销售：商品A ×1`、`编辑库存：商品A（成本 ¥80→¥87）`、`删除收支：买保护壳（¥50）`、`更新参数：总负债 ¥1760→¥893`
   - `getLogDetailSections(log)` → 第二层结构化区块数组，区块形态：
     - `{kind:'changes', title:'修改明细', rows:[{field,before,after}]}`（字段名经 FIELD_LABEL_MAP 中文化）
     - `{kind:'items', title, columns, rows}`（deletedItems→名称/SID/成本/状态表；sidSummary→SID/名称/日元原价/件数；itemCosts→SID/名称/转运前/转运后；affectedItems）
     - `{kind:'names', title:'删除的商品', names[]}`（itemNames / deletedNames 兜底）
     - `{kind:'kv', title:'其他信息', entries}`（**其余全部字段**，不再白名单丢弃、无占位符；嵌套值转紧凑 JSON）
     - `{kind:'raw', title:'原始数据', json}`（默认折叠；复用现为死代码的 getLogRawJson 逻辑）
   - `hasLogDetail(log)` → 除 raw 外区块数 > 0
2. **App.vue 日志面板改造**：
   - 第一层行：彩色类型标签 + `getLogBrief(log)` + 时间；**仅当 `hasLogDetail(log)`** 显示"详情 ▾"提示，否则无任何详情引导、点击不展开
   - 点击有详情的行 → 行内展开第二层，按区块类型渲染（复用现有表格样式：indigo 修改明细 / green 商品清单 / red 删除清单等）
   - **删除日志详情弹窗**（1268-1385）及脚本：`showLogDetailModal`、`selectedLog`、`showLogMeta`、`openLogDetail`、`formatLogDetailValue`、`getLogDetailEntries`、`getLogModule`、`getLogRawJson`、`logTypeMeta`、`getLogMeta`、`formatLogKey`（改为从新模块导入）
   - 标题修正：`(近7天)` → `(最近100条)`（与实际 `slice(0, 100)` 一致）
   - 撤销/重做/清空日志按钮、`toggleExpand`/`expandedLogId` 保留不动

## 明确不做的事

- 不改业务逻辑、undo/redo、云同步、每日快照内容、其他模块 UI
- 不改写时 message 文本（undo 栈标签依赖它）
- 不做用户可见的"恢复到某时间点"功能（reconstructAtTime 仅作验证工具）
- 不迁移/补录旧日志（旧日志缺的数据无法追补，UI 以回退方式兼容显示）
- 500 条日志上限不变（超窗口回溯以每日 JSON 备份为基线，写入报告）

## 验证方式

- `npm test` 全部通过（现有用例 + 新增完整性/显示用例）
- `npm run dev` 手动验证：删除 5 件同 SID 商品 → 第一层显示"删除了5件库存"→ 展开显示 5 个名称及完整属性；无详情日志（如系统撤销）不显示详情按钮；详情弹窗不再出现
