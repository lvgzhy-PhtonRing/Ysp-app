# owner-papa / owner-payton 多 Owner 改造交接

> **状态更新（2026-10-22）：**本文件以下内容记录的是实现开始前的历史交接状态，已被大王陛下随后“继续执行，直至计划实施结束”的明确指令取代。设计稿自检、实施计划和代码实现现已完成；请以 `docs/superpowers/plans/2026-10-22-multi-owner-papa-payton.md` 及其 `.superpowers/sdd` 进度记录为准。当前验收通过 254 项测试与生产构建；空数据隔离会话已完成主要页面点击检查，并修正 Payton 现金流开账日前月份误显示为 0 的问题。云端恢复选择进入二次防覆盖确认后浏览器无响应，是否应用未能核实；详见计划最终验收说明。

日期：2026-10-22<br>
交接给：下一位 AI 助手<br>
当前阶段：第三轮调研已大量收敛；正式设计稿已有内容但**尚未完成自检或用户评审**；没有开始实现代码。

> 大王陛下明确要求当前暂停其他工作并写此交接。下一位 AI 应先读本交接，再按清单复查资料、完成设计稿自检并继续提问。用中文沟通，称呼用户“大王陛下”；不要把当前设计稿说成已自检/已批准，也不要直接跳进实现计划或写代码。

---

## 1. 接手后必须阅读的依据

### 1.1 需求与设计文档

1. `D:\Projects\ysp-app\docs\2026-10-21-owner-papa-payton需求总结.md`<br>
   三轮调研形成的需求总结。第三轮有多次更新，但当前仍应复读并与设计稿逐条核对。
2. `D:\Projects\ysp-app\docs\superpowers\specs\2026-10-21-multi-owner-papa-payton-design.md`<br>
   正式设计稿。内容已覆盖架构、导入、业务流、公式、快照、UI、测试和风险；**用户要求写完设计稿，但接着要求暂停自检并做交接，所以尚未完成下文第 6 节的自检**。
3. `D:\Projects\ysp-app\docs\2026-10-20-owner维度方案初步计划.md`<br>
   较早的 owner1/owner2 草案。只作为历史背景；与后续需求相比，“owner2 只显示三个聚合数、单向同步”等早期决定已经被推翻。
4. `D:\Projects\ysp-app\docs\三程序登录与隐私RLS策略记录-20260902.md`<br>
   Supabase/RLS 背景。car 和主程序共用 Supabase，但当前方案是离线 JSON 一次性合并，不采用运行期同步。
5. 如需核对旧支付宝公式展示史：`D:\Projects\ysp-app\docs\superpowers\specs\2026-08-26-alipay-formula-display-design.md`。

### 1.2 真实 JSON（源文件只读）

必须在当前机器重新读取并独立复算，不要把下面的摘要当成唯一依据：

- YSP 备份：`C:\Users\ll_gg\Downloads\PhtonRing数据_2026-10-21.json`
- car 备份：`C:\Users\ll_gg\Downloads\car_backup_2026-10-21.json`

建议所有导入试验写到临时目录/拷贝文件，**不要覆盖这两份原始 JSON，也不要直接写 Supabase 或浏览器 localStorage**。

### 1.3 代码阅读清单

**YSP：**

- `src/data/store.js`：状态、load/export、每日快照、localStorage/云同步入口。
- `src/data/cloudSlotPlan.js`：9 个现有槽位、逐槽合并和同日期快照合并。
- `src/utils/calc.js`：支付宝公式、进/出两栏。
- `src/modules/home/HomeModule.vue`、`useHomeInsights.js`、`useCashflow.js`、`CashflowMonitor.vue`：首页各项指标和现金流监控。
- `src/modules/inventory/useInventory.js`、`InventoryModule.vue`、`useInventoryAging.js`、`InventoryAgingModule.vue`：SID 联动、商品分组、账龄。
- `src/modules/purchase/usePurchase.js`、`PurchaseModule.vue`：购买/转运成本、按转运批次整组入库、批量入库。
- `src/modules/sales/useSales.js`、`SalesModule.vue`：销售利润公式、编辑/回滚销售。
- `src/modules/finance/useFinance.js`、`FinanceModule.vue`：现有公共收支、Papa 借贷。
- `src/modules/sales-analysis/useSalesAnalysis.js`、`SalesAnalysisModule.vue`：全局商品销售聚合。
- `src/modules/market-price/useMarketPrice.js`、`MarketPriceModule.vue`：按 `isLongTerm` 聚合，并按 brand+name 联动价格。
- `src/services/dataProtection.js`、`src/services/cloudStore.js`、`src/App.vue`、`src/components/AppSidebar.vue`。
- `public/ysp-remote.html`：独立手机版查询页，仍直接读 Supabase `ysp_state(id='car')`，没有 owner 筛选。

