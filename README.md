# YSP App (Vue + Vite)

YSP 玩具管理系统，支持本地存储、WebDAV 备份、Supabase 云端同步。

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
  updated_at timestamptz not null default now()
);

alter table public.ysp_state enable row level security;
```

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

## 页面说明

- 主程序：`/`（`index.html`）
- 手机查询页：`/ysp-remote.html`
- 兜底静态数据：`/a.json`

手机查询页会优先尝试从 `cloud-config.json` 指向的 Supabase 读取；失败后自动回退到 URL 输入框里的 JSON 地址。
