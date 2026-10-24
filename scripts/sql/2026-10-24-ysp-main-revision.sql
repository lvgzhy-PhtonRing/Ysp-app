-- 发布对应的 YSP 客户端前，先在 Supabase SQL Editor 执行。
-- 只约束 main 行；car 行及其旧写入程序不变。
begin;

alter table public.ysp_state
  add column if not exists revision bigint not null default 0;
alter table public.ysp_state alter column revision set default 0;
update public.ysp_state set revision = 0 where revision is null;
alter table public.ysp_state alter column revision set not null;

create or replace function public.ysp_guard_main_revision()
returns trigger
language plpgsql
as $$
begin
  if old.id = 'main' then
    if new.revision is distinct from old.revision + 1 then
      raise exception 'YSP main revision must increase by one'
        using errcode = '40001';
    end if;
    new.updated_at := clock_timestamp();
  end if;
  return new;
end;
$$;

drop trigger if exists ysp_guard_main_revision on public.ysp_state;
create trigger ysp_guard_main_revision
before update on public.ysp_state
for each row execute function public.ysp_guard_main_revision();

commit;

select id, revision from public.ysp_state where id in ('main', 'car') order by id;