**car：**

- `D:\Projects\car\V2.0.html`：`getDefaultData`、`calcBalance`、`saveData/syncFundBalance`、`getDashboardStats`、贷款/还款、账户互转、手动存入零花、买车/卖车/转库。
- `D:\Projects\car\cloud-sync.js`：`saveCarFundBalance` 旧同步接口。
- `D:\Projects\car\docs\superpowers\specs\2026-06-27-car-accounting-v2-design.md`：car 的两个账户、贷款、转账和车辆关系。
- 可辅助看 UI 设计：`D:\Projects\car\docs\design-system.md`。

---

## 2. 真实数据复算基准

### 2.1 YSP：`PhtonRing数据_2026-10-21.json`

| 数据 | 复算值 |
|---|---:|
| 商品总数 | 1,209：已售 364 / 在库 494 / 采购中 351 |
| 现有 category 值 | 日淘 359 / 美淘 120 / 国内 713 / 旧类目 2025JAPAN 17 |
| `calc.debt` / `unconfirmed` / `watchBalance` | ¥119,667.34 / ¥388.00 / ¥218.87 |
| Papa 收支记录 | 19 笔，全为支出；合计公共支出 ¥1,205.98 |
| Papa 借贷 | 借入 ¥10,000 − 归还 ¥4,000 = 净借贷余额 +¥6,000 |
| Papa 已售商品毛利 | ¥23,647.175… → UI ¥23,647.18 |
| Papa 净实际利润 | 毛利 ¥23,647.18 − 公共支出 ¥1,205.98 = ¥22,441.195… → UI ¥22,441.20 |
| Papa 在库成本 | ¥128,805.226… → UI ¥128,805.23 |
| 采购中成本 | ¥20,487.373… → UI ¥20,487.37 |
| 快照 / 转运 / rushcar | 113 / 74 / 26 |

借贷记录里的 `lend 4000` 是爸爸在 2026-04-14 **归还 PT工作公费**，不是 Payton 贷款，不可与 car 贷款抵销。

### 2.2 car：`car_backup_2026-10-21.json`

| 数据 | 复算值 |
|---|---:|
| 车辆总数 | 262；当前未售 239（invest 93 / keep 146），已售 23 |
| 10/15 截点在库数 | **240**：当前未售 239 + 10/19 售出的 BMW 507（10/15 时仍在库） |
| 240 辆截点 buyPrice 合计 | ¥14,010.8687… → ¥14,010.87；售 BMW 507（成本 ¥10）后当前库存成本 ¥14,000.87 |
| 截点 pocket 余额 | −¥305.9611… → −¥305.96 |
| 截点 invest 余额 | +¥366.5426… → +¥366.54 |
| active 贷款 | 3 笔剩余 ¥2,000 + ¥1,000 + ¥1,000 = ¥4,000；另有一笔 ¥1,000 已还清 |
| 当前 Payton's基金 | −290.9611 + 366.5426 − 4,000 = −3,924.4185 → −¥3,924.42 |
| 10/15 及之后交易 | 只有一笔：10/19 pocket 收入 ¥15，车为“高普复古套黑宝马507”，SID `55aeffc4-b720-483f-b85e-1d85067f0189`，category=keep，buyPrice ¥10，sellPrice ¥15 |
| 在库车 SID 与 YSP 现有 SID 交集 | 0（YSP 自身有大量重复产品 SID，不能误判为车 SID 冲突） |
| 车辆 `subCategory` | 10/15 截点 240 辆中 234 个有值；普卡 145，名称中 121+ 个已包含“普卡”；5 辆超宝名称也含“超宝” |
| car 账户操作 | 历史 `transferPairs` 10 组；pocket 月零花额 ¥200，按钮是手动触发，不是自动入账 |

