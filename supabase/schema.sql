-- 公司开票信息管理工具 v1.4：全新项目数据库脚本
-- 已有项目请优先执行 migration-v1.4.sql，不要删除已有数据表。

create extension if not exists pgcrypto;

create table if not exists public.invoice_companies (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  tax_no text not null,
  address text not null,
  phone text,
  bank_name text not null,
  bank_account text not null,
  remark text,
  version bigint not null default 1,
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists invoice_companies_company_name_idx on public.invoice_companies (company_name);
create index if not exists invoice_companies_tax_no_idx on public.invoice_companies (tax_no);
create index if not exists invoice_companies_updated_at_idx on public.invoice_companies (updated_at desc);
create index if not exists invoice_companies_deleted_at_idx on public.invoice_companies (deleted_at);

create or replace function public.set_invoice_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists invoice_companies_set_updated_at on public.invoice_companies;
create trigger invoice_companies_set_updated_at
before update on public.invoice_companies
for each row execute function public.set_invoice_updated_at();

create table if not exists public.invoice_company_audit (
  id bigint generated always as identity primary key,
  company_id uuid references public.invoice_companies(id) on delete set null,
  action text not null check (action in ('create','update','delete','restore','import')),
  actor text,
  snapshot jsonb,
  created_at timestamptz not null default now()
);
create index if not exists invoice_company_audit_company_idx on public.invoice_company_audit (company_id, created_at desc);

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
create index if not exists invoice_members_active_idx on public.invoice_members (active);
create index if not exists invoice_members_last_login_idx on public.invoice_members (last_login_at desc);
drop trigger if exists invoice_members_set_updated_at on public.invoice_members;
create trigger invoice_members_set_updated_at
before update on public.invoice_members
for each row execute function public.set_invoice_updated_at();

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
create index if not exists invoice_access_logs_created_idx on public.invoice_access_logs (created_at desc);
create index if not exists invoice_access_logs_member_idx on public.invoice_access_logs (member_id, created_at desc);
create index if not exists invoice_access_logs_company_idx on public.invoice_access_logs (company_id, created_at desc);

alter table public.invoice_companies enable row level security;
alter table public.invoice_company_audit enable row level security;
alter table public.invoice_members enable row level security;
alter table public.invoice_access_logs enable row level security;

revoke all on table public.invoice_companies from anon, authenticated;
revoke all on table public.invoice_company_audit from anon, authenticated;
revoke all on table public.invoice_members from anon, authenticated;
revoke all on table public.invoice_access_logs from anon, authenticated;

grant all on table public.invoice_companies to service_role;
grant all on table public.invoice_company_audit to service_role;
grant all on table public.invoice_members to service_role;
grant all on table public.invoice_access_logs to service_role;
grant usage, select on all sequences in schema public to service_role;
