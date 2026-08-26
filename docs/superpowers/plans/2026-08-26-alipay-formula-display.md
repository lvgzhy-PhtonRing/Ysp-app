# 支付宝计算器公式展示优化（正负对账两栏）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把「支付宝余额计算器」的公式展示从一行纯文本改为「进/资金」与「出/货·债·基金」两栏对账，不改公式计算、不改模块布局。

**Architecture:** 在 `src/utils/calc.js` 增加纯函数 `buildAlipayBreakdown` 生成分组明细与两栏小计（可单测）；`HomeModule.vue` 用它替换原 `alipayFormula` computed，模板把应有余额框改成左右两栏对账。界面实际算「应有余额」的 `alipayBalance` computed 不动。

**Tech Stack:** Vue 3 (script setup), Tailwind, Vitest

**Spec:** `docs/superpowers/specs/2026-08-26-alipay-formula-display-design.md`

---

### Task 1: `buildAlipayBreakdown` 纯函数（TDD）

**Files:**
- Modify: `src/utils/calc.js`（在 `calcAlipayBalance` 之后追加函数）
- Test: `src/utils/calc.test.js`

- [ ] **Step 1: 写失败测试**（追加到 `src/utils/calc.test.js`）

在 import 行加入 `buildAlipayBreakdown`：

```js
import {
  buildAlipayBreakdown,
  calcAlipayBalance,
  calcItemCost,
  calcPreTransferCost,
  calcProfit,
  calcTransferCost,
} from './calc'
```

文件末尾追加测试：

```js
  it('buildAlipayBreakdown should group by incoming/outgoing with subtotals', () => {
    const b = buildAlipayBreakdown(108504.41, 6000, 21512, 94821.31, 1006, -4887.14, 37398.38)
    expect(b.incoming.map((x) => x.label)).toEqual(['挖财总负债', '借贷余额', '总实盈利润'])
    expect(b.outgoing.map((x) => x.label)).toEqual(['库存总货值', '采购中金额', '未确认交易', "Payton's基金"])
    expect(b.inSubtotal).toBeCloseTo(136016.41, 2)
    expect(b.outSubtotal).toBeCloseTo(-138112.83, 2)
    // 基金是负值(借出)，出栏中直接取 fund
    expect(b.outgoing[3].value).toBe(-4887.14)
  })
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/utils/calc.test.js`
Expected: FAIL —— `buildAlipayBreakdown is not exported` / `not a function`

- [ ] **Step 3: 实现函数**（追加到 `src/utils/calc.js` 末尾）

```js
/**
 * 支付宝余额分组明细（正负对账两栏）：
 *   进栏=资金(负债+借贷+利润)；出栏=货·债·基金(库存+采购+未确认+基金，均取负向值)
 * 基金余额为负表示借出给基金，直接取 fund，故出栏显示为负。
 */
export function buildAlipayBreakdown(
  debt,
  loanBalance,
  actualProfit,
  inventoryValue,
  unconfirmed,
  fund,
  purchaseCost,
) {
  const incoming = [
    { label: '挖财总负债', value: Number(debt) },
    { label: '借贷余额', value: Number(loanBalance) },
    { label: '总实盈利润', value: Number(actualProfit) },
  ]
  const outgoing = [
    { label: '库存总货值', value: -Number(inventoryValue) },
    { label: '采购中金额', value: -Number(purchaseCost) },
    { label: '未确认交易', value: -Number(unconfirmed) },
    { label: "Payton's基金", value: Number(fund) },
  ]
  const inSubtotal = incoming.reduce((s, x) => s + x.value, 0)
  const outSubtotal = outgoing.reduce((s, x) => s + x.value, 0)
  return { incoming, outgoing, inSubtotal, outSubtotal }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/utils/calc.test.js`
Expected: PASS（含新增用例，全文件 6 tests）

- [ ] **Step 5: Commit**

```bash
git add src/utils/calc.js src/utils/calc.test.js
git commit -m "feat: 新增支付宝余额分组明细纯函数 buildAlipayBreakdown（含测试）"
```

---

### Task 2: `HomeModule.vue` 集成两栏对账

**Files:**
- Modify: `src/modules/home/HomeModule.vue`

- [ ] **Step 1: 新增 import**

在 `import { getPublicExpense } from '../finance/useFinance'`（第 14 行）之后加一行：

```js
import { buildAlipayBreakdown } from '../../utils/calc'
```

- [ ] **Step 2: 用 `alipayBreakdown` computed 替换 `alipayFormula`**

删除第 85–87 行的 `alipayFormula` computed：

