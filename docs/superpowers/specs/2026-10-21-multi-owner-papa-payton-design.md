# ysp-app 多 Owner 正式设计说明（owner-papa / owner-payton）

日期：2026-10-21（第三轮调研后整理）
状态：正式设计稿，待大王陛下评审；评审通过后再拆实施计划
项目：`D:\Projects\ysp-app`（唯一维护端）· `D:\Projects\car`（停止使用、代码零改；原页面仍可操作供查历史）
关联需求：`docs/2026-10-21-owner-papa-payton需求总结.md`

---

## 一、设计目标

1. ysp-app 从单账本升级为**双 owner 账本**：`owner-papa`（现有全部数据）+ `owner-payton`（car 的在库车与资金）。
2. car 数据**一次性合并**进 ysp；之后按使用约定停用 car 录入，不修改 car 源码或锁定它的操作界面。
3. 首页提供一个**单一合并公式**（papa 各项 + payton 净额区块）作为最终支付宝应有余额。
4. 所有改动以最小范围为原则：不拆 `calc`、不拆快照主键、不把现有 9 个同步槽位按 owner 拆分；只为 Payton 元数据增加一个独立槽位；本次不改 `ysp-remote.html`。

## 二、总体架构

```
┌────────────────────────── ysp-app（唯一维护端） ──────────────────────────┐
│                                                                            │
│  ownerRegistry { papa, payton资金/贷款/互转 }   顶部 owner 切换器            │
│                                                                            │
│  items[]           每条带 owner                                            │
│  financeRecords[]  每条带 owner（Payton 非车辆收支由独立模块维护）           │
│  Papa loanRecords[] + ownerRegistry.payton.loans[]                         │
│  calc / transfers / rushcar   papa 独有，不加 owner                         │
│  snapshots[]       papa 字段 + payton 区块 + 合并汇总                       │
│                                                                            │
│  首页：合并总览（单一合并公式） / 切换后单 owner 视图                        │
└────────────────────────────────────────────────────────────────────────────┘
                                   ▲
                                   │ 一次性导入（脚本直接合并 payload）
┌──────────────────────── D:\Projects\car（停止使用） ──────────────────────┐
│  carAppData.cars[]（还原 10/15 截点库存）+ accounts.pocket/invest + loans     │
│  car 程序零改动；不再作为录入端；原页面仍可操作但不作为合并账本来源          │
└────────────────────────────────────────────────────────────────────────────┘
```

**不再使用**：主应用首页移除 `saveCarFundBalance` → `ysp_state(id='car')` → `fetchCarFundBalance` 运行期依赖。car 程序源码零改、停止用作录入；它本身仍可操作，远程页也保持旧版（可能显示旧基金/混合商品），明确不作为合并后的准确入口。

## 三、数据模型

### 3.1 新增字段

```js
// 记录级
state.items[i].owner              // 'papa' | 'payton'；purchase 阶段暂归 papa
state.financeRecords[i].owner     // 'papa' | 'payton'
state.loanRecords[i].owner        // Papa 现有借贷记录归 papa；Payton 贷款另存 ownerRegistry.payton.loans

// 新增元数据
state.ownerRegistry = {
  papa: {
    label: 'Papa',
    source: 'native',
  },
  payton: {
    label: 'Payton',
    source: 'car-import',
    pocketBalance: -305.96,   // 截至 10/15 的零钱余额；10/19 售车另在 YSP 销售模块录入
    investBalance: 366.54,    // 截至 10/15 的投资余额
    monthlyAllowance: 200,    // 手动存入本月零花的金额
    loans: [                  // 3 笔 active 贷款明细；总剩余由本表计算
      {
        id, name, amount, remaining, startDate, dueDate, status, note,
        events: [{ id, type: 'borrow'|'repay', date, amount, note }],
      },
    ],
    accountTransfers: [{ id, fromAccount, toAccount, amount, date, note }],
    openingAt: '2026-10-15',
    snapshotReconcile: { date: '2026-10-21', pendingSaleSid: '55aeffc4-b720-483f-b85e-1d85067f0189' }, // 导入时暂存；宝马销售录入后更新该快照并清空
  },
}
```

`loanRemaining = sum(payton.loans.filter(status === 'active').remaining)`。
**Payton's基金 = `pocketBalance + investBalance − loanRemaining`**，不另存一个可漂移的总数。购买、销售、零花、借贷、互转都联动更新对应余额或贷款明细。

### 3.2 不变的部分

