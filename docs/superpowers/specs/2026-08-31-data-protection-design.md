# 数据保护三件套：详细日志 + 覆盖强提示 + 每日备份 设计

日期：2026-08-31
代码基准：`origin/main`（**APP_VERSION 3.10.0**，含内容级冲突比对 9d2b0dc）

## 背景：一次数据丢失事故的根因

2026-08-28，设备A 的本地数据被云端静默覆盖，覆盖后用户 8-28~8-31 的操作（销售×4、移库×12、购买组编辑、ARBOX 增删移库）**多数只写进操作日志、未写入业务数据**。唯一恢复依据就是操作日志（331 条）。

| 根因 | 位置 | 说明 |
|---|---|---|
| 静默覆盖 | `App.vue` `loadCloudOnStartup`（3.10.0 line 648-651） | 云端时间戳较新 → **无条件** `applyCloudDataToStore`，不比对内容 |
| 日志字段不全 | `addOperationLog` 各调用点 | 缺 `itemId`、关键字段 before/after、联动变化（如删除商品致购买组价 352→310） |
| 无备份 | — | 覆盖发生前本地数据无任何副本，只能靠日志回忆 |

本次设计目标：**让下一次事故要么不发生、要么可恢复、要么有记录**。

## 目标

| 方向 | 一句话 | 成功标准 |
|---|---|---|
| A 详细日志 | 每条操作可被脚本完整还原 | 日志含 `itemId` + 关键字段 before/after + 联动变化；删除/移库等漏记路径补齐 |
| B 覆盖强提示 | 重大云端异常（记录骤减/时间倒流）在覆盖本地前弹窗确认 | 检测到异常时必弹窗，取消则保留本地并记录决策依据 |
| C 每日备份 | 每天自动下载一份完整本地数据到 Downloads | 每设备每日一份 `饮食派数据_YYYYMMDD.json`，含操作日志 |

## 开发前提（已完成）

本地 `main` 已 `git merge origin/main` 同步至 **3.10.0**（此前落后 13 个提交、缺失冲突比对代码）。

## 不改的部分

- `addOperationLog` 机制：500 条上限、删除聚合（500ms 窗口）、独立存 `ysp_ui` 不随云上传
- 云同步协议（Supabase REST、last-write-wins）、`exportData()` 主结构
- 现有 5 分支冲突比对逻辑（`isContentEqual` / `computeConflictDiff` / `askCloudConflict`）
- 快照（`takeDailySnapshot`）、历史栈（undo/redo）逻辑
- 任何模块的业务计算逻辑

## 架构总览

新增一个集中式服务文件，逻辑与 DOM/同步解耦，纯函数可单测：

```
src/services/dataProtection.js   ← 新建：B/C 的纯函数 + 下载薄壳
src/services/operationLogger.js  ← 新建：A 的 detail 构造辅助（统一 before/after 详情结构）
```

| 文件 | 导出 | 性质 |
|---|---|---|
| `dataProtection.js` | `shouldWarnBeforeOverwrite`、`isBackupDue`、`downloadJsonBackup` | 前两个纯函数；下载为 DOM 薄壳 |
| `operationLogger.js` | `buildItemChangeDetail` 等 | 纯函数，集中构造统一的 before/after 详情 |

接入点共 3 处：`App.vue`（B 拦截）、`store.js` `saveToLocalStorage`（C 触发）、各模块日志调用点（A 增强）。

---

## 方向 A：操作日志详细化

### A1. 补齐漏记路径

| 路径 | 现状 | 修复 |
|---|---|---|
| 购买组内**单行删除**（JP-01C7 案例） | 走 `purchase_group_edit` 或批量删除，未记商品删除 | 单行删除补记 `purchase_delete`（含 itemId） |
| 同转运批次整组入库 | 已记，但缺 itemId 列表 | detail 增加 `itemIds: []` |

### A2. 统一 detail 结构（`operationLogger.buildItemChangeDetail`）

