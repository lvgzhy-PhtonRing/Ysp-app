# 报税导出明细排序与税务归类下拉菜单实施计划

> **实施状态：已完成并合入后续版本（2026-11-07 复核）**。此文件保留原实施计划；当前实现的分类选项包含“待人工确认”默认项及七个用户分类，明细按相应日期升序稳定排序。详情以 `buildTaxWorkbook.js` 为准。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让报税导出的收支明细可直接选择税务归类，并统一三张明细表按日期升序排列。

**Architecture:** 在报税工作簿数据构建阶段先完成稳定的日期升序排序；在 Excel 写出阶段为“收支明细”的“税务归类”列添加原生数据验证下拉菜单。保留现有“待人工确认”默认值，不改变税务计算或原始数据。

**Tech Stack:** Vue/JavaScript、SheetJS `xlsx` 工作簿导出、Vitest。

**Spec:** 用户 2026-11-07 指令及已确认的方案 A。

## Global Constraints

- 税务归类仅供导出后人工选择，不自动判断税务资格。
- 销售明细按入账日期升序；收支明细按日期升序；补差明细按入账日期升序。
- 默认归类仍为“待人工确认”。
- 不改变销售归期、金额计算、Owner 筛选和原始数据。

## Review Focus

- 缺少日期的收支记录仍进入待确认事项，不参与排序或期间汇总。
- 同一天多条记录保持稳定顺序，不能因排序产生随机跳动。
- 无补差记录时，补差明细仍可正常导出。
- Excel 下拉菜单覆盖所有导出的收支明细行，并包含七个指定选项。
- 下拉菜单不覆盖表头，也不改变“备注”等其他列。

### Task 1: 日期排序

**Files:**
- Modify: `src/modules/tax-export/buildTaxWorkbook.js`
- Test: `src/modules/tax-export/buildTaxWorkbook.test.js`

- [ ] 为销售、收支、补差分别增加按 ISO 日期字符串升序的稳定排序测试。
- [ ] 在构建工作簿数据时排序：销售按 `entryDate`，收支按 `date`，补差按 `entryDate`；同日期保留原数组顺序。
- [ ] 运行报税导出测试并确认缺失日期记录仍只进入待确认事项。

### Task 2: 税务归类下拉菜单

**Files:**
- Modify: `src/modules/tax-export/buildTaxWorkbook.js`
- Test: `src/modules/tax-export/TaxExportModal.test.js` 或导出辅助测试

- [ ] 固定七个下拉选项：经营费用、采购成本、平台服务费、快递费、个人支出、借贷或资金往来、不允许税前扣除的项目。
- [ ] 在“收支明细”税务归类列的数据行范围写入 Excel 原生数据验证；默认单元格值仍为“待人工确认”。
- [ ] 验证工作簿结构包含验证规则，且验证范围从首条数据覆盖到最后一条数据。

### Task 3: 回归验证

- [ ] 运行相关 Vitest 测试。
- [ ] 生成一份测试工作簿，检查三张明细表首尾日期顺序、收支税务归类默认值和下拉验证范围。
- [ ] 检查工作簿可正常打开，既有列名和金额不变。