| 集合 | 处理 |
|---|---|
| `state.calc` | 保持现有 7 旋钮，不拆 owner，作为共享结算参数；支付宝公式沿用 Papa 现有口径 |
| `state.transfers` | papa 独有，不加 owner |
| `state.rushcar` | papa 独有，不加 owner |
| `state.snapshots` | 结构扩展（见第八节），主键仍按 `date` |
| `state.cloudSettings / cloudSession / cloudStatus / operationLogs / undoStack / redoStack` | 结构不变 |

### 3.3 记录 owner 的取值规则

| 场景 | owner 值 |
|---|---|
| 迁移前已有的非 purchase 记录 | `'papa'`（迁移自动补） |
| 当前 351 件 purchase 记录 | owner 设为 Papa 暂管；采购中成本继续进入合并计算器 |
| 合并后新采购（purchase） | 默认 Papa 暂管；采购页始终显示全部未入库采购 |
| 入库（单件/批量） | 每件选择最终 Owner；Payton 商品再逐件选择自留/投资 |
| 入库转 Payton | 从 Papa 采购中成本移出，按最终成本扣 Payton 对应余额；合并余额不跳变 |
| car 截点导入车辆 | owner=`payton`，包括 10/15 在库、10/19 已售的宝马 507 |
| Papa 新增收支/借贷 | 走现有财务模块，owner=`papa` |
| Payton 零花收支 | 走新 Payton 资金模块；只影响零钱，不纳入 Papa 公共支出 |

### 3.4 导出/导入 payload

`exportData()` 增加 `ownerRegistry`。`loadData()` 先跑迁移，再恢复所有集合。

## 四、迁移机制

### 4.1 新建 `src/data/migrations/index.js`

```js
export function migratePayload(payload) {
  const data = payload && typeof payload === 'object' ? payload : {}
  // 1. 所有旧 items（含 purchase）补 owner='papa'；purchase 视图标记“Papa 暂管”
  // 2. finance.records / finance.loans：补 owner='papa'
  // 3. ownerRegistry：缺失时初始化为默认结构
  // 4. 返回新对象，不修改入参
}
```

规则：

- 幂等：已有 owner/ownerRegistry 不覆盖。
- 纯函数：便于单测。
- 在 `loadData()` 第一行调用，早于 `normalizeItemBatches`。
- 迁移不处理 `payton库存` 相关逻辑（由导入脚本负责）。

### 4.2 版本

- `package.json` version → `5.0.0`。
- 迁移不依赖版本号判断，按字段缺失判断，保证老备份/旧云端载荷都能安全升级。

### 4.3 云同步适配

- 保留原 9 槽位（`items` / `calc` / `finance.records` / `finance.loans` / `transfers` / `rushcar.*`），不按 owner 拆分。
  - 新增 `ownerRegistry` 作为**第 10 个对象型槽位**，同步 Payton 余额、三笔贷款、月零花金额与 `accountTransfers`；进入 `SLOT_PATHS` / `SLOT_LABELS` / `emptyFor` / `hasUsableSlotValue` / `normalizePayloadForCompare`，参与云端合并与冲突检测。
- `computeConflictDiff` 的字段中文映射新增 `owner: '归属'`。

## 五、car 一次性导入

### 5.1 脚本

- 路径：`scripts/car-import.mjs`（Node ESM，零依赖）。
- 用法：`node scripts/car-import.mjs --car <car导出.json> --ysp <ysp备份.json> --out <合并结果.json>`
- 输出：合并后的完整 ysp payload + 控制台报告。
- `--out` 必须与两个输入路径不同；写入结果前，将输入 YSP 文件原字节复制为 `<out>.bak`。不覆盖任何输入文件。

### 5.2 处理流程

```
1. 读取 car 导出（BOM 容错）
2. 断言结构：accounts.pocket/invest、cars[]
3. 重建 2026-10-15 截点车库：
     - 纳入当前 isSold=false 的 239 辆
     - 额外纳入 soldDate > 2026-10-15 的宝马 507（当时仍在库，10/19 才售出）
     - 排除 10/15 前已售的 22 辆
   截点导入数 240；宝马 507 后续由用户在 YSP 销售模块录入 10/19 售出
4. 校验 240 个 sid：内部重复或与 YSP 已有 SID 冲突 → 报错列出，终止
5. 映射车辆 → ysp items（见 5.3）
6. 计算账户期初（交易日期 ≤ 2026-10-15）：
     pocketBalance = Σ(income − expense)     // = −305.96
     investBalance = Σ(income − expense)     // = +366.54
   账户余额已包含历史贷款收/还款、零花、车款和互转的现金影响，不导历史流水
7. 导入 3 笔 active loan 明细（原有 name/startDate/dueDate/amount/remaining/status）；已还清的 1 笔不导
8. 读取 ysp 备份，合并：
     - 保留原 items/finance/loans/transfers/rushcar/calc/snapshots
     - 旧 items、finance.records、Papa loanRecords 迁移为 Papa（旧采购暂标 Papa）
     - 追加 Payton 截点车库；写入 ownerRegistry.payton 两账户期初、月零花额 200、3 笔贷款、openingAt；将最新 YSP 快照日期与待补售 BMW SID 写入 snapshotReconcile
9. 幂等：按 sid 查重；已存在则跳过，不覆盖 ysp 后续编辑或售车状态
10. 输出 payload 与报告（240 辆、截点成本 ¥14,010.87、账户期初、贷款明细、重复/跳过清单）
11. 输出前将原 ysp payload 原样另存为 `.bak`，便于回滚
```

