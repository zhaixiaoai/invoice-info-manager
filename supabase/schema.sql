-- 公司开票信息管理工具：首次部署数据库脚本
-- 本脚本可重复执行；后续升级请只做增量修改，不要删除 invoice_companies 表。

create extension if not exists pgcrypto;

create table if not exists public.invoice_companies (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  tax_no text not null unique,
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

create index if not exists invoice_companies_company_name_idx
  on public.invoice_companies using btree (company_name);
create index if not exists invoice_companies_updated_at_idx
  on public.invoice_companies using btree (updated_at desc);
create index if not exists invoice_companies_deleted_at_idx
  on public.invoice_companies using btree (deleted_at);

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

create index if not exists invoice_company_audit_company_idx
  on public.invoice_company_audit (company_id, created_at desc);

-- 浏览器不直接访问数据库。所有数据操作都由 Vercel 后端函数使用 Secret key 完成。
alter table public.invoice_companies enable row level security;
alter table public.invoice_company_audit enable row level security;

revoke all on table public.invoice_companies from anon, authenticated;
revoke all on table public.invoice_company_audit from anon, authenticated;

grant all on table public.invoice_companies to service_role;
grant all on table public.invoice_company_audit to service_role;
grant usage, select on all sequences in schema public to service_role;
