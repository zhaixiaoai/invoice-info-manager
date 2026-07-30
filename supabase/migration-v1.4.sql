-- v1.4 升级脚本：允许同税号多条记录、增加成员账号和访问记录
-- 可重复执行，不会删除现有开票信息。

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

-- 1. 取消“税号全局唯一”。只有所有字段完全相同才由应用层阻止重复保存。
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

-- 2. 每位共享成员使用独立账号和独立口令。
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

create index if not exists invoice_members_active_idx
  on public.invoice_members (active);
create index if not exists invoice_members_last_login_idx
  on public.invoice_members (last_login_at desc);

drop trigger if exists invoice_members_set_updated_at on public.invoice_members;
create trigger invoice_members_set_updated_at
before update on public.invoice_members
for each row execute function public.set_invoice_updated_at();

-- 3. 记录登录、查看和复制操作。只记录成员、时间、动作和公司，不记录口令。
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

alter table public.invoice_members enable row level security;
alter table public.invoice_access_logs enable row level security;

revoke all on table public.invoice_members from anon, authenticated;
revoke all on table public.invoice_access_logs from anon, authenticated;

grant all on table public.invoice_members to service_role;
grant all on table public.invoice_access_logs to service_role;
grant usage, select on all sequences in schema public to service_role;
