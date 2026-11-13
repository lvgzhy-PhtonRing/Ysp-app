# car 历史档案核验器实施计划

> **For agentic workers:** 当前会话按任务顺序执行。

**目标：** 在档案页提供只读核验器，对比 car 停用备份和 YSP 历史档案数据，并报告页面模块与子标签结构。

**架构：** 将比对逻辑放入纯数据模块；档案弹窗提供文件选择和结果展示。核验器仅读所选 JSON 与当前档案，不触碰主数据和云端。

**技术栈：** Vue 3、JavaScript、Vitest。

**设计：** `docs/superpowers/specs/2026-11-13-car-archive-verifier.md`

## 任务

### 任务 1：比对逻辑与单元验证

- [x] 新建 `src/data/carHistoryVerification.js`，比较 SID 商品字段和六类财务/历史数据，返回汇总、逐项差异与结构提醒。
- [x] 新建 `src/data/carHistoryVerification.test.js`，覆盖完全一致、商品字段更名、缺失/额外记录和布局提醒。
- 先验证新测试失败，再实现最小逻辑并让测试通过。

### 任务 2：档案弹窗核验入口

- [x] 修改 `src/modules/home/CarHistoryArchive.vue`，增加原始 car 文件选择、核验报告和“无需保存”的说明。
- [x] 比较时只使用当前内存档案和用户选中的源文件，不执行写入或云同步。
- [x] 渲染数据汇总、差异详情与页面结构提醒。

### 任务 3：实际备份核验

- [x] 用真实 `car_backup_2026-11-13.json` 自核验比较逻辑和数据汇总。
- [x] 检查原始备份的商品和流水计数与报告一致，并检查 Vue 生产构建。
- [ ] 在持有用户当前档案的 YSP 浏览器会话中，选择基准文件运行档案页核验；本次会话无法读取该会话中的 localStorage。
