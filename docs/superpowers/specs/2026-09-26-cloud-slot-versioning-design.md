# 云端槽位版本化（C2）设计

日期：2026-09-26
代码基准：当前 `main`（APP_VERSION 3.12.10，工作区含 30s 周期检测修复 + 800ms 静默上行 + 双标签页提示，均未提交）

## 背景

当前云同步为"整份 JSON 快照"模式：`exportData()` 全量写入 `ysp_state` 的 `main` 行 `payload`（约 992KB），比对与冲突判定皆以**整个 payload** 为单位。由此产生两个结构性缺陷：

| 缺陷 | 表现 |
|---|---|
| 冲突面过大 | 任意一处集合改动即构成"全局差异"，自动同步频繁弹三层冲突框 |
| 无法多设备共存 | 两设备各改不同集合，也不得不二选一（upload / use-cloud），另一侧改动丢失 |

`computeConflictDiff` 虽有 8 集合条目级差异展示，但它只影响弹窗"显示什么"，不影响"何时弹"与"怎么解"。本设计引入**槽位版本化**：给每个集合独立版本号，让"何时弹"收缩到"双方都改过同一集合"、"怎么解"升级为逐槽位合并保留双方改动。

## 目标

1. 冲突弹窗只对「本地与云端**都修改过且内容不同**的同一集合」出现，频率降至数量级以下
2. 多设备编辑不同集合互不覆盖：真正逐槽位合并保留双方改动
3. 手机查询页（ysp-remote.html）**零改动零破坏**（它已因 `main` 私有化而读不到，本轮不修复）
4. Supabase 表结构 / RLS 策略 / cloudStore.js 传输协议 / `car` 行 / localStorage 存储格式 **完全不动**（payload 为超集）

## 不改的部分

- Supabase 表结构、RLS 7 条策略、`car` 行协议、anon key 机制
- `cloudStore.js` 的 fetch/save（仍整包读写）
- 手机查询页 `ysp-remote.html` 读 payload 的方式
- 本地存储 key `ysp_data` / `ysp_ui` 及 `loadData` 对未知键的宽容
- 撤销/重做、操作日志、快照、`saveUiStateToLocalStorage` 持久化机制
- 各业务模块的计算逻辑

## 架构总览

```
exportData() payload 增加 _rev（9 槽位版本表）  ← 数据模型
saveToLocalStorage 逐槽位检测变更并 bump rev   ← 版本记账
computeSlotPlan(local, cloud, baselineRev)      ← 纯函数，四动作判定
runCloudSync + loadCloudOnStartup 共用引擎       ← 消除双实现
App.vue 冲突弹窗逐槽位三选 + 合并                 ← UI
cloudStatus.cloudRev                            ← 同步基线（持久化）
```

## 数据模型

### 槽位集合（与 `computeConflictDiff` 对齐，共 9 个）

| slot | 取值路径 |
|---|---|
| `items` | `payload.items` |
| `calc` | `payload.calc` |
| `finance.records` | `payload.finance?.records` |
| `finance.loans` | `payload.finance?.loans` |
| `transfers` | `payload.transfers` |
| `rushcar.entries` | `payload.rushcar?.entries` |
| `rushcar.forwarderInfos` | `payload.rushcar?.forwarderInfos` |
| `rushcar.mattelSiteInfos` | `payload.rushcar?.mattelSiteInfos` |
| `rushcar.paymentCards` | `payload.rushcar?.paymentCards` |

`SLOT_KEYS` 为上述键的常量数组，配套 `slotValue(payload, slot)` 取值函数与 `slotSerialize(payload, slot)`（`stableSerialize` 规范序列化）。

### payload 新增 `_rev`

```js
_rev: {
  items:            { rev: 3, at: 'ISO' },
  calc:             { rev: 4, at: 'ISO' },
  'finance.records':{ rev: 7, at: 'ISO' },
  // … 每个内部有真实变更的槽位
}
```

- 只记录"自基线以来改过"的槽位；从未变过的槽位可不写（缺失即 rev 0）
- `_rev` 随 payload 上传，云端与本地各有自己的副本，一起被双方读写
- `normalizePayloadForCompare` / `isContentEqual` 将 `_rev` 与 `updatedAt` 同等排除（版本号不算"业务内容"）