### 5.3 车辆字段映射

| car | ysp | 说明 |
|---|---|---|
| `sid`(UUID) | `sid` | 240 个截点 sid 与 YSP 现有 SID 交集 0；沿用 UUID |
| `name` + `subCategory` | `name` | 子类并入名称前；若 name 已含同一子类文字则不重复，否则前置子类 |
| `brand` / `note` | 同名 | 直映 |
| `buyPrice` | `cost` | 成本口径 |
| `buyDate` | `inventoryDetails.inStockDate` | |
| cutoff 时仍在库 | `status: 'inventory'` | 240 辆（239 当前未售 + 10/19 售出的宝马 507） |
| — | `stock: 1` | 一车一条记录 |
| — | `owner: 'payton'` | |
| — | `category: 'payton库存'` | 历史车专用类别（实际是现有类别值中的第五类，2025JAPAN 旧类保留） |
| — | `batch: '2026年10月导入'` | |
| `category === 'keep'` | `isLongTerm: true` | 长线 = 自留 |
| `category === 'invest'` | `isLongTerm: false` | 短线 = 投资 |
| `expectedValue` / `expectedHistory` | — | 不入库 |
| 10/19 宝马 `sellPrice=15` / `soldDate` | — | 不预填销售数据；用户在 YSP 销售模块录入 |
| 列表 SID | 显示短 UUID | 如 `17a31ca0…cb76`；详情可复制完整 UUID |

### 5.4 导入边界

| 数据 | 处理 |
|---|---|
| 10/15 截点在库车 | 240 辆导入；其中 239 辆当前未售，另含 10/19 售出的宝马 507 |
| 10/15 前已售车 | 22 辆不导入 |
| 10/15 前历史交易流水 | 不导入；折入 pocket/invest 期初余额 |
| 10/15 后流水 | car 交易流水不导入；宝马 507 作为截点库存导入后由用户在 YSP 销售模块录入 10/19 售出 |
| 非车辆收支历史流水 | 不导入；未来由 Payton 资金模块逐笔记录 |
| active 贷款 | 导入 3 笔明细；不导 car 旧放款/还款流水；总剩余从明细求和 |
| 已还清贷款 | 不导入 |
| Pocket/Invest 期初 | 汇总截至 10/15 的交易余额：pocket −305.96、invest +366.54 |

## 六、合并后的业务流程

### 6.1 采购 → 入库

```
采购模块（共用）
  日淘 / 美淘 / 国内 + 批次（现有逻辑不变）
        │
        ▼
  status = 'purchase'，暂标 Papa（“Papa 暂管”）
        │
        ▼
  入库清单逐件选择最终 Owner；若为 Payton，再逐件选自留/投资
        │
        ▼
  status = 'inventory'，每件写入最终 owner
```

- 新车 sid 仍按 `JP-` / `US-` / `CN-` 规则生成。
- 现有 351 件采购中记录迁移时也暂标 Papa；新建采购默认 Papa 暂管。
- 同一转运/采购批次可混合 Papa 与 Payton；选择是**逐件**进行，Payton 的自留/投资也逐件选择。
- Payton 入库扣款按最终 `item.cost`（购买成本+分摊转运费）。未入库时成本计在 Papa 采购中金额；转 Payton 入库后从 Papa 采购中金额移除、从 Payton 钱包扣同额，合并总余额不跳变。
- 后续修改已入库 Payton 商品成本时，按成本差自动调整原账户余额。
- 入库后可以执行“转移归属”；转入 Payton 扣相应账户成本，转回 Papa 则返还 Payton 对应余额。

### 6.2 库存与财务视图