每个商品类操作日志 detail 补齐：

| 字段 | 含义 |
|---|---|
| `itemId` | 稳定主键（脚本定位唯一依据） |
| `sid` / `name` | 可读标识 |
| `before` / `after` | 变更的关键字段 `{ cost, 汇率, price, stock, status, 备注 }` 快照（仅记录实际变化的字段） |

**既有调用点逐个增强**（示例，完整清单见实现计划）：

| 调用点 | 当前 detail | 增强为 |
|---|---|---|
| `sales_submit` (useSales.js:62) | `{name,sid,qty,price}` | + `itemId`、`cost`、`express`、`feeRate`、`deduction`、`date`、`profit`、`before{status,stock}` |
| `purchase_to_inventory` (:241/248) | `{name,sid,inStockDate}` | + `itemId`、`count`（整组移动）、`before{status:'purchase'}` |
| `purchase_transfer` (:219) | `{transferId,count,totalRMB}` | + `itemIds[]`、`before/after`（分摊后 cost 变化） |
| `purchase_delete` (:285) | 已有 itemId | + `groupPriceBefore/After`（联动购买组总价） |
| `purchase_group_edit` (PurchaseModule.vue:1315) | 汇率等编辑 | + 所涉 `itemId[]`、关键字段 before/after |
| `inventory_unlist` (InventoryModule.vue:673) | — | + `itemId`、before/after |
| `purchase_add` (usePurchase.js:167 / PurchaseModule.vue:959) | — | + `itemId`、`groupId` |

### A3. 联动变化

删除/移库/改汇率等**影响整组**的操作，日志 detail 追加计算后的连锁影响：
`groupPriceBefore/groupPriceAfter`（购买组总价）、`inventoryCountBefore/After`（库存数）、`profitDelta`（利润差）。这些值由操作点的现有计算逻辑自然产出，不新增重复计算。

### A4. 同步决策依据

`cloud_conflict` 日志（App.vue 606/618/623/634/640）detail 统一增加：
`{ countDiff, lastSaleBefore, lastSaleAfter, reasons[] }`（`reasons` 复用方向 B 的 `shouldWarnBeforeOverwrite` 返回值）。

---

## 方向 B：覆盖前强提示

### B1. 纯函数 `shouldWarnBeforeOverwrite(localPayload, cloudPayload)`

```
输入：本地 exportData() 与 云端 payload
输出：{ shouldWarn: bool, reasons: string[], countDiff: number, lastSaleLocal: string, lastSaleCloud: string }
```

| 检测 | 规则 | 常量 |
|---|---|---|
| 数量骤减 | `cloudItems < localItems − max(THRESHOLD_MIN, ⌊localItems × THRESHOLD_RATIO⌋)` | `THRESHOLD_MIN = 5`，`THRESHOLD_RATIO = 0.10` |
| 时间倒流 | `lastSaleDate(cloud) < lastSaleDate(local)`（items 中 `saleDetails.date` 最大值，ISO 字符串比较） | — |

边界处理：任一侧 items 缺失/非数组 → 不警告；local 无商品（首次同步）→ 不警告；cloud 为 0 条 → 警告（数量骤减）；时间倒流仅在两侧 `lastSaleDate` 均非空时比较，任一侧为空 → 不命中该项。命中任一规则 → `shouldWarn=true`，`reasons` 列出全部命中项。

### B2. 拦截点

`loadCloudOnStartup` 中所有「用云端覆盖本地」的执行前统一拦截（3.10.0 两处）：

| 分支 | 位置 | 说明 |
|---|---|---|
| 静默覆盖（**主目标**） | line 649 `applyCloudDataToStore` | 云端较新或无法比较 → 覆盖前先检测 |
| 显式选择「云端」 | line 632 `choice === 'cloud'` | 已见 diff，但异常信息仍前置展示，防误点 |

