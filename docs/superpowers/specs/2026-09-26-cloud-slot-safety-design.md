# 云端同步安全加固（C3）设计

日期：2026-09-26
代码基准：当前 `main`（APP_VERSION 3.12.10，本地已提交 C2 槽位版本化 + 双标签页提示 + 30s 周期修复，均未推送）
参考：`docs/云储存交互逻辑审计报告-20260926.md`（本设计的问题清单来源）

## 背景

审计报告（2026-09-26）识别出 9 项数据丢失/误操作风险（L1–L9）。本设计落地其中 5 项修复（对应五方案 A–E），修复合集聚焦三类真实攻击面：

| 攻击面 | 触发的风险 | 对应方案 |
|---|---|---|
| 双标签页并发编辑，无强制保护 | L2（假只读）、L5（覆盖写） | A 真实租约锁 |
| 绕过冲突检测的盲写路径回滚云端 | L1（陈旧回写） | B 盲写路径校验 |
| 采纳云端后无 `before` 快照，无法还原 | L4（不可撤销） | C 落档机制 |
| 导入无防护、回溯能力未接入 UI | L3（导入摧毁）、E 目标 | D 导入防护、E 回溯 UI |

## 目标

1. 同一浏览器内多 tab 并发编辑被**真实锁定**（不再是横幅提示的"假只读"）
2. 关闭/切走页面的盲写路径不再回滚云端到陈旧值
3. 每次「采纳云端」前落 `before` 快照，任何一次误采纳都能日后还原
4. 导入前二次确认 + 自动快照，杜绝一步摧毁
5. 提供"回溯到时间点"只读界面，使操作日志 + before 快照真正可用

## 不改的部分（延续 C2 基线）

- Supabase 表结构、RLS、`car` 行协议、anon key、`cloudStore.js` 传输协议（单行整包读写）
- `performSyncDecision` 主引擎路径（已验证 fetch→merge 无陈旧回写问题）
- 手机页 `ysp-remote.html`、本地存储 key `ysp_data`/`ysp_ui` 结构
- 不做 CRDT / 不做服务端版本历史（用户明确排除，rev + before 日志已够用）

---

## 方案 A — Tab 真实租约锁（解决 L2、L5）

### 现状

`tabLease.js` 已实现本地心跳 + TTL（`TAB_LEASE_KEY=ysp_tab`、TTL 5s、心跳 2s、静默期 30s），但 App.vue 仅用它渲染 `otherTabEditing` 横幅，**无任何写入拦截**。横幅文案"本页已锁定为只读"与事实不符。

### 锁定语义（已与用户确认：最后交互者持锁）

不用"谁先打开谁是活跃者"（会导致后开者在无交互时永久被动），改用 **active 权跟随最近手动交互**：

- 每个 tab 在 `mousemove`/`keydown`/`pointerup`（手动交互）时 bump 自己的 `touch`
- 心跳周期写 `{ id, at, touch }` 到 `ysp_tab`
- 判定本页是否锁定：读到的活跃者 `other.id !== own.id && other.touch > own.touch && 距离 now ≤ TTL`

即：**谁最后一个有手动交互，谁就是编辑者，其余 tab 全部禁用输入**。用户切到锁定的 tab 一点击，`touch` 即反超，锁定立即移交——不需要抢锁仲裁，天然自愈。

### App.vue 锁层

- 新增响应式 `tabLocked = ref(false)`，由 `tabLeaseTick` 派生（`parseTabLease(other) → shouldHoldLock(other, own)`）
- 锁定时：主内容区整体加 `pointer-events:none; user-select:none` 的 overlay 遮罩（复用现有横幅位置改为全页遮罩），文案改为真实描述"另一标签页正在编辑，本页已只读（点击可接管）"
- 点击遮罩 → `bumpTabTouch()` 抢锁解锁（当前实现已支持：被锁 tab 一旦交互，touch 反超即成为 active）
- **关键**: 锁定不阻断心跳写入（被锁 tab 也要持续写心跳，才能让对方知道它还活着），只阻断业务输入

### 改动文件

| 文件 | 改动 |
|---|---|
| `src/utils/tabLease.js` | 新增纯函数 `shouldHoldLock(other, own, now)`；`shouldWarnEditorLock` 保留兼容 |
| `src/utils/tabLease.test.js` | 新增 `shouldHoldLock` 用例（同 tab、TTL 过期、空、touch 比较） |
| `src/App.vue` | `tabLocked` 状态 + 全页遮罩 + 点击抢锁；`mousemove` 也计入手动交互 |

