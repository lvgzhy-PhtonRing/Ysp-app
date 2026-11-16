-- 在 YSP 所在项目执行。只约束 ysp_state 的 main 行。
begin;

do $$
begin
  if exists (select 1 from public.ysp_state where id = 'main' and owner_id is null) then
    raise exception 'YSP main has no owner. Set the correct owner before running this migration.';
  end if;
end;
$$;

alter table public.ysp_state enable row level security;

drop policy if exists ysp_main_owner_select on public.ysp_state;
create policy ysp_main_owner_select on public.ysp_state
  for select to authenticated
  using (id = 'main' and owner_id = (select auth.uid()));

drop policy if exists ysp_main_restrict_select on public.ysp_state;
create policy ysp_main_restrict_select on public.ysp_state
  as restrictive for select to public
  using (id is distinct from 'main' or owner_id = (select auth.uid()));

drop policy if exists ysp_main_restrict_insert on public.ysp_state;
create policy ysp_main_restrict_insert on public.ysp_state
  as restrictive for insert to public
  with check (id is distinct from 'main' or owner_id = (select auth.uid()));

drop policy if exists ysp_main_restrict_update on public.ysp_state;
create policy ysp_main_restrict_update on public.ysp_state
  as restrictive for update to public
  using (id is distinct from 'main' or owner_id = (select auth.uid()))
  with check (id is distinct from 'main' or owner_id = (select auth.uid()));

create or replace function public.ysp_keep_main_private()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id = 'main' then
    new.is_public := false;
  end if;
  return new;
end;
$$;

drop trigger if exists ysp_keep_main_private on public.ysp_state;
create trigger ysp_keep_main_private
  before insert or update on public.ysp_state
  for each row execute function public.ysp_keep_main_private();

-- 现有 revision 保护要求更新时递增一版。这里不改 payload。
update public.ysp_state
set is_public = false, revision = revision + 1
where id = 'main' and is_public is distinct from false;

commit;

select id, is_public, revision from public.ysp_state where id = 'main';