拦截逻辑（新增 `confirmCloudOverwrite(cloudPayload)` 辅助）：

```
shouldWarn = shouldWarnBeforeOverwrite(localPayload, cloudPayload)
若 !shouldWarn → 按原逻辑覆盖（零打扰）
若 shouldWarn → 弹窗：
  「云端数据疑似异常：本地 N 条 → 云端 M 条（少 X 条）
   且/或 最后销售 本地 08-26 早于云端…，确认用云端覆盖本地？」
   [覆盖] → 原逻辑继续，日志记 reasons + userConfirmed:true
   [保留本地] → 跳过覆盖，日志记 cloud_conflict「检测到云端异常，已保留本地」+ reasons
```

弹窗复用现有自定义对话框样式（`askCloudConflict` 同款），不引入新依赖。

---

## 方向 C：每日自动备份

### C1. 触发点

`store.js` `saveToLocalStorage` 末尾（`setPersistedSnapshot` 之后）调用 `maybeAutoBackup()`。

```
maybeAutoBackup():
  today = todayDateStr()
  若 document.visibilityState !== 'visible' → 跳过（后台静默兜底上传时不触发）
  若 uiState.lastAutoBackupDate === today → 跳过（一天一次）
  下载 exportData() + operationLogs → 饮食派数据_YYYYMMDD.json
  uiState.lastAutoBackupDate = today
  saveUiStateToLocalStorage()
  addOperationLog('app_auto_backup', ...)
```

### C2. 备份文件内容

```js
{ ...exportData(), operationLogs }
```

> 说明：相比手动导出（`exportData()`），备份**额外包含 operationLogs**。本次事故恢复恰恰全靠日志，若备份不含日志，覆盖后日志仍会丢失。文件为 `exportData()` 的超集，`loadData` 忽略未知键，回导兼容。若大王陛下倾向与手动导出完全一致，可去掉 `operationLogs`（改动一处）。

### C3. 浏览器下载拦截兜底

非用户手势的自动下载可能被 Chrome 静默拦截。兜底：`downloadJsonBackup` 触发下载后，界面顶部短暂显示「已生成今日备份 `饮食派数据_YYYYMMDD.json`，若未自动下载请点此」的手动下载入口。手动下载为真实用户手势，必定成功。

---

## 错误处理

| 场景 | 行为 |
|---|---|
| 自动下载被拦截 | 界面显示手动下载入口（B3），数据已在内存生成，点击即下载 |
| 备份下载异常 | 不影响 `saveToLocalStorage` 主流程；吞掉异常并记日志 |
| 强提示弹窗取消 | 跳过覆盖，保留本地；不改变云状态 |
| 检测函数遇脏数据 | 返回 `shouldWarn=false`（宁可静默，不误伤正常同步） |

## 测试计划（vitest，纯函数）

| 测试文件 | 用例 |
|---|---|
| `dataProtection.test.js`（新建） | `shouldWarnBeforeOverwrite`：不警告（数量相等/云端更多）、警告（少 5 条、少 ≥10%、时间倒流、两者兼中）、边界（local 空、cloud 空、items 缺失）；`isBackupDue`：同日/跨日/空值 |
| `operationLogger.test.js`（新建） | `buildItemChangeDetail`：仅记录实际变化字段、before/after 正确 |
| `store.test.js`（扩充） | `saveToLocalStorage` 触发 `maybeAutoBackup` 的日期去重逻辑 |

## 验收标准

1. **A**：删除购买组单行商品 → 日志含 `purchase_delete` + itemId + 组价 before/after；销售日志含完整成本利润链路
2. **B**：本地 100 条、云端 90 条且时间戳更新 → 弹窗拦截；点「保留本地」→ 本地数据不变、日志含 reasons
3. **C**：每日首次保存 → Downloads 生成 `饮食派数据_YYYYMMDD.json`；同日再次保存不再下载
4. `npm test` 全部通过；`npm run build` 通过
