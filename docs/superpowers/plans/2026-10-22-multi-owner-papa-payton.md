# Papa / Payton 双 Owner 实施计划

> **执行方式：**由当前助手在现有可写项目目录逐项执行；按任务先写失败测试、再实现。工作区受系统权限限制，未能使用隔离 worktree。按用户交接要求，不委派子代理、不提交。

**目标：**将 YSP 升级为 Papa / Payton 双 Owner 进销存与资金系统，并按 2026-10-15 截点安全导入 car 的 240 辆车辆和资金期初。

**架构：**旧数据通过纯迁移函数补 `owner='papa'`，Payton 资金收存在 `ownerRegistry.payton`，车辆及普通收支仍复用 YSP 现有记录。一次性导入脚本生成完整 payload 和报告；应用内通过所有权过滤、账户联动及第十个云槽位维护两方数据。

**技术栈：**Vue 3、JavaScript ES modules、Vite、Vitest；导入脚本只用 Node.js 内置模块，不增加依赖。

**设计：**`docs/superpowers/specs/2026-10-21-multi-owner-papa-payton-design.md`

## 全局约束

- 应用版本从 `4.0.34` 升至 `5.0.0`。
- 不增加依赖；car 原项目及 `public/ysp-remote.html` 不改。
- 现有 9 个云同步槽位保留，新增 `ownerRegistry` 第 10 槽位。
- 车库导入范围固定为 240 辆，含 10/19 售出的宝马 507；不导 10/15 前已售车辆及历史交易流水。
- 导入脚本不覆盖输入 JSON；Payton 基金按带符号原值加至支付宝公式；车辆资产不进入该公式。
- `npm test` 和 `npm run build` 均须通过；真实数据验收只写入临时目录。

## 评审重点

1. 带 UTF-8 BOM、损坏或结构不完整的输入不得覆盖源文件；脚本测试覆盖编码、校验和输出路径保护。
2. 重复 car SID、已有 Payton 商品和重跑后的已售状态必须保留；导入测试覆盖冲突、跳过与幂等。
3. 相同 SID、品牌或名称出现在两个 Owner 时，编辑、市场价联动、销售分析和账龄聚合不能跨 Owner；各模块测试明确断言隔离。
4. 部分还款、贷款清零、编辑／删除资金记录和互转配对都须守恒；Payton 财务测试覆盖这些边界。
5. 旧快照无 Payton 字段以及 Payton 开账日之前的月份应能正常显示空值；store 与现金流测试覆盖降级。

---

### 任务 1：数据迁移、状态与第十云槽位

**文件：**
- 新建：`src/data/migrations/index.js`
- 新建：`src/data/migrations/index.test.js`
- 修改：`src/data/store.js`
- 修改：`src/data/cloudSlotPlan.js`
- 修改：`src/data/cloudSlotPlan.test.js`
- 修改：`src/data/store.test.js`
- 修改：`package.json`

**接口：**`migratePayload(payload) -> migratedPayload` 为不修改输入的纯函数；`state.ownerRegistry` 持久化进业务 payload；`state.currentOwner` 只进 `ysp_ui` 本地界面状态。

- [x] 写迁移测试：旧 items（含 purchase）、收支和 Papa 借贷补 Papa owner；缺失 registry 初始化默认值；已有 owner／registry 不被覆盖；原对象不变。
- [x] 运行迁移测试，确认按预期失败。
- [x] 实现幂等迁移并在 `loadData()` 的首段调用；扩展 `exportData()`／`loadData()` 和 UI 状态持久化；版本设为 `5.0.0`。
- [x] 写第十槽位测试：`ownerRegistry` 是对象槽位，能通过类型检查、规范化、版本比较和冲突合并。
- [x] 运行迁移、store、cloudSlotPlan 测试，确认通过（72 tests）。

### 任务 2：真实 car 截点导入脚本

**文件：**
- 新建：`scripts/car-import.mjs`
- 新建：`scripts/car-import.test.js`
- 测试数据：`src/__tests__/fixtures/carImport.json`（最小 fixture）

**接口：**导出 `parseCarExport(text)`、`buildCarImport(carPayload, yspPayload)`、`runImport({ carPath, yspPath, outPath })`；CLI 接受 `--car`、`--ysp`、`--out`。

