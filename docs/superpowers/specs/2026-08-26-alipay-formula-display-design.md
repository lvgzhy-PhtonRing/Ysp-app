# 支付宝计算器 · 公式展示优化（正负对账两栏）设计

日期：2026-08-26

## 背景

「应有支付宝余额」当前以一行纯文本公式展示（`alipayFormula`），7 个分量按输入顺序罗列，
看不出「资金 − 货物 − 外债 − 基金」的业务逻辑。

已用真实数据逐项核查过公式定义，确认正确：

```
应有余额 = 钱 − 货 − 外债
  debt(总负债) + loanBalance(借贷) + actualProfit(实盈利润)
  − inventoryValue(库存) − unconfirmed(未确认交易) − purchaseCost(采购中)
  + fund(基金余额，负=借出给基金)
```

本次**只优化公式的展示**，不改公式、不改模块整体布局。

## 目标

把公式展示改为「正负对账两栏」，让「进 / 资金」与「出 / 货·债·基金」对比一目了然。
改动严格限定在「支付宝余额计算器」模块内部。

## 不改的部分

- 模块卡片尺寸、标题、边框
- 上排 5 个输入/显示框（挖财总负债 / 借贷余额 / 公共支出 / 未确认交易 / Payton's基金）
- 底部「实际余额」行（转运公司余额 / 皮蛋手表账户余额 / 实际余额）
- 页面布局、其他模块
- `calc.js`（公式定义已核实，不动）

## 改动：应有余额框（HomeModule.vue 278–284）

原「应有余额大数字 + 一行小字公式」，改为：

1. **顶部**（保持）：「应有支付宝余额」+ 大数字（`fmtMoney(alipayBalance)`，主色蓝）
2. **两栏对账**（flex 并排，间距 6px）：
   - **左栏「进 / 资金」**，绿色浅底（success）：
     - 挖财总负债 `+108,504.41`
     - 借贷余额 `+6,000.00`
     - 总实盈利润 `+21,512.00`
     - 小计 `+136,016.41`
   - **右栏「出 / 货·债·基金」**，橙色浅底（warning，统一一色）：
     - 库存总货值 `−94,821.31`
     - 采购中金额 `−37,398.38`
     - 未确认交易 `−1,006.00`
     - Payton's基金 `−4,887.14`
     - 小计 `−138,112.83`
3. 移除 `alipayFormula` 一行文本及其 computed。

进、出两栏小计并排时，差值即「应有余额」，形成对账感。

## 数据来源

全部来自现有 computed，不改任何计算逻辑：
`financeLoanBalance`、`financePublicExpense`、`totalActualProfit`、`inventoryValue`、
`purchaseCost`、`unconfirmed`、`carFundBalance`、`alipayBalance`、`actualBalance`。

新增一个 `alipayBreakdown` computed，返回
`{ incoming: [{label, value}], outgoing: [{label, value}], inSubtotal, outSubtotal }`，
模板直接渲染该结构，便于测试。

## 数值与颜色

- 数值：两位小数、千分位，`fmtMoney`（与现有一致）
- 颜色：左栏 success 绿（`#34C759`）浅底深字；右栏 warning 橙（`#FF9500`）浅底深字
- 符号：左栏 `+`、右栏 `−`，栏名内说明各栏含义

## 测试

- 为 `alipayBreakdown` 分组与求和逻辑补一个纯函数单元测试（可放入 `src/utils/calc.js` 或独立工具），
  用真实数据断言小计与各项归属。
- 界面展示不做自动化测试，人工在首页核对数字与现有计算一致。

## 兼容性

- 旧系统独立文件 `ysp-remote.html` / `public/ysp-remote.html`：不在本次范围，保持原样。
- 数据导出/云同步不受影响（只改展示）。
