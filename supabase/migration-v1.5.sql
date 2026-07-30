-- v1.5 累计升级脚本
-- 功能：允许同税号不同内容、独立成员账号、访问记录、按成员限制可查看的公司。
-- 可重复执行；无论 v1.4 是否已执行，都可以直接运行本脚本。
-- 不会删除现有开票信息。

create extension if not exists pgcrypto;

create or replace function public.set_invoice_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 1. 取消“税号全局唯一”。所有字段完全相同时由应用层阻止重复保存。
do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'invoice_companies'
      and c.contype = 'u'
      and pg_get_constraintdef(c.oid) ilike '%(tax_no)%'
  loop
    execute format('alter table public.invoice_companies drop constraint %I', constraint_row.conname);
  end loop;
end $$;

create index if not exists invoice_companies_tax_no_idx
  on public.invoice_companies using btree (tax_no);

-- 2. 独立成员账号。
create table if not exists public.invoice_members (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  username_key text not null unique,
  display_name text not null,
  password_salt text not null,
  password_hash text not null,
  active boolean not null default true,
  session_version bigint not null default 1,
  last_login_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.invoice_members
  add column if not exists access_all boolean not null default true;

create index if not exists invoice_members_active_idx
  on public.invoice_members (active);
create index if not exists invoice_members_last_login_idx
  on public.invoice_members (last_login_at desc);

drop trigger if exists invoice_members_set_updated_at on public.invoice_members;
create trigger invoice_members_set_updated_at
before update on public.invoice_members
for each row execute function public.set_invoice_updated_at();

-- 3. 登录、查看和复制记录。
create table if not exists public.invoice_access_logs (
  id bigint generated always as identity primary key,
  member_id uuid references public.invoice_members(id) on delete set null,
  actor text not null,
  role text not null check (role in ('admin','viewer')),
  event_type text not null check (event_type in ('login','view','copy')),
  company_id uuid references public.invoice_companies(id) on delete set null,
  company_name text,
  created_at timestamptz not null default now()
);

create index if not exists invoice_access_logs_created_idx
  on public.invoice_access_logs (created_at desc);
create index if not exists invoice_access_logs_member_idx
  on public.invoice_access_logs (member_id, created_at desc);
create index if not exists invoice_access_logs_company_idx
  on public.invoice_access_logs (company_id, created_at desc);

-- 4. 指定成员可查看哪些公司。access_all=true 时忽略本表并可看全部公司。
create table if not exists public.invoice_member_company_access (
  member_id uuid not null references public.invoice_members(id) on delete cascade,
  company_id uuid not null references public.invoice_companies(id) on delete cascade,
  created_by text,
  created_at timestamptz not null default now(),
  primary key (member_id, company_id)
);

create index if not exists invoice_member_company_access_company_idx
  on public.invoice_member_company_access (company_id, member_id);

-- 原子更新成员查看权限，避免保存过程中出现一半成功、一半失败。
create or replace function public.set_invoice_member_permissions(
  p_member_id uuid,
  p_access_all boolean,
  p_company_ids uuid[],
  p_actor text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.invoice_members where id = p_member_id) then
    raise exception '成员不存在';
  end if;

  update public.invoice_members
  set access_all = coalesce(p_access_all, false)
  where id = p_member_id;

  delete from public.invoice_member_company_access
  where member_id = p_member_id;

  if not coalesce(p_access_all, false) then
    insert into public.invoice_member_company_access (member_id, company_id, created_by)
    select p_member_id, c.id, left(coalesce(p_actor, ''), 30)
    from public.invoice_companies c
    where c.deleted_at is null
      and c.id = any(coalesce(p_company_ids, array[]::uuid[]))
    on conflict (member_id, company_id) do nothing;
  end if;
end;
$$;

revoke all on function public.set_invoice_member_permissions(uuid, boolean, uuid[], text) from public, anon, authenticated;
grant execute on function public.set_invoice_member_permissions(uuid, boolean, uuid[], text) to service_role;

alter table public.invoice_members enable row level security;
alter table public.invoice_access_logs enable row level security;
alter table public.invoice_member_company_access enable row level security;

revoke all on table public.invoice_members from anon, authenticated;
revoke all on table public.invoice_access_logs from anon, authenticated;
revoke all on table public.invoice_member_company_access from anon, authenticated;

grant all on table public.invoice_members to service_role;
grant all on table public.invoice_access_logs to service_role;
grant all on table public.invoice_member_company_access to service_role;
grant usage, select on all sequences in schema public to service_role;
