# 转运费拆分实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with verification checkpoints.

**Goal:** 将新建/编辑转运的费用拆为转运物流与海关关税，保留总额兼容字段，并在商品搜索器采购信息中展示两项商品级分摊。

**Architecture:** 在 `usePurchase.js` 增加统一的转运费用拆分与规范化逻辑；`PurchaseModule.vue` 只负责表单输入、历史回退和展示，仍把计算后的 `totalRMB` 交给现有成本分摊流程。每件商品同时保存两项分摊与兼容的 `transferCost`，`HomeModule.vue` 按新字段显示明细，旧数据继续显示原转运费。

**Tech Stack:** Vue 3 `<script setup>`, Vitest, 现有 `calcTransferCost`、Pinia-like store 和操作日志。

---

### Task 1: 建立费用拆分的纯函数和失败测试

**Files:**
- Modify: `src/modules/purchase/usePurchase.js`
- Test: `src/modules/purchase/usePurchase.test.js`

- [ ] **Step 1: 写失败测试**

在 `usePurchase.test.js` 增加测试，调用导出的费用规范化/分摊函数，验证：

```js
it('splits transfer totals into logistics and customs duty', () => {
  expect(normalizeTransferFeeBreakdown({ logisticsRMB: 80, customsDutyRMB: 20 })).toEqual({
    logisticsRMB: 80,
    customsDutyRMB: 20,
    totalRMB: 100,
  })
  expect(splitTransferFeeByCoefficient({ logisticsRMB: 80, customsDutyRMB: 20 }, 2, 4)).toEqual({
    logisticsCost: 40,
    customsDutyCost: 10,
    transferCost: 50,
  })
})
```

- [ ] **Step 2: 运行测试确认按预期失败**

运行：`npm test -- --run src/modules/purchase/usePurchase.test.js`

预期：因函数尚未导出而失败。

- [ ] **Step 3: 实现最小纯函数**

在 `usePurchase.js` 增加非负金额规范化、总额求和和按系数分摊函数；所有输出使用现有金额精度规则，`totalRMB` 始终为两项之和。

- [ ] **Step 4: 运行测试确认通过**

运行同一命令，预期新增测试与现有采购测试全部通过。

### Task 2: 让新建转运保存两项费用并分摊到商品

**Files:**
- Modify: `src/modules/purchase/PurchaseModule.vue`
- Modify: `src/modules/purchase/usePurchase.js`
- Test: `src/modules/purchase/usePurchase.test.js`

- [ ] **Step 1: 写失败测试**

增加新建转运测试：准备两个转运系数为 `1` 的采购商品，提交 `{ logisticsRMB: 80, customsDutyRMB: 20 }`，断言转运记录保存三项金额，每个商品保存两项分摊，且 `transferCost` 与 `cost` 正确。

- [ ] **Step 2: 运行测试确认失败**

运行：`npm test -- --run src/modules/purchase/usePurchase.test.js`

预期：当前 `submitTransfer` 只接受 `totalRMB`，新增断言失败。

- [ ] **Step 3: 修改实现**

在新建转运表单增加 `logisticsRMB`、`customsDutyRMB`，用计算属性显示总额和每系数分摊；提交时规范化并传入 `totalRMB`。在 `submitTransfer` 中保存两项记录字段，并分别分摊到 `purchaseDetails.transferLogisticsCost`、`purchaseDetails.customsDutyCost`，再将两者之和写入 `transferCost`。

- [ ] **Step 4: 运行测试确认通过**

运行同一采购测试命令，预期全部通过。

### Task 3: 支持编辑转运和历史记录安全回退

**Files:**
- Modify: `src/modules/purchase/PurchaseModule.vue`
- Test: `src/modules/purchase/PurchaseModule.test.js`（若不存在则创建）或 `src/modules/purchase/usePurchase.test.js`

- [ ] **Step 1: 写失败测试**

覆盖两种情况：

```js
it('falls back legacy total to logistics when editing a historical transfer', () => {
  // record has totalRMB: 100 and no logisticsRMB/customsDutyRMB
  // opening edit yields logisticsRMB 100, customsDutyRMB 0
})

it('recalculates both item components when editing a transfer', () => {
  // change logistics/customs, assert record total and item cost fields update
})
```

- [ ] **Step 2: 运行测试确认失败**

运行对应采购测试文件，预期历史回退和编辑分摊断言失败。

- [ ] **Step 3: 修改实现**

编辑表单打开时使用 `logisticsRMB ?? totalRMB` 与 `customsDutyRMB ?? 0`；保存时由两项重新生成总额，写回记录并分别更新所有关联商品。保留原有已售商品提示、操作日志变化记录和销售利润联动。

- [ ] **Step 4: 运行测试确认通过**

运行对应测试文件，预期历史和编辑测试全部通过。

### Task 4: 在商品搜索器采购信息展示明细

**Files:**
- Modify: `src/modules/home/HomeModule.vue`
- Test: `src/modules/home/HomeModule.test.js`

- [ ] **Step 1: 写失败测试**

加入一个带 `transferLogisticsCost: 12.5`、`customsDutyCost: 3.5` 的商品，渲染商品详情并断言包含“转运物流：12.50”和“海关关税：3.50”；另保留一个只有旧 `transferCost` 的商品，断言仍显示“转运费”。

- [ ] **Step 2: 运行测试确认失败**

运行：`npm test -- --run src/modules/home/HomeModule.test.js`

预期：当前搜索器只显示旧的“转运费”。

- [ ] **Step 3: 修改实现**

在采购信息区域增加新字段显示；只有对应字段存在或大于零时显示新明细，历史商品继续显示原“转运费”，避免把历史数据误显示为零。

- [ ] **Step 4: 运行测试确认通过**

运行同一 HomeModule 测试命令，预期全部通过。

### Task 5: 回归验证并提交

**Files:**
- Modify: `src/data/logReplay.js` 或其测试（仅在新增字段需要日志回放覆盖时）
- Test: `src/modules/purchase/usePurchase.test.js`, `src/modules/home/HomeModule.test.js`, 全量测试

- [ ] **Step 1: 检查兼容消费者**

确认删除转运、入库、回滚、云端载荷、报税导出仍读取 `totalRMB`/`transferCost`，不因新字段缺失而抛错。

- [ ] **Step 2: 运行定向测试**

运行：`npm test -- --run src/modules/purchase/usePurchase.test.js src/modules/home/HomeModule.test.js`

- [ ] **Step 3: 运行全量测试**

运行：`npm test -- --run`

记录任何与本改动无关的既有依赖失败，不修改无关模块。

- [ ] **Step 4: 提交实现**

```bash
git add src/modules/purchase/usePurchase.js src/modules/purchase/PurchaseModule.vue src/modules/purchase/usePurchase.test.js src/modules/home/HomeModule.vue src/modules/home/HomeModule.test.js
git commit -m "feat: split transfer fees into logistics and customs"
```