| 模块 | 规则 |
|---|---|
| 库存 | 默认按当前 owner 过滤；另可查看「全部」；`payton库存` 大类仅在 payton 视图显示 |
| 库存筛选维度 | papa：长线/短线；payton：投资/自留（同为 `isLongTerm`） |
| 财务 | Papa：现有公共收支/借贷；Payton：独立资金模块（见 6.3） |
| 销售 | Payton 车辆复用现有销售流程；回款按扣除费用后的实际到手额加到对应账户，不生成财务流水 |
| 首页 | 合并总览 + 当前 owner 视图 |
| 销售分析 | 跟随当前 owner 过滤；SKU 聚合键包含 owner，Payton 利润只在 Payton 视图计算与展示 |
| 市场价格 | 两个 owner 均可使用；只筛选当前 owner 的长线在库商品，按 brand+name 联动时也必须限定相同 owner |
| 账龄分析 | 跟随当前 owner 过滤，分组键包含 owner；全部商品视图中不跨 owner 合并 |
| 现金流监控 | 跟随当前 owner；Papa 使用既有快照口径，Payton 从 `openingAt`（2026-10-15）起展示，之前月份显示空值，不用 Papa 快照补值 |

### 6.3 Payton 资金模块（独立新模块）

- 位置：侧栏独立入口，仅切到 Payton 时显示，模块标题“Payton 资金管理”。
- 页首四张余额卡：零钱、投资、贷款剩余合计、Payton's基金。
- 页内三个页签：**零花收支 / 贷款清单 / 零钱↔投资互转**。
- **零花收支**：记录写入 `financeRecords` 且 `owner='payton'`，只承载车辆无关收支；固定影响 pocket（零钱），不影响投资，也不进入 Papa 公共支出行。编辑金额自动调差，删除自动撤回原影响。
- 保留手动“存入本月零花 ¥200”按钮，并防止同月重复；不是自动入账。
- **贷款清单**：迁入 3 笔 active 贷款名称、开始日、到期日、剩余；总剩余由三笔 active 余额相加。1 笔已还清贷款及旧贷款流水不迁入。
- 新借款/还款沿用 car 规则并保留逐笔日期/金额/备注流水：借款金额增加 invest 和该笔贷款剩余；还款金额同时减少 invest 和该笔剩余；单纯借入/还款不改变基金净额。调整/删除借还事件时同步回算余额与贷款剩余。
- **内部互转**：保留成对的零钱↔投资转账记录；一边减少、另一边增加同额，基金总额不变；编辑/删除互转时两边同步回滚/调差。
- Payton 销售回款不在本模块记第二条收入；车辆买卖走库存/销售。

### 6.4 买车/卖车对三数的影响

| 操作 | 零钱 pocket | 投资 invest | 贷款 loanRemaining |
|---|---|---|---|
| 采购入库选 payton **长线**(自留) | −= 最终成本 | — | — |
| 采购入库选 payton **短线**(投资) | — | −= 最终成本 | — |
| 卖出 payton 长线车 | += 实际到手回款 | — | — |
| 卖出 payton 短线车 | — | += 实际到手回款 | — |
| 非车辆收支/存入本月零花 | += / −= | — | — |
| 新贷款 / 归还贷款 | — | += / −= 对应金额 | 贷款剩余同步 += / −= |
| 零钱↔投资互转 | 一边减少 | 另一边增加同额 | — |
| 自留↔投资转换 | 与投资余额互转该车成本 | 与零钱余额互转该车成本 | — |

> Payton 买车/卖车只改对应余额，不生成第二条财务流水；保留库存/销售记录与操作日志。销售实际回款按 `成交总价 − 快递 − 平台费 − 其他扣减` 计算。Payton 销售利润留在销售分析/快照，不重复加入支付宝公式的 Papa 销售毛利。

### 6.5 余额与记录的修正、删除

- 编辑 Payton 收支：按新旧金额差额更正零钱；删除时撤回原影响。
- 编辑/删除贷款事件：同步调整投资余额与该笔贷款剩余；删除贷款时处理其关联事件，不能只删贷款卡片而留下现金影响。
- 编辑/删除内部互转：按配对转账反向修正两个账户，合并基金总额不变。
- 编辑 Payton 售价/费用或回滚销售：按净回款差额调整原账户；回滚销售时撤回原回款。
- 删除已入库 Payton 车辆时询问原因：误录/重复则返还此前扣款；遗失/报废则不返还。
- 自留/投资转换时按该车当前成本在 pocket 与 invest 之间调拨；不改变总基金。

### 6.6 `editItem` 防呆

现有同 sid 联动逻辑（`useInventory.js:96-102`）追加：

```js
x.owner === item.owner
```

避免跨 owner 误改同编号商品。

库存、账龄、销售等分组/合并视图的分组键也包含 owner，避免「全部」视图中相同 SID/名称跨 Owner 合并。

## 七、计算口径

### 7.1 支付宝应有余额（真实代码与 JSON 复算）

主界面将进/出项都以带符号金额显示，因此最后一步应为**进项小计 + 出项小计**；等价于正数进项减去正数支出总额。