### 2.3 支付宝计算器金额（正确符号与利润口径）

**10/15 截断、尚未补录宝马售出：**

- 进项：`119,667.34 + 6,000 + 23,647.18 − 1,205.98 = +148,108.54`
- 出项（Payton's基金按带符号原值直接加；本次为负数）：`−128,805.23 − 20,487.37 − 388 + (−3,939.42) = −153,620.02`
- 合并余额：`+148,108.54 + (−153,620.02) = −5,511.48`

**在 YSP 销售模块补录宝马 507 于 10/19 以 ¥15 售出后：**

- pocket 回到 −¥290.96；Payton's基金回到 −¥3,924.42。
- 出项小计变成 −¥153,605.02；支付宝应有余额回到 **−¥5,496.48**（与 car 当前线上数字一致）。

注意 YSP 当前有两处同名但不同数值：计算器分解行的 +¥23,647.18 是销售毛利，首页利润卡的 ¥22,441.20 是毛利扣公共支出后的净利润。正式 UI 统一使用“销售毛利”和“净实际利润”两个标签。

---

## 3. 已确认设计决策（以最新用户答复为准）

1. **双 owner**：Papa 负责既有 YSP 账；Payton 负责 car 资产/资金；car 源码不改、按约定停用，页面仍可操作，不是程序强制只读。
2. **car 截点导入**：按 2026-10-15 状态重建 240 辆。当前 239 未售都纳入，再把 10/19 售出的 BMW 507 作为截点库存纳入；之后由用户在 YSP 手动录 10/19 销售。10/15 前已售 22 辆不导。
3. **期初**：交易截至 10/15，pocket −305.96 / invest +366.54；active 三笔贷款分别 ¥2,000/¥1,000/¥1,000，贷款总额由明细剩余相加。旧还清贷款及历史放款/还款流水不导入。
4. **车辆映射**：sid 沿用原 UUID（240 个与 YSP SID 交集 0）；cost=buyPrice；category=`payton库存`；batch=`2026年10月导入`；keep→`isLongTerm=true`；invest→`isLongTerm=false`；expectedValue/history 不导。
5. **名称**：car `subCategory` 合并到车辆名称；名称已含该类目文字则不重复，否则将子类文字加在名称前。空子类不改名。列表 SID 短显、详情可复制完整 UUID。
6. **Payton 模块**：独立侧栏模块，仅 Payton owner 模式显示；余额卡 + 三页签：零花收支、贷款清单、零钱↔投资互转。
7. **零钱收支**：Payton 非车辆收支固定改 pocket，不改 invest、不进 Papa 公共支出；记录编辑/删除自动按差额回滚。保留手动“存入本月零花 ¥200”按钮，同月防重复。
8. **贷款/互转**：导入三笔 active 明细，贷款总余额由三笔剩余相加；借款/还款有日期、金额、备注流水，借款/还款都走 invest 和相应贷款余额，基金净额不因此变化；账户互转两边同额异向，基金不变。
9. **Payton 车辆买卖**：买车只改余额，不建第二条财务流水；长线/自留扣 pocket，短线/投资扣 invest，金额用 ysp 最终 cost（含转运分摊）。卖车用 ysp 销售页的实际到手额（成交总价 − 快递 − 平台费 − 扣减）增加原账户，不建第二条财务流水。销售编辑/回滚自动调余额；Payton 利润只在 Payton 销售页/快照展示，不加进 Papa 计算器利润行。
10. **余额联动**：成本修改自动补扣/退差额；自留↔投资、Owner转移时转移相应余额；删除 Payton 车时询问误录/重复（返还）或遗失/报废（不返还）。
11. **同箱采购**：351 件现有采购及未来新采购先“Papa 暂管”，继续计入采购中支出；入库后逐件选择最终 Owner，Payton 商品再逐件选自留/投资。混合 Owner 的同批转运允许逐件分配；移到 Payton 时 Papa 采购中成本移出，同时扣 Payton 账户同额，合并余额不跳。
12. **owner UI**：顶栏仅 Papa/Payton 两档，固定合并支付宝总览不随切换；库存有“全部/当前 Owner”；`payton库存` 仅 Payton 可见。此类别不作为采购选项。由于旧类目 `2025JAPAN` 有 17 件，payton库存是实际第五个类别值。
13. **公式和数值**：出项表金额带负号，最后一步把进项和负数出项**相加**；车辆价值不进支付宝公式；Payton 非车辆开销只经 pocket/fund 一次反映；Papa 公共支出及毛利都按 Papa 记录计算。
14. **云同步**：旧 9 组不拆分，允许新增第 10 组同步 ownerRegistry/Payton 余额、贷款、零花配置及互转。
15. **快照**：更新已存在的 2026-10-21 同一行，Papa 快照字段保持不动，补 Payton/合并字段；录入宝马销售后再更新该行的 Payton/合并值，不新增同日第二行。
16. **范围**：`public/ysp-remote.html` 本次不改，接受它保留旧基金显示且可能混显 Owner 数据；它不是合并后的准确入口。car 源码零改、仍然可操作但约定停止使用。

