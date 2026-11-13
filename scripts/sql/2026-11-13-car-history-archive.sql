-- 独立的 car 历史档案：每个登录用户最多一份，只允许新增和读取。
begin;

create table if not exists public.ysp_car_history_archive (
  owner_id uuid primary key references auth.users(id),
  payload jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.ysp_car_history_archive enable row level security;
revoke all on public.ysp_car_history_archive from public, anon, authenticated;
grant select, insert on public.ysp_car_history_archive to authenticated;

drop policy if exists "car_archive_owner_select" on public.ysp_car_history_archive;
create policy "car_archive_owner_select" on public.ysp_car_history_archive
  for select to authenticated using (owner_id = auth.uid());

drop policy if exists "car_archive_owner_insert" on public.ysp_car_history_archive;
create policy "car_archive_owner_insert" on public.ysp_car_history_archive
  for insert to authenticated with check (owner_id = auth.uid());

drop policy if exists "car_archive_restrict_owner_select" on public.ysp_car_history_archive;
create policy "car_archive_restrict_owner_select" on public.ysp_car_history_archive
  as restrictive for select to authenticated using (owner_id = auth.uid());

drop policy if exists "car_archive_restrict_owner_insert" on public.ysp_car_history_archive;
create policy "car_archive_restrict_owner_insert" on public.ysp_car_history_archive
  as restrictive for insert to authenticated with check (owner_id = auth.uid());

commit;