```text
进项小计 =
    calc.debt（Papa 挖财总负债）                       +119,667.34
  + Papa 借贷余额（Σborrow − Σlend）                    +  6,000.00
  + Papa 已售商品销售毛利                              + 23,647.18
  − Papa 公共支出（Σexpense − Σincome）                 −  1,205.98
                                                      = +148,108.54

出项小计 =
  − Papa 库存总货值（inventory/papa cost）               −128,805.23
  − 采购中金额（暂归 Papa，含 351 件采购中）              − 20,487.37
  − calc.unconfirmed                                  −    388.00
  + Payton's基金（按带符号原值计入；期初为负）             −  3,939.42
                                                      = −153,620.02

10/15 截断期初余额 = +148,108.54 + (−153,620.02) = −5,511.48
```

宝马 507 按 10/15 在库状态导入，随后在 YSP 录入 10/19 售出 ¥15。录入后 pocket 从 −305.96 回到 −290.96、基金从 −3,939.42 回到 −3,924.42；出项小计为 −153,605.02，支付宝应有余额回到 **−5,496.48**。

**利润标签**：¥23,647.18 是 Papa 已售销售毛利；扣 Papa 公共支出 ¥1,205.98 后，首页净实际利润卡为 ¥22,441.20。两处使用不同标签，防止混淆。Payton 的销售利润只在 Payton 销售页/快照展示；其实际到手回款已经计入 Payton's基金，不再重复加进 Papa 的计算器利润行。

Payton's基金由新 Payton 资金模块本地实时计算 `pocketBalance + investBalance − ΣactiveLoan.remaining`，并以带正负号的原值直接加到合并公式；基金为负时自然形成负出项。主应用不再从 Supabase `ysp_state(id=car)` 拉取。Payton 非车辆支出只改变 Payton pocket，不加入 Papa 公共支出行，避免重复扣款。Payton 车辆成本不作为 Papa 库存出项；车辆价值仅在 Payton 车库独立展示。

现有实际余额补充行保持原口径：`actualBalance = mergedAlipayBalance − calc.forwarderBalance − calc.watchBalance`。本节金额是支付宝“应有余额”，不含转运/手表余额调整。

### 7.2 车辆价值的位置（确认：不进支付宝公式）

- Payton 当前在库车辆成本合计（¥14,000.87；cutoff 导入时先含宝马为 ¥14,010.87）**不进入支付宝应有余额公式**。
- 车辆价值作为 payton 车库的**资产展示**，在库存页/首页 payton 视图单列；车辆买卖**只改余额、不进支付宝公式其他项**。
- 设计理由：与 car 现状口径一致（car 的基金公式本就不含车辆价值）；在 10/19 宝马销售录入后，首页支付宝余额与现状一致（−¥5,496.48）。

### 7.3 首页展示

- 「合并总览」区：进项/出项两张表 + 最终支付宝应有余额。cutoff 导入后、尚未录售车时为 −¥5,511.48；录入 10/19 宝马销售后为 −¥5,496.48。
- 「Payton's基金」行：实时显示 `pocket + invest − loanRemaining`，含明细（零钱 / 投资 / 贷款剩余），数值随操作实时更新。
- `buildAlipayBreakdown` 扩展：进项表、出项表保持不变结构，基金行取实时三数。
- 移除 `HomeModule.vue` 中的 `carFundBalance` ref 与 `fetchCarFundBalance()` 调用；`cloudStore.fetchCarFundBalance` 一并删除（含相关测试若存在）。

## 八、快照与保护

### 8.1 快照结构

```js
{
  date,
  createdAt,
  // papa（现有字段，口径改为仅统计 owner=papa）
  calc: { ... },
  finance: { loanBalance, publicExpense },
  profit: { totalActualProfit },
  inventory: { value, count },
  purchase: { totalCost, count },
  // payton 区块
  payton: {
    carValue,          // 未售车 cost 合计
    carCount,
    pocketBalance,     // 零钱余额快照
    investBalance,     // 投资余额快照
    loanRemaining,     // active 贷款 remaining 合计
    fund,              // = pocket + invest − loanRemaining（Payton's基金）
    soldProfit,        // payton 已售车利润合计
  },
  // 合并汇总
  merged: {
    inventoryValue,  // papa 库存货值
    carValue,        // payton 车辆价值
    alipayBalance,   // 单日合并余额
  },
}
```

- 2026-10-21 已有 Papa 快照：保留原 Papa 字段，在同一行补入 Payton/merged；导入时记录待补售 SID。用户在 YSP 录入该宝马 10/19 售出后，按 snapshotReconcile.date 更新同一行的 Payton/merged 字段并清除待补售标记，不生成同日第二行。
- 历史快照无 `payton` / `merged` 字段时，展示层降级为 `—`，不报错。
- 合并仍按 `date` 去重（`mergeSnapshots` 不变）。

