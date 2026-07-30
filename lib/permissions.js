import { HttpError } from "./http.js";
import { supabase } from "./supabase.js";

export async function allowedCompanyIds(session) {
  if (!session || session.role === "admin" || session.accessAll) return null;
  const query = new URLSearchParams({
    select: "company_id",
    member_id: `eq.${session.memberId}`,
  });
  const rows = await supabase(`invoice_member_company_access?${query}`);
  return [...new Set((rows || []).map((row) => row.company_id).filter(Boolean))];
}

export async function canAccessCompany(session, companyId) {
  if (!session) return false;
  if (session.role === "admin" || session.accessAll) return true;
  const query = new URLSearchParams({
    select: "company_id",
    member_id: `eq.${session.memberId}`,
    company_id: `eq.${companyId}`,
    limit: "1",
  });
  const rows = await supabase(`invoice_member_company_access?${query}`);
  return Boolean(rows?.length);
}

export async function assertCompanyAccess(session, companyId) {
  if (!(await canAccessCompany(session, companyId))) {
    throw new HttpError(403, "当前账号没有查看这家公司的权限");
  }
}