---

## 方案 B — 盲写路径校验（根治 L1）

### 现状与根因（已与用户确认落点修正）

`performSyncDecision` 主路径是 `预检 fetch 云端 → computeSlotPlan → buildMerged(已含云端最新) → 上传`，不存在陈旧回写。真正的 L1 漏洞是**两条绕过冲突检测的盲写路径**，它们直接把 `exportData()` 全量盖到云端：

| 路径 | 位置 | 问题 |
|---|---|---|
| `syncSilentlyOnHidden`（页面切走） | App.vue:711-729 | 盲写整份本地导出 |
| 关闭保底 keepalive | App.vue:908-935 | 盲写整份本地导出 |

场景：手机开着没关（缓存了旧快照）→ 电脑改数据并上传 → 手机切走页面 / 关后台 → 盲写把云端回滚到旧值。

### 修复：盲写路径改走引擎 silent 模式（复用已测逻辑）

**先澄清判定基准**：判断"本地这份会不会回滚云端"，必须对照**云端当前状态**，而非 `cloudStatus.cloudRev`（那只是本设备上次同步的记忆，感知不到他人已推进云端）。

`performSyncDecision({ silent: true })` 已精确实现所需语义（store.js:376）：

```
fetch 云端 → computeSlotPlan（对照云端当前 rev）
  ├─ 存在 adopt-cloud / conflict 槽位 → 整轮跳过，不盲写（记日志留档）
  └─ 仅 align / upload → 照常上传（upload 槽本质是"本地动了云端没动"，安全）
```

即 `silent` 模式 **已经杜绝 "把陈旧本地写回云端"**——任何"云端被他人改过"的槽位都会命中 adopt-cloud/conflict 而整轮放弃。因此本方案**不新增任何校验函数**，只需把两条盲写路径从 `saveCloudState(exportData())` 改为调用引擎：

| 原路径 | 改后 |
|---|---|
| `syncSilentlyOnHidden`（页面切走） | `performSyncDecision({ reason:'hidden-sync', silent:true })` |
| 关闭保底 keepalive | `performSyncDecision({ reason:'unload-sync', silent:true, keepalive:true })` |

### keepalive 语义保留

- `performSyncDecision` 新增 `options.keepalive` 透传：上传经 `cloudSyncHandler(merged, { reason:'sync', keepalive })` → App.vue 的 handler 把 `keepalive:true` 传给 `saveCloudState`（失败静默，不阻断页面切换）
- **分歧时静默放弃**，不弹窗（分割路径弹窗不可靠）：数据留在本地 localStorage，启动时 `loadCloudOnStartup` → `runStartupSync` 正常检测并弹窗
- visibilitychange→hidden 先于 beforeunload 触发（同一 tab 顺序），hidden 路径已把数据推走；keepalive 只是 F5/硬导航的次级兜底

### 改动文件

| 文件 | 改动 |
|---|---|
| `src/data/store.js` | `performSyncDecision` 接受并透传 `keepalive`；导出 `hiddenSync` / `unloadSync` 两个薄壳（或复用 `runCloudSyncCheck` 传参） |
| `src/App.vue` | `syncSilentlyOnHidden` + beforeunload keepalive 改为调用引擎；cloudSyncHandler 把 `keepalive` 透传 `saveCloudState` |
| `src/data/store.test.js` | 新增：silent + 分歧→不调用上传 handler 的用例；keepalive 参数透传 |

---

## 方案 C — 采纳云端前落档（解决 L4）

### 数据模型

新增独立存储区 `ysp_adopt_before`（localStorage），与普通操作日志隔离，**不参与 500 条截断**（三问之2确认：这是唯一还原依据，被普通操作挤掉等于白做）。

```js
// 存储结构（按时间追加）
{
  adopts: [
    {
      adoptId,              // 唯一，用于与 operationLogs 关联
      time,                 // ISO，落档时刻
      slot,                 // 被采纳的槽位名
      before: {             // 采纳前本地该槽位的完整内容
        items: [...] | calc: {} | ...,
      },
      beforeRev,            // 采纳前本地 _rev[slot]
      cloudRev,             // 采纳时云端 _rev[slot]
    },
    ...
  ],
  // 截断策略：按天数保留（默认 365 天），add 时清理过期
}
```

### 落档点：单点汇聚