### 8.2 数据保护

`dataProtection.detectDeficit` 改造：

| 集合 | 策略 |
|---|---|
| items | 按 owner 分组分别做缩水检测，标签带 owner 名（如「Papa 商品数」「Payton 商品数」） |
| finance.records | 按 owner 分组 |
| Papa `finance.loans` / Payton `ownerRegistry.payton.loans` | 分开检测；Payton 检查明细笔数及 active remaining 合计 |
| transfers / rushcar.* | 保持总量检测（papa 独有） |
| 最后销售日期 | 按 owner 分别比较 |

## 九、日志与撤销

| 项 | 设计 |
|---|---|
| `addOperationLog` | `detail` 增加 `owner` 字段（记录操作归属） |
| 日志类型 | 不新增类型，保持现有枚举 |
| `reconstructCalcField` | 不变（calc 为共享层） |
| undo / redo | 沿用整包快照机制，不按 owner 拆分 |

## 十、UI 设计

### 10.1 owner 切换器

- 位置：顶部导航（`App.vue`）。
- 选项：仅 `Papa` / `Payton` **两档**（无「全部」档）。
- 状态：`state.currentOwner`，持久化到 `ysp_ui`（仅本地 UI 状态，不进云端 payload）。
- 默认：`papa`。
- 切换后：首页、库存、财务、销售即时刷新。
- 首页顶部固定「合并总览」区（进/出项两张表），**不随 owner 切换而变**；截点期初未录宝马售出时余额 −¥5,511.48，录入后为 −¥5,496.48。

### 10.2 新增/改造视图

| 文件 | 改动 |
|---|---|
| `App.vue` | 顶部切换器；切换后刷新视图 |
| `HomeModule.vue` | 固定合并总览；Papa-only 销售毛利和公共支出；Payton基金三数；移除 carFundBalance 云读取 |
| `InventoryModule.vue` | Owner 过滤/全部视图；payton库存仅 Payton 看；Papa长短线/Payton自留投资；SID 列表短显、详情复制全值 |
| `FinanceModule.vue` | Papa 现有公共收支/借贷视图，owner=papa |
| `PaytonFinanceModule.vue`（新） | Payton独立资金模块：零花、三笔贷款管理、零钱/投资互转、月零花按钮 |
| 销售模块与销售分析 | owner 过滤；Payton 售出按实际到手额改余额；编辑/回滚回调差额；利润不重复进合并公式；聚合键包含 owner |
| 市场价格与账龄 | 跟随当前 owner；市场价格联动和分析分组不得跨 owner |
| 现金流监控 | 按当前 owner 读取快照；Payton 从 `openingAt` 起显示，之前月份为空 |
| 采购模块 | 每件商品分别定 Owner 和 Payton 自留/投资类型；同箱可混归属；cost 变化自动调整钱包 |
| `public/ysp-remote.html` | 本次不改；它仍读取旧 car 云基金、无 Owner 标签，属于旧版查询页，主程序是准确入口 |

### 10.3 owner 文案

| owner | 展示名 | 维度标签 |
|---|---|---|
| `papa` | Papa | 长线 / 短线 |
| `payton` | Payton | 投资 / 自留 |

## 十一、涉及文件与改动清单

| 层 | 文件 | 改动 |
|---|---|---|
| 迁移 | `src/data/migrations/index.js` | 新建：`migratePayload` |
| 状态 | `src/data/store.js` | owner 字段、ownerRegistry、currentOwner、迁移挂载、快照扩展、导出/导入 |
| 槽位 | `src/data/cloudSlotPlan.js` | 新增 `ownerRegistry` 槽位 |
| 保护 | `src/services/dataProtection.js` | 按 owner 分组缩水检测 |
| 云 | `src/services/cloudStore.js` | 删除 `fetchCarFundBalance` |
| 库存 | `src/modules/inventory/useInventory.js` | owner 过滤与分组隔离、`editItem` 同 owner 检查、owner转移/成本修正/删除余额确认 |
| 采购 | `src/modules/purchase/usePurchase.js` | 入库逐件选择 owner/Payton类型；同转运组支持混合分配；成本分摊变化联动 Payton 账户 |
| 财务 | `src/modules/finance/useFinance.js` | owner 参数；新增记录写 owner |
| Payton 资金 | `src/modules/payton-finance/PaytonFinanceModule.vue` + `usePaytonFinance.js` | 新模块及零钱/贷款/互转余额联动 |
| 计算 | `src/utils/calc.js` | 合并公式辅助函数 |
| 首页 | `src/modules/home/HomeModule.vue` | 合并总览、移除 carFundBalance、owner 过滤 |
| 库存页 | `src/modules/inventory/InventoryModule.vue` | owner chip + 维度切换 |
| 财务页 | `src/modules/finance/FinanceModule.vue` | Papa 公共收支/借贷；Payton 使用独立模块 |
| 销售页 | `src/modules/sales/*` | owner 过滤；Payton净回款改账户余额；编辑/回滚差额联动 |
| 应用壳/侧栏 | `src/App.vue` / `src/components/AppSidebar.vue` | 顶部 owner 切换器；Payton模块仅 Payton 模式显示 |
| 脚本 | `scripts/car-import.mjs` | 新建导入脚本 + 报告 |
| 版本 | `package.json` | 5.0.0 |
| 测试 | `src/**/*.test.js` | 新增迁移/导入/过滤/公式/保护/快照测试；补销售分析、市场价格、账龄和现金流 Owner 隔离用例 |