- [x] 写测试：10/15 cutoff 选择 239 辆未售加 10/19 宝马 507；排除 cutoff 前已售；名称子类去重；映射 owner、类别、批次、成本和长短线。
- [x] 写测试：按 10/15 交易计算 pocket −305.96、invest +366.54；仅导入 3 笔 active 贷款；拒绝重复／冲突 SID；重复运行不覆盖已有 Payton 项。
- [x] 写测试：读取 BOM JSON；拒绝损坏结构和输入／输出路径相同；输出 `.bak` 为 YSP 源文件原字节；源文件不变；Payton registry 记录最新快照日期和 BMW 待补售 SID。
- [x] 运行导入测试，确认失败原因对应缺失行为。
- [x] 实现无依赖 Node ESM 脚本；确定性生成唯一 item id；写完整合并 payload、备份和报告；备份存在时保留首份源备份。
- [x] 运行导入测试，确认通过（5 tests；真实 JSON 实导入 240 项并重复运行 0 新增）。

### 任务 3：Payton 资金模型与操作

**文件：**
- 新建：`src/modules/payton-finance/usePaytonFinance.js`
- 新建：`src/modules/payton-finance/usePaytonFinance.test.js`
- 修改：`src/data/store.js`（默认 registry 字段，如有必要）

**接口：**导出 `getPaytonFund(registry = state.ownerRegistry)`、`getPaytonAccountForItem(item)`、`adjustPaytonBalance(account, delta)`、`addPaytonExpense(data)`、`updatePaytonExpense(id, patch)`、`deletePaytonExpense(id)`、`addMonthlyAllowance(date)`、`createPaytonLoan(data)`、`addPaytonLoanEvent(loanId, event)`、`updatePaytonLoanEvent(loanId, eventId, patch)`、`deletePaytonLoanEvent(loanId, eventId)`、`addPaytonTransfer(data)`、`updatePaytonTransfer(id, patch)`、`deletePaytonTransfer(id)`。`adjustPaytonBalance` 只改余额；调用方负责同一业务动作的持久化与日志。余额只存 pocket、invest 和各贷款 remaining；基金即时计算。

- [x] 写测试：基金为 `pocket + invest − active remaining`；Payton 普通收入／支出只改 pocket，不进入 Papa 公共支出。
- [x] 写测试：同月零花不可重复；零花记录编辑／删除按差额改 pocket。
- [x] 写测试：新增贷款／部分还款／全额还款同时更新 invest 与 loan；本金事件不改变基金；关联事件删除后金额守恒。
- [x] 写测试：互转两端等额异向，编辑／删除成对回滚，基金不变。
- [x] 运行资金测试确认失败，再实现最小操作函数并使测试通过（6 tests）。

### 任务 4：商品归属及采购／销售余额联动

**文件：**
- 修改：`src/modules/inventory/useInventory.js`、`useInventory.test.js`
- 修改：`src/modules/purchase/usePurchase.js`、`usePurchase.test.js`
- 修改：`src/modules/sales/useSales.js`、`useSales.test.js`
- 修改：`src/modules/sales/SalesModule.vue`

**接口：**沿用现有业务入口；新采购默认为 Papa 暂管；入库时逐项指定 owner，Payton 商品指定投资／自留。统一按成本差及实际净回款联动 Payton 对应账户。

- [x] 写库存测试：筛选和分组隔离 Owner；同 SID 编辑只改同 owner；成本更正和 owner 转移按差额调整账户；删除 Payton 车区分误录返还与遗失报废不返还。
- [x] 写采购测试：单件／批量／同转运批次可混合分配 owner；转入 Payton 后从 Papa 采购成本移除并扣最终成本；转运费用重算按差额修正。
- [x] 写销售测试：Payton 销售只增加净回款；费用／售价编辑和销售回滚同步修正；Papa 销售行为不改 Payton 账户。
- [x] 逐模块运行测试确认失败；再实现对应变更并运行测试确认通过（13 tests）。

### 任务 5：Owner 分析、资金公式与数据保护

**文件：**
- 修改：`src/utils/calc.js`、`src/utils/calc.test.js`
- 修改：`src/modules/finance/useFinance.js`、`useFinance.test.js`
- 修改：`src/modules/sales-analysis/useSalesAnalysis.js`、`SalesAnalysisModule.vue`
- 修改：`src/modules/market-price/useMarketPrice.js`、`useMarketPrice.test.js`
- 修改：`src/modules/inventory/useInventoryAging.js`、`useInventoryAging.test.js`
- 修改：`src/modules/home/useCashflow.js`、`useCashflow.test.js`
- 修改：`src/services/dataProtection.js`、`src/services/dataProtection.test.js`

