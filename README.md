# YSP App (Vue + Vite)

YSP 玩具管理系统，支持本地存储快照与 Supabase 云端同步。

## 开发

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
```

## 云端同步（Supabase）

当前实现为“云端快照”模式：

- 主程序写入 `ysp_state.payload`（整份 JSON）
- 手机查询页读取同一份 `payload`
- 主程序仍保留 `localStorage` 作为离线兜底

### 1) 创建数据表

在 Supabase SQL Editor 执行：

```sql
create table if not exists public.ysp_state (
  id text primary key,
  owner_id uuid references auth.users(id),
  is_public boolean not null default true,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  revision bigint not null default 0
);

alter table public.ysp_state enable row level security;
```

部署需要 `revision` 的新版客户端之前，须先在 Supabase SQL Editor 执行 [`scripts/sql/2026-10-24-ysp-main-revision.sql`](scripts/sql/2026-10-24-ysp-main-revision.sql)。触发器会拒绝旧版客户端写入 `main`，不影响 `car` 行。

### 2) RLS 策略

```sql
-- 匿名可读公开数据
create policy "ysp_state_public_select"
on public.ysp_state
for select
using (is_public = true);

-- 登录用户可读自己的数据
create policy "ysp_state_owner_select"
on public.ysp_state
for select
to authenticated
using (owner_id = auth.uid());

-- 登录用户可写自己的数据
create policy "ysp_state_owner_insert"
on public.ysp_state
for insert
to authenticated
with check (owner_id = auth.uid());

create policy "ysp_state_owner_update"
on public.ysp_state
for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());
```

### 3) 初始化一条状态行

先在主程序云端登录后点一次“立即同步”即可自动创建；
或者手动插入：

```sql
insert into public.ysp_state (id, owner_id, is_public, payload)
values ('main', '<your-auth-user-id>', true, '{}'::jsonb)
on conflict (id) do nothing;
```

### 4) 前端配置方式

支持两种方式（任选其一）：

1. 环境变量（推荐给主程序构建）

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_SUPABASE_STATE_ID=main
VITE_SUPABASE_ENABLED=true
VITE_SUPABASE_PUBLIC_READ=true
```

2. 静态配置文件（给手机页自动读取）

- 编辑 `public/cloud-config.json`
- 参考 `public/cloud-config.example.json`

> 注意：只能放 `anon key`，不要放 `service_role key`。

> `main` 行 `payload` 内含 `_rev`（每数据集合独立版本号）。两设备各改不同集合可自动合并；仅当双方都改同一集合时弹逐槽位冲突框。

## 页面说明

- 主程序：`/`（`index.html`）
- 手机查询页：`/ysp-remote.html`
- 兜底静态数据：`/a.json`

手机查询页读取 `cloud-config.json` 中配置的 `main` 主账本。主账本为私有数据，需使用主程序云端账号登录；页面只读取数据，不提供写入功能。
- 手机查询页默认 Owner 为 Papa；Owner 相关页面随 Papa/Payton 切换，销售页另有“当前 Owner / 全部 Owner”范围，商品查询与批次回款统计按主程序跨 Owner 展示。
- 首页支付宝余额使用主程序相同口径，并从 `main` 快照的 Payton 资金注册表读取零钱、投资与贷款余额。
- 首页现金流与负债监控按所选 Owner、开业日期和月末快照显示；切到 Payton 后财务入口显示只读皮蛋金库。
- 登录令牌仅保存在当前标签页的 `sessionStorage`，关闭标签页后需重新登录。可使用页面顶部“刷新”读取最新云端数据，“退出”清除本标签页会话。
- 手机页需通过 HTTPS 或本地开发服务器访问，并正确配置 Supabase Auth 与 `main` 行的已登录用户读取权限。