---

## 4. 当前文件和产物状态

| 项 | 状态 |
|---|---|
| 需求总结 | `docs/2026-10-21-owner-papa-payton需求总结.md` 已有三轮内容，需最终与正式设计稿交叉核对 |
| 正式设计稿 | `docs/superpowers/specs/2026-10-21-multi-owner-papa-payton-design.md` 已写入三轮决策，**尚未完成最终自检/用户评审** |
| 视觉预览 | `C:\Users\ll_gg\AppData\Local\Temp\opencode\owner-papa-payton-round3-preview.html`，含首页金额、Payton资金模块、采购/售车/字段映射预览，已用 agent-browser 打开检查 |
| 应用代码 | 没有修改业务代码，没有运行测试/构建，也没有提交 |

---

## 5. 下一个 AI 必须继续的事项

1. **先读本交接，再复读两份文档和两份真实 JSON。**源 JSON 路径见 1.2。
2. 用户已经回答了三轮问题；不要重问已确定项。仍待第三轮继续确认的重点：
   - Sales Analysis、Market Price、账龄分析、现金流监控在 Owner 切换时如何筛选/呈现。
   - 具体问题：Market Price 当前把所有 `isLongTerm=true` 放一起，并按 brand+name 联动；Payton `isLongTerm=true` 意味自留，可能与 Papa 长线混用。确认 Market Price 对 Payton 应隐藏还是独立显示；不可跨 Owner 联动。
   - CashflowMonitor 已确认 Payton 视图只显示合并后产生的数据（此前历史不导），但“截断日前月份留空/显示从合并日开始”的视觉规则可在预览中最后确认。
   - 真实应用主页目前还有本月销售、近三个月销售、销售分析、账龄等依赖全局 `store.items` 的聚合。正式设计稿应明确这些模块在切换 owner 后都按当前 owner 过滤；Payton 数据没有的历史月份不要用 Papa 数据代替。
3. **完成正式设计稿自检**，然后邀请大王陛下审阅；用户批准前不要调用 writing-plans，更不要开始实现。
4. 用户同意设计后，再使用 `superpowers:writing-plans` 制作详细实施计划。

---

## 6. 正式设计稿自检清单（尚未完成）

下一位 AI 必须逐项检查并修正文档；自检通过不等于用户已批准。

### 6.1 占位与完整性

- 扫描 `TBD`、`TODO`、“待确认”等占位；若有，补齐明确方案或标为需用户决定，不得默默遗漏。
- 设计覆盖 owner 数据模型、迁移、一次性导入、采购/入库、销售、Payton资金模块、公式、快照、保护、云同步、UI、错误恢复、测试。
- `ownerRegistry.payton.loans` 是三笔 active 明细的唯一贷款总额来源；不要同时维护会漂移的独立 `loanRemaining` 数。
- 明确 Payton 零花记录、贷款事件、账户互转各自存储位置与余额联动；Papa 公共支出不能把 Payton 支出重复算进去。

### 6.2 数字和公式一致性

- 用指定两份 JSON 重新运行独立复算，金额保留到 UI 两位小数。
- 公式采用“进项小计 + 带负号的出项小计”；cutoff 期初为 `+148,108.54 + (−153,620.02) = −5,511.48`。
- 手动录入 10/19 BMW 507 售出 ¥15 后应为：pocket −290.96、基金 −3,924.42、合并余额 −5,496.48。
- Papa 销售毛利 ¥23,647.18 与首页净实际利润 ¥22,441.20 标签/口径分开。
- Payton 实际到手回款进入基金；Payton 销售利润不重复进入 Papa 计算器。
- Payton 车库成本当前 ¥14,000.87（cutoff 暂含 BMW 时 ¥14,010.87），两者均不进入支付宝公式库存扣项。