### 同步基线 `cloudStatus.cloudRev`

```js
cloudRev: { items: 3, calc: 4, … }   // { slot: rev }，仅记录数字
```

- 语义：**上一次成功同步时，云端各槽位的 rev**
- 随 `ysp_ui` 持久化（`saveUiStateToLocalStorage`），默认 `{}`
- 每次成功同步（上传/采纳）后，将对应槽位置为"写入后云端 rev"

## 版本记账（`saveToLocalStorage`）

- 保留 `lastPersistedCompareSerialized` 思路，升级为逐槽位串映射 `lastPersistedSlot: { [slot]: string }`
- 保存时对每个槽位：`slotSerialize(当前) !== lastPersistedSlot[slot]` → 该槽位 `rev++`、`at=now`、更新快照串
- 纯时间戳对齐 / 内容未变（`bumpTimestamp:false`）的保存 → 不 bump 任何 rev（防同步回环，维持现有 `stripUpdatedAt` 思路）
- `_rev` 更新后并入当前 payload 一起落盘

## 同步决策纯函数 `computeSlotPlan`

```js
computeSlotPlan(localPayload, cloudPayload, baselineRev)
  → { [slot]: 'align' | 'upload' | 'adopt-cloud' | 'conflict' }
```

判定次序（每槽位独立）：

| 次序 | 条件 | 动作 |
|---|---|---|
| 1 | `slotSerialize(local) === slotSerialize(cloud)` | `align`：内容一致，仅对齐时间戳，零打扰 |
| 2 | 仅本地 rev 越过基线（`localRev !== base && cloudRev === base`） | `upload`：本地赢，随整包上传 |
| 3 | 仅云端 rev 越过基线（`cloudRev !== base && localRev === base`） | `adopt-cloud`：收下云端槽位 |
| 4 | 双方 rev 皆越基线且内容不同 | `conflict`：弹框 |
| 5 | rev 皆未越基线但内容不同（异常/手改/旧数据） | **保守 `conflict`**，绝不静默覆盖 |

- rev 缺失值按 0 处理（`_rev[slot]?.rev ?? 0`、`baseline[slot] ?? 0`）
- 注：上传后云端 rev 即被写成本地 rev，上传成功将基线置为该值，本地 rev 与基线再次相等（"未动"），自洽。

### 各触发路径的槽位动作映射

| 路径 | `align` | `upload` | `adopt-cloud` | `conflict` |
|---|---|---|---|---|
| 30s 周期 / 启动 / 手动（非 silent） | 自动 | 自动上传 | **弹框确认后采纳** | 弹框三选 |
| 手动 force | 自动 | 自动上传 | 弹框确认后采纳 | 弹框三选 |
| 800ms 编辑去抖（silent） | 自动 | 自动上传 | **跳过**（留给下轮检测，避免静默覆盖本地） | **跳过**（留给下轮检测） |

与现状一致：`silent` 永不静默下载（延续 2026-08-28 事故教训）。

## 同步引擎整合

- 新增 `performSyncDecision({ reason, silent })`（store.js 内部，供 `syncToCloudNow` / `runCloudSyncCheck` / 新 `runStartupSync` 调用）：`$GET pre-check` → `computeSlotPlan` → 对非 silent 的 `adopt-cloud`/`conflict` 槽位调用 `cloudConflictHandler(slotList)` → 组装结果 payload → 上传或本地落盘 → 更新基线。
- `loadCloudOnStartup`（App.vue）改为调用 `runStartupSync()` 的薄壳：只保留 `setCloudLoadSuccess/Error`、操作日志、返回值。删除其内联三分支，消除双实现漂移风险。
- `pullFromCloud`（App.vue，显式"云端→本地全量采纳"）改为调用共享引擎：所有槽位以 `adopt-cloud` 意图处理（踩 `shouldWarnBeforeOverwrite` 的槽位弹二次确认），并走同一合并/落盘路径以维持 `cloudRev` 基线记账正确；保留 `trackHistory:true` 可撤销语义。
- `runCloudSync` 入口补 `syncing` 重入锁（顺手修复此前标记的并发竞态）。
- `applyCloudDataToStore`（App.vue）守卫改为**仅对将被采纳的槽位**生效：云端该槽位缺失/损坏且本地有数据 → 拒绝该槽位、回退本地、记日志，不整包拒绝。