所有「采纳云端」最终都汇聚到 `applyCloudDataToStore(payload, options)`（App.vue:518）。由 `performSyncDecision` 传给它的 `options` 中携带 `decisionSlots`（本次被采纳的槽位列表，来自 plan 的 adopt-cloud + 冲突弹窗选了云端的槽位）。落档在此单点完成：

```
applyCloudDataToStore(payload, { decisionSlots })
  对每个 decisionSlots 里的 slot：
    before = exportData() 中该槽位当前内容（loadData 之前抓取）
    写入 ysp_adopt_before，生成 adoptId
  同时记一条 operationLog('cloud_adopt_before', ..., { adoptId, slot, time, cloudRev })
  然后照常 loadData(payload) + save
```

**关键顺序问题**：`exportData()` 必须在 `loadData(payload)` **之前**抓取，否则抓到的已是云端内容。

### 与 operationLogs 的关系

- 普通 `cloud_sync` 日志保持现状（截断 500 可接受，属一般留痕）
- `cloud_adopt_before` 作为**关联索引**写入 operationLogs 用于展示，完整 before 数据只在 `ysp_adopt_before` 区
- `LOG_REPLAY_CAPABILITY['cloud_adopt_before'] = FULL`（E 方案回溯时消费）

### 兼容

- 无 `ysp_adopt_before` 数据 / 旧日志 → 回溯退化为现有能力（跳过 no-before 的 cloud_sync）
- 新方案启用后新产生的采纳才有 before；历史采纳不可追溯（接受，审计报告已注明）

### 改动文件

| 文件 | 改动 |
|---|---|
| 新建 `src/data/adoptLog.js` | `appendAdoptBefore` / `listAdoptBefore` / `getAdoptBeforeById` / `pruneAdoptBefore(365d)`，localStorage 读写 + 纯函数 |
| 新建 `src/data/adoptLog.test.js` | 追加/按 id 取/过期清理/上限 |
| `src/data/logReplay.js` | `cloud_adopt_before` 标 FULL + 逆操作 handler（从 adoptLog 取 before 还原单槽位） |
| `src/App.vue` | `applyCloudDataToStore` 落档；`logReplay` 相关接入 |

---

## 方案 D — 导入防护（P0）

### 改动

`handleImport`（App.vue:757-775）加入：

1. **二次确认**：`confirm('导入将覆盖当前全部数据，是否继续？')` —— 取消即中止
2. **导入前快照**：确认后、`loadData` 前，把当前 `exportData()` 写入 `ysp_adopt_before` 区（新增类型 `slot: '__full_import__'`），并记 `operationLog('app_import' , ..., { snapshotAdoptId })`
3. 跳过去抖同步（已有 `setCloudSyncSuppressed` 流程保持不动）

### 改动文件

| 文件 | 改动 |
|---|---|
| `src/App.vue` | `handleImport` 确认框 + 快照落档 |
| `src/data/adoptLog.js` | 复用（`__full_import__` 槽位约定） |

---

## 方案 E — 回溯到时间点 UI（P2，依赖 C）

### 修正 `logReplay.js:384` 的 BARRIER 失效问题

现状：BARRIER 靠正则 `/下载|选择使用云端数据/` 匹配 `cloud_sync` message，但 C2 后的 message 是 `'同步完成'`/`'云端槽位损坏/缺失…'`，正则不再命中 → 云端覆盖类日志退化为 `no_inverse_handler` 静默跳过。

修复：把"云端采纳"从靠 message 正则猜，改为靠 **C 方案落档的结构化证据**判定：

- 采纳发生时由 `applyCloudDataToStore`（C 方案的单点落档）写 `ysp_adopt_before.before` 完整内容 + 记一条 `cloud_adopt_before` 日志（`detail={ adoptId, slot, beforeRev, cloudRev }`）
- `LOG_REPLAY_CAPABILITY['cloud_adopt_before'] = FULL`：逆播放时按 `adoptId` 取 `ysp_adopt_before.before` 还原该槽位
- 旧日志（无 `adoptId`、before 区无数据）的 `cloud_sync` → 维持 NOOP 跳过（接受不可逆）
- 真正的 BARRIER 只保留整包替换类：`app_import` / `app_undo` / `app_redo`（`cloud_pull` 显式全量拉取保留 BARRIER 语义）

### 回溯界面（设置页入口）