- [x] 写公式测试：正负基金按原符号加入；真实期初为 −¥5,511.48；增加宝马 ¥15 回款后为 −¥5,496.48；Payton 车辆价值不入计算器。
- [x] 写统计测试：Papa 收支、毛利和净利润分开；各分析只接收当前 owner 数据；市场价联动限定同 owner；分组键加入 owner。
- [x] 写账龄与现金流测试：当前 owner 隔离；Payton 2026-10-15 前没有月数据，使用空值；旧快照仍可读取。
- [x] 写保护测试：items、finance 与 Payton 贷款按 owner 检测缩水，保留现有阈值语义。
- [x] 运行对应测试确认失败，再实现函数和调用过滤，运行测试确认通过（74 tests）。

### 任务 6：应用壳、库存／财务／Payton UI 与首页

**文件：**
- 修改：`src/App.vue`、`src/components/AppSidebar.vue`
- 修改：`src/modules/home/HomeModule.vue`
- 修改：`src/modules/inventory/InventoryModule.vue`
- 修改：`src/modules/finance/FinanceModule.vue`
- 新建：`src/modules/payton-finance/PaytonFinanceModule.vue`
- 修改：`src/services/cloudStore.js`、`src/services/cloudStore.test.js`

- [x] 写组件或行为测试：顶栏 Papa／Payton 切换且记住本机选择；Payton 资金侧栏入口只在 Payton 模式出现；采购入口保持可见。
- [x] 写 UI 测试：库存 owner 与维度筛选、payton库存隔离、短 SID／复制完整 SID；资金模块四张余额卡和三页签。
- [x] 写首页测试：合并总览不随切换改变；Papa 销售毛利与净实际利润标签分开；Payton 基金原值及账户明细显示；真实公式数值正确。
- [x] 运行测试确认失败，实现组件和页面接线。
- [x] 移除主程序对 `ysp_state(id=car)` 的基金读取及对应服务／测试；运行组件和服务测试确认通过。

### 任务 7：快照、日志、撤销与导入恢复

**文件：**
- 修改：`src/data/store.js`、`src/data/store.test.js`
- 修改：`src/data/operationLogDisplay.js` 及相关测试（仅当显示逻辑需要）
- 修改：`src/App.vue`（回滚和恢复路径，如需要）

- [x] 写快照测试：每日同日期只一条；Papa 原字段保留；Payton 与 merged 字段补入并可更新；历史缺字段读取为旧数据；录入 10/19 BMW 售出后更新 `snapshotReconcile.date` 指定的既有日期行并清除待补售标记。
- [x] 写日志测试：新增操作 detail 记录 owner；历史日志仍可展示。
- [x] 写撤销／重做测试：一次 Payton 操作可完整还原账户、贷款、商品 owner 与销售状态。
- [x] 运行测试确认失败，实现快照更新及记录归属，并验证撤销／重做。

### 任务 8：完整回归与真实数据验收

**文件：**按前述任务；真实输入只读。

- [x] 在系统临时目录分别生成 car 导入输出与 `.bak`，核对 240 辆、¥14,010.87、期初三数和 active 贷款。
- [x] 对导入结果重复运行脚本，核对不新增重复项、不改变既有商品及源文件哈希。
- [x] 用测试夹具模拟宝马 507 销售 ¥15，核对库存 239、成本 ¥14,000.87、基金 −¥3,924.42 和支付宝 −¥5,496.48。
- [x] 运行 `npm test`：25 个测试文件、254 项通过。
- [x] 运行 `npm run build`：成功。
- [x] 按设计第十二节逐项对照自动化测试、页面组件和业务逻辑；检查 `git diff --check` 与授权范围；不提交。隔离浏览器实测 Owner 切换、Papa/Payton 菜单显隐、Payton 资金三标签、库存、未保存采购草稿、销售、销售分析、市场价格、账龄及首页现金流。首个验收会话选择并确认用云端后进入二次防覆盖确认，浏览器随后无响应，是否载入完成无法核实；后续使用空数据隔离会话并仅在浏览器 DOM 隐藏恢复遮罩，完成其余 UI 点击验证。未新增或修改业务记录。

#### 最终验收说明

- 真实 JSON 导入验收只写入系统临时目录；两份原始输入 SHA-256 未变化，重复导入新增 0 项。
- 手动页面点击在空数据隔离会话完成：Owner 切换、菜单显隐、Payton 资金的零花/贷款/互转标签、库存/采购/销售及分析页均可打开；未保存采购草稿已取消，未新增或编辑任何业务数据。启动时的恢复遮罩仅在验收浏览器 DOM 中临时隐藏，以避免再次选择数据方向；首个会话二次防覆盖确认后的恢复结果未能核实。
- Payton 首页现金流冒烟发现并修正开账日前月份被展示为 0 的问题：现在显示 `--`，空值柱宽为 0，差额图也保留空值。新增组件级回归测试。
- 本次未改 `public/ysp-remote.html` 或 car 程序源代码，未提交代码。