## 冲突弹窗改造（App.vue）

- 触发条件从"整包 diff.total > 0"改为"存在 `conflict` 槽位"
- 弹窗列出每个 conflict 槽位 + 该槽位条目级差异摘要（复用 `computeConflictDiff` 过滤到该槽位），每项三选：
  - **① 本地**：本侧槽位胜（参与上传）
  - **② 云端**：采纳云端槽位（参与下载）
  - **③ 都留**：本侧槽位胜 + 云端侧落盘为冲突副本 `饮食派数据_\<slot\>_冲突副本_\<ts\>.json`（复用 `downloadJsonBackup`）＋ `cloud_conflict` 日志
- 提供栏头快捷动作：全部取本地 / 全部取云端
- 槽位默认方向由 `primaryConflictAction` 按时间推理（本地`at`新→本地，反之云端）
- `shouldWarnBeforeOverwrite`（骤减 ≥max(5,10%) / 日期倒挂）**按槽位**挂在对应选项：选"云端"且该槽位命中强警告 → 复用 `overwriteWarn` 二次确认
- "确认"后**合并**：逐槽位按所选来源取值拼装目标 payload；`version` 取本程序 `APP_VERSION`；`snapshots` 按 `date` 取并集（同日保留本地）；`updatedAt` 上传取 PATCH 后服务端值，纯采纳取云端 `updated_at`。合并结果整体 PATCH 上传（若含 upload 槽位）；全采纳/全对齐场景按现状处理
- 弹窗仍是原有三层交互（差异摘要 + 选择 + 确认），但内部粒度变为槽位

## 兼容与迁移

| 场景 | 规则 |
|---|---|
| 云端旧数据无 `_rev` | 该槽位 rev 按 0（即基线）。本地动了 → 上传；本地未动 → 对齐。合并后若结果 `_rev` 与云端不一致，补一次印章上传自愈 |
| 本地旧数据无 `_rev` | 惰性初始化 `{}`，基线 `cloudRev={}` |
| 手机页 | payload 多 `_rev` 键，`initApp` 忽略未知键，零改动 |
| 快照/版本/updatedAt | 非槽位字段，全局处理，不参与冲突 |

## 错误处理

| 场景 | 行为 |
|---|---|
| 云端槽位损坏且本地有数据 | 拒绝采纳该槽位（回退本地），记 `cloud_sync` 日志，不整包拒绝 |
| silent 遇 conflict/adopt-cloud | 跳过，记日志，留给 30s 周期/启动弹框 |
| 合并中途异常 | 回滚到合并前本地状态，抛错置 `lastSyncError` |
| rev 一致但内容不同 | 保守冲突，不静默覆盖 |
| 并发重入 | `runCloudSync` 入口 `syncing` 检查并短路 |

## 测试计划（vitest）

| 文件 | 用例 |
|---|---|
| 新建 `src/data/cloudSlotPlan.test.js` | 四动作 × 9 槽位；rev 缺失；内容相同 rev 不同→align；rev 平内容不同→conflict；上传后基线自洽 |
| `saveToLocalStorage` 版本记账 | 单槽变/多槽变/纯时间戳不 bump；去抖防回环 |
| 同步引擎 | 双槽冲突→仅列 conflict 槽；非 conflict 槽自动处理；silent 跳过 adopt/conflict；`loadCloudOnStartup` 统一后行为回归（沿用现有 force 智能比对用例） |
| 迁移 | 旧 payload 无 `_rev` 降级；印章上传自愈 |

该方案为单文件层级设计文档，直接进入 writing-plans 生成实施计划。

## 验收标准

1. 两设备各改不同集合 → 同步后双方集合都保留（无弹窗或仅对齐）
2. 双方都改同一集合 → 弹窗仅列出该集合，三选生效
3. 现有 107+ 用例全绿；`npm run build` 通过
4. 手机页收到含 `_rev` 的 payload 渲染行为与现在完全一致（人工验证可选）
5. Supabase / RLS / `car` 行无任何改动