```js
const alipayFormula = computed(() => {
  return `挖财总负债(${fmtMoney(store.calc.debt)}) + ... = ${fmtMoney(alipayBalance.value)}`
})
```

在同一位置替换为：

```js
const alipayBreakdown = computed(() =>
  buildAlipayBreakdown(
    store.calc.debt,
    financeLoanBalance.value,
    totalActualProfit.value,
    inventoryValue.value,
    store.calc.unconfirmed,
    carFundBalance.value,
    purchaseStats.value.totalCost,
  ),
)
```

- [ ] **Step 3: 模板「应有余额框」改为两栏对账**

把第 278–284 行：

```html
      <div class="bg-white p-4 rounded-xl shadow-sm border border-blue-50">
        <div class="flex items-center justify-between">
          <div class="text-sm font-bold text-gray-700">应有支付宝余额</div>
          <div class="text-2xl font-bold text-primary">{{ fmtMoney(alipayBalance) }}</div>
        </div>
        <div class="mt-1 text-[11px] text-gray-400 leading-relaxed">{{ alipayFormula }}</div>
      </div>
```

替换为：

```html
      <div class="bg-white p-4 rounded-xl shadow-sm border border-blue-50">
        <div class="flex items-center justify-between mb-3">
          <div class="text-sm font-bold text-gray-700">应有支付宝余额</div>
          <div class="text-2xl font-bold text-primary">{{ fmtMoney(alipayBalance) }}</div>
        </div>
        <div class="flex gap-2">
          <div class="flex-1 bg-green-50 border border-green-200 rounded-lg p-2.5">
            <div class="text-[11px] font-bold text-green-700 mb-1">进 / 资金</div>
            <div v-for="x in alipayBreakdown.incoming" :key="x.label" class="flex justify-between text-xs text-gray-600 py-0.5">
              <span>{{ x.label }}</span><span class="text-green-700">+{{ fmtMoney(x.value) }}</span>
            </div>
            <div class="flex justify-between text-xs font-bold text-green-700 border-t border-green-200 mt-1 pt-1">
              <span>小计</span><span>+{{ fmtMoney(alipayBreakdown.inSubtotal) }}</span>
            </div>
          </div>
          <div class="flex-1 bg-orange-50 border border-orange-200 rounded-lg p-2.5">
            <div class="text-[11px] font-bold text-orange-700 mb-1">出 / 货·债·基金</div>
            <div v-for="x in alipayBreakdown.outgoing" :key="x.label" class="flex justify-between text-xs text-gray-600 py-0.5">
              <span>{{ x.label }}</span><span class="text-orange-700">{{ fmtMoney(x.value) }}</span>
            </div>
            <div class="flex justify-between text-xs font-bold text-orange-700 border-t border-orange-200 mt-1 pt-1">
              <span>小计</span><span>{{ fmtMoney(alipayBreakdown.outSubtotal) }}</span>
            </div>
          </div>
        </div>
      </div>
```

说明：`incoming` 值均为正 → 模板前缀 `+`；`outgoing` 值均为负（含基金 −4887.14）→ `fmtMoney` 直接带负号。小计展示与「应有余额」差值吻合（进 136,016.41 − 出 138,112.83 = −2,096.42）。

- [ ] **Step 4: 验证构建**

Run: `npm run build`
Expected: 构建成功，无 `alipayFormula is not defined` 之类报错

- [ ] **Step 5: Commit**

```bash
git add src/modules/home/HomeModule.vue
git commit -m "feat: 支付宝余额公式改为正负对账两栏展示"
```

---

### Task 3: 整体验证与核对

**Files:** 无（仅验证）

- [ ] **Step 1: 跑全部单元测试**

Run: `npx vitest run src/utils/calc.test.js`
Expected: 全部通过

- [ ] **Step 2: 启动应用人工核对**

Run: `npm run dev`，打开首页「支付宝余额计算器」
核对（真实数据应为）：
- 应有余额大数字仍为 `-2096.42`
- 左栏「进/资金」：挖财总负债 +108504.41 · 借贷余额 +6000.00 · 总实盈利润 +21512.00 · 小计 +136016.41
- 右栏「出/货·债·基金」：库存总货值 -94821.31 · 采购中金额 -37398.38 · 未确认交易 -1006.00 · Payton's基金 -4887.14 · 小计 -138112.83
- 底部「实际余额」行不受影响（-2315.29）
- 输入框改 `debt`/`unconfirmed` 数值，两栏小计与应有余额同步变化，且 `应有余额 = 进小计 + 出小计` 恒成立

- [ ] **Step 3: 最终提交检查**

Run: `git status`
Expected: 无未提交改动（两 commit：Task 1 纯函数 + Task 2 界面）