- 入口：设置页新增"数据回溯"区块
- 时间轴：从 operationLogs 提取 `cloud_adopt_before` + 业务变更日志，按时间倒序
- 粒度（已确认）：**字段级 diff 摘要**，不做全量 JSON 预览——按槽位/记录列出"新增/删除/改动了哪几条"，复用现有 `computeConflictDiff` / `getLogDetailSections` 展示组件
- 选一个时间点 → 展示该时点快照的差异摘要（"从此往后有 N 条业务变更 / 1 次云端采纳"）
- **恢复到此状态**按钮 → 走 `reconstructAtTime(currentState, logs, targetTime)`（已在 logReplay.js:355 实现）+ 合并 `ysp_adopt_before` 覆盖的槽位 → 得到目标 state → 经 `applyCloudDataToStore` 正常写入（**不用绕过守卫的裸 loadData**）→ 记 `operationLog('app_history_restore', ...)` 维持闭环
- 只读预览：恢复前不写任何东西

### 改动文件

| 文件 | 改动 |
|---|---|
| `src/data/logReplay.js` | BARRIER 判定修正；`cloud_adopt_before` inverse 消费 `ysp_adopt_before` |
| `src/data/logReplay.test.js` | 新增修正则、采纳逆操作用例 |
| 新建 `src/modules/settings/HistoryRestoreModule.vue`（或并入现有设置笔头） | 时间轴 + 差异摘要 + 恢复 |
| `src/App.vue` | 路由/模块挂载 | （待 writing-plans 细化） |

---

## 数据流全景

```
[双标签页]                    
TabA(active) ──心跳 touch──┐
TabB(locked) ◄─遮挡 pointer-events ────┐
                                   LocalStorage ysp_tab
[跨设备]
Device1 ──► performSyncDecision（安全，fetch→merge→upload）──► 云端
Device2 ──► performSyncDecision({ silent:true })（分歧→跳过）   ──► 云端
                                            │
[采纳前 C]                                  
  performSyncDecision / 冲突弹窗选云端
        │ decisionSlots
        ▼
  appendAdoptBefore(ysp_adopt_before)  // before 完整槽位 + beforeRev
        ▼
  operationLog('cloud_adopt_before', {adoptId,...})
        ▼
  applyCloudDataToStore(payload) ──► loadData + save
```

## 错误处理

| 场景 | 行为 |
|---|---|
| `ysp_adopt_before` 写入失败（localStorage 满） | 记 operationLog 警告，不阻断采纳（兜底降级：放弃该次 before，仍完成采纳） |
| 盲写校验 fetch 超时 | 保守放弃盲写（不发），留待启动检测 |
| 恢复回溯目标时间被 BARRIER（import/undo/清理）阻挡 | UI 显示"该时点不可精确还原"，列出最接近可还原时点 |
| `reconstructAtTime` 遇无 before 的旧采纳 | 跳过该条（维持不可逆），diff 摘要标注"该时段含无快照采纳" |

## 测试计划

| 文件 | 用例 |
|---|---|
| `tabLease.test.js` | `shouldHoldLock`：同 tab / TTL 过期 / 空 / touch 大小 / 边界 now |
| `adoptLog.test.js` | append / byId / prune365 / 满容降级 |
| `logReplay.test.js` | `cloud_adopt_before` FULL 逆操作（按 adoptId 还原槽位）；无 before 旧日记跳过；BARRIER 保留 |
| `store.test.js` / 集成 | silent+分歧→不调用上传 handler；keepalive 透传；`applyCloudDataToStore` 落档顺序（before 先于 loadData） |

## 验收标准

1. 打开两个 tab 编辑同一表单 → 仅 active 可输入，另一个被遮罩；点击遮罩可抢锁
2. 手机开旧缓存 + 电脑改数据后，手机切走页面 → 云端不被回滚；手机重新打开 → 正常冲突检测
3. 冲突弹窗采纳云端后，`ysp_adopt_before` 有完整 before；回溯该时点前可还原该槽位
4. 导入无确认框不放行；导入后可通过回溯还原到导入前
5. 现有 139+ 用例全绿；`npm run build` 通过
6. Supabase / RLS / 手机页 / `car` 行零改动

## 实施顺序（已确认 D→C→B→A→E）

| 阶段 | 任务 | 依赖 |
|---|---|---|
| P0 | D 导入防护 + C 落档机制 | 无 |
| P1 | B 盲写路径校验 | 无 |
| P1 | A Tab 真实租约锁 | 无 |
| P2 | E 回溯 UI | C（before 数据） |