## 十二、测试与验收

### 12.1 新增单测

| 测试 | 覆盖点 |
|---|---|
| `migrations.test.js` | 老 items/finance 归 Papa；旧采购标“Papa暂管”；ownerRegistry 初始化；迁移幂等 |
| `car-import.test.js` | 截点导入 240（当前未售239+宝马507）；排除 cutoff 前已售车；name/subCategory 去重；SID冲突；重复运行跳过；账户余额与贷款明细 |
| `useInventory.test.js` | owner 过滤/跨 Owner 分组隔离；同 SID 联动限同 owner；成本差额；Owner转移；删除资金确认 |
| `usePurchase.test.js` | 混合批次逐件 Owner/类型；Papa暂管转 Payton；最终成本包含转运费；转运费重算钱包差额 |
| `paytonFinance.test.js` | 非车辆流水只改 pocket；编辑/删除反向调整；月零花同月防重；互转守恒；3笔贷款求和；借贷/还款投资账户联动 |
| `useSales.test.js` | Payton净回款（售价−费用）；编辑/回滚调账户；Papa公式不重复计 Payton 利润 |
| `calc.test.js` | signed outgoing subtotal 与公式精确值；Payton fund 单独入公式 |
| `dataProtection.test.js` | 按 owner 分组缩水检测 |
| `store.test.js` | 10/21 当前快照合并 Payton 值、保留 Papa 值；ownerRegistry 导出/导入；10槽同步 |

### 12.2 验收标准

1. `npm test` 全绿。
2. `npm run build` 成功。
3. 导入真实 car 导出后：
   - 截点导入 240 辆、成本 ¥14,010.87；10/19 宝马 507 售出录入后，Payton 当前在库 239 辆、成本 ¥14,000.87；
   - 10/15 pocket −305.96、invest +366.54；贷款三笔剩余合计 ¥4,000；期初基金 −¥3,939.42；
   - 导入期初合并余额 −¥5,511.48；销售页录入 10/19 宝马卖价 ¥15 后，pocket −¥290.96、基金 −¥3,924.42、合并余额 −¥5,496.48；
   - Papa 计算器毛利/公共支出与 Papa 净利润卡口径分开，Payton 利润不重复进入 Papa 计算器。
4. 手工检查：切换器、固定合并总览、Payton 新模块 tabs、混合 Owner 入库、自留投资转换、销售净回款/回滚、零花编辑删除、贷款、互转、Payton 短 SID/full SID、当日快照。

## 十三、风险与对策

| 风险 | 对策 |
|---|---|
| 老数据无 owner 被过滤掉 | 迁移统一补 `papa`；purchase 单独处理 |
| `payton库存` 大类误显示 | 仅 `currentOwner === 'payton'` 时显示 |
| 同 sid 跨 owner 误改 | `editItem` 加 owner 相等约束 |
| `ownerRegistry` 不参与云同步 | 作为第 10 个对象槽位纳入槽位合并 |
| car 现状标记已售，但宝马在截点时仍在库 | 按 `soldDate > 2026-10-15` 纳入 10/15 截点车库；需回归验证 240 辆 |
| 购车/卖车/编辑引发余额与明细不一致 | 记录每次余额影响，编辑按差额、回滚/删除按已确认规则反向调整 |
| Payton 公共支出重复扣 | Payton 收支只改 pocket；只过滤 Papa 记录计算 Papa 公共支出 |
| Owner 分析串账 | 所有分析页按当前 Owner 过滤；market-price 同品牌同名联动限定相同 owner |
| Payton 截断日前无快照 | 现金流监控从 `openingAt` 开始展示，早期月份为空，不借用 Papa 快照 |
| 当前日快照已存在 | 合并时更新同一条 10/21 快照的 Payton/merged 字段，保留 Papa 原值，售出后更新最终值 |
| 历史快照无 payton 字段 | 展示层空值降级 |
| 旧测试引用 carFundBalance | 同步清理相关断言与函数 |
| 远程旧页面仍读旧基金、无 Owner 标签 | 已接受本次不改；只作为旧版查询页，主应用是准确入口 |