### 6.3 导入正确性与幂等

- 截点导入集合应为当前 239 辆未售车 + 10/19 BMW 507 = 240；cutoff 前已售 22 辆排除。
- 三笔 active loan remaining 导入明细（2000/1000/1000），旧已还清 1000 和贷款历史交易不导。
- pocket/invest 起点按 2026-10-15 及之前交易累计；10/19 ¥15 不入 opening，走 YSP 销售操作。
- `subCategory` 名称合并规则：含该文字就不重复，否则前置；空值保持原名。
- SID 在 240 辆间及与 YSP SID 交集校验；重跑已存在 SID 必须跳过，不能把已经手动售出的宝马恢复成库存。
- 重跑测试同时检查 ysp payload 不丢 Papa 项目，原始 JSON 不被覆盖，输出能被 YSP 正常导入。
- 351 个旧采购项迁移为 Papa 暂管；入库逐件选 Owner/Payton类型，混合转运批次可拆分归属。

### 6.4 业务联动/可逆性

- Payton 入库扣最终 cost（购买价+分摊运费）；成本变化按差额调钱包。
- Payton 长线/自留用 pocket，短线/投资用 invest；切换类别或 Owner 时余额对应调拨。
- Payton 售车加实际净回款；编辑/回滚同步修正；删除库存需询问“误录/重复”或“遗失/报废”。
- Payton 零花收支固定改 pocket；编辑/删除反向；月零花 ¥200 手动入账且同月不能重复。
- 新贷款/还款明细联动 invest 及 loan.remaining；内部互转成对改两个余额，基金不变。
- `undo/redo` 能还原 Payton balances、loan details、accountTransfers、owner 和 sale state。

### 6.5 UI / 分析隔离

- 顶部仅 Papa/Payton 两档；首页合并摘要固定，其他 owner 指标按当前 owner 切换。
- Payton资金模块仅在 Payton 模式可见，包含余额总览与零花/贷款/互转三页签。
- Papa 与 Payton 的库存/销售/净利润/市场价/账龄/现金流分析不可误合并；共同指标须明确是合并还是当前 Owner。
- SID 列表短显，详情复制完整 UUID。
- `payton库存` 仅 Payton 视图显示，不加入采购品类选项；保留旧 2025JAPAN 17 项。
- `public/ysp-remote.html` 与 car 程序本次不改的后果需清楚标注：旧远程页仍读旧基金、没有 Owner 区分；car 页面仍可编辑但按约定停用。

### 6.6 同步、快照与保护

- 原 9 个槽位不拆 owner，新增 ownerRegistry 第 10 个对象槽位；冲突比较、类型校验、版本戳、恢复/导入都包括该槽位。
- 10/21 快照同一行追加 Payton 数据、保留 Papa 原值；录入宝马销售后再更新当日 Payton/merged 值，不生成第二条同日行。
- 数据缩水检测需包含 ownerRegistry.Payton.loan 明细/总余额，避免贷款明细被覆盖后无警告。
- 已有 113 条历史快照中没有 Payton 数据；导入前历史留空，不能伪造过去的 Payton 库存/基金。

### 6.7 范围与流程门

- 设计仅覆盖本轮明确的多 Owner 合并，不扩大到车程序重构或远程页改造。
- 明确“代码未改、测试未跑、未提交”。
- 自检完成后，让大王陛下审阅正式设计稿；拿到明确批准后才写 implementation plan。

---

## 7. 沟通与执行约束

- 用户明确希望用非编程语言讨论需求；UI/布局/金额选择尽量用可打开的 HTML 预览和两份真实 JSON 数值举例。
- 继续提问时一次聚焦一个问题，先解释背景和影响，再给易懂选项。
- 用中文与用户沟通，并始终称呼“大王陛下”。
- 不要委派子代理；不提交、不改 git 配置；除正式设计/需求文档/预览外，未经批准不要改业务代码。
- 当前预览文件位于 Temp；如果后续希望长期留存，先问是否将其复制进 `docs/superpowers/previews/`，不要静默新增目录。