## 十四、实施顺序

1. **基础设施**：owner 字段 + `ownerRegistry` + 迁移层 + 槽位 + 版本 bump + 单测。
2. **导入**：`scripts/car-import.mjs` + 映射/幂等/期初计算 + 单测。
3. **计算与统计**：合并公式、owner 过滤、`getInventoryStats` / `getPublicExpense` / `getFinanceStats`、dataProtection。
4. **UI**：顶部切换器、首页合并总览、库存/财务/销售过滤、入库选 owner。
5. **快照与日志**：快照 payton/merged 区块、日志 owner 字段。
6. **回归与验收**：全量测试、构建、真实导出导入核对。

## 十五、第三轮决策收口（2026-10-21）

| 项 | 决策 |
|---|---|
| 10/15 截点库存 | 240 辆；包含 10/19 售出的宝马 507；销售录入后当前库存回 239 |
| Payton 零钱/投资/贷款 | pocket −305.96；invest +366.54；三笔贷款剩余合计 4000；基金实时求和 |
| 新模块 | Payton资金，单独侧栏，仅 Payton 模式显示；零花/贷款/互转三页签 |
| Payton 零花/贷款/互转 | 非车辆收入支出固定 pocket；贷款借入/还款按 car 规则作用 invest 和贷款剩余；互转保留 |
| Owner分配 | 入库逐件选择 Owner 和 Payton 自留/投资类型；旧/新采购中先 Papa 暂管 |
| 售车资金 | 加实际到手金额；编辑/回滚按差额调整；利润不重复加到 Papa 计算器 |
| 当前日快照 | 更新现存 10/21 同一条：保留 Papa 原字段，补 Payton/合并字段；补售后更新 |
| 远程页与 car | `ysp-remote.html` 本次不改；car 程序零代码改动、不再作为录入端 |

## 十六、最终自检记录（2026-10-22）

- 已按第十二节自检清单复核数据模型、旧数据迁移、导入范围与幂等、采购和销售余额联动、Payton 资金、Owner 分析隔离、快照、保护、云同步、UI 与验收要求。
- 占位扫描未发现 `TBD`、`TODO` 或未处理的“待确认”项。销售分析、市场价格、账龄和现金流规则已按大王陛下 2026-10-22 的答复补明：所有分析跟随当前 Owner；Payton 市价只联动 Payton 商品；Payton 现金流从 2026-10-15 起显示，之前月份留空。
- 两份真实 JSON 的关键数量、成本、账户期初、贷款和合并余额已重新独立计算；Payton 基金按带正负号的原值直接加入总公式，修正了旧稿中容易把“减去负基金”误解为正向的表达。
- 导入脚本明确不得覆盖任何输入文件，输出前将 YSP 输入原字节备份至 `<out>.bak`；所有实现保持 car 源码与手机远程页不变。
- 当前项目基线：`npm test` 为 18 个测试文件、219 项通过。构建尚未运行；实施后按验收项验证。

自检完成，供大王陛下本轮明确授权的实施工作使用。

### 实施验收补记（2026-10-22）

- 实施后 `npm test`：25 个测试文件、254 项通过；`npm run build` 成功。
- 真实导入验收使用临时输出及 `.bak`，导入 240 辆、成本 ¥14,010.87，期初 pocket −¥305.96、invest +¥366.54，3 笔 active loan；重复运行新增 0 项，两份源 JSON 的 SHA-256 均未改变。
- 宝马 507 销售 ¥15 的验收模拟结果为库存 239 辆、成本 ¥14,000.87、基金 −¥3,924.42、支付宝 −¥5,496.48。
- 手工页面验收覆盖 Owner 切换与菜单显隐、Payton 资金三标签、库存、未保存采购草稿、销售、销售分析、市场价格、账龄和首页现金流。为保留恢复冲突中的数据选择边界，后续点击在空数据隔离会话中完成，并仅通过浏览器 DOM 临时隐藏遮罩；没有新增或编辑业务记录。首个会话确认“用云端”后进入二次防覆盖确认并停止响应，恢复结果未能核实，完整大数据恢复路径仍需单独复核。
- 页面验收发现 Payton 开账日前月份原先被空值格式化为 0；实现已修正为 `--`/图表空值，并新增 `CashflowMonitor` 组件回归测试。
