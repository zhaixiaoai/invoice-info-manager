import { requireAdmin } from "../lib/auth.js";
import { validUuid } from "../lib/company.js";
import { handleError, HttpError, json, methodNotAllowed, readJson } from "../lib/http.js";
import { supabase } from "../lib/supabase.js";

const companyFields = "id,company_name,tax_no,address,bank_name,bank_account,updated_at";

async function getMember(memberId) {
  const query = new URLSearchParams({
    select: "id,username,display_name,active,access_all",
    id: `eq.${memberId}`,
    limit: "1",
  });
  const rows = await supabase(`invoice_members?${query}`);
  return rows?.[0] || null;
}

function cleanCompanyIds(value) {
  if (!Array.isArray(value)) return [];
  const ids = [...new Set(value.map((item) => String(item || "").trim()).filter(Boolean))];
  if (ids.length > 5000) throw new HttpError(400, "一次最多设置 5000 家公司的查看权限");
  if (ids.some((id) => !validUuid(id))) throw new HttpError(400, "公司权限数据中包含无效编号");
  return ids;
}

export default {
  async fetch(request) {
    try {
      const session = await requireAdmin(request);
      const url = new URL(request.url);

      if (request.method === "GET") {
        const memberId = url.searchParams.get("memberId") || "";
        if (!validUuid(memberId)) throw new HttpError(400, "成员编号无效");
        const member = await getMember(memberId);
        if (!member) throw new HttpError(404, "未找到该成员账号");

        const companyQuery = new URLSearchParams({
          select: companyFields,
          deleted_at: "is.null",
          order: "company_name.asc",
        });
        const accessQuery = new URLSearchParams({
          select: "company_id",
          member_id: `eq.${memberId}`,
        });
        const [companies, accessRows] = await Promise.all([
          supabase(`invoice_companies?${companyQuery}`),
          supabase(`invoice_member_company_access?${accessQuery}`),
        ]);
        const activeIds = new Set((companies || []).map((company) => company.id));
        const allowedIds = (accessRows || [])
          .map((row) => row.company_id)
          .filter((id) => activeIds.has(id));

        return json({
          member: {
            id: member.id,
            username: member.username,
            displayName: member.display_name,
            active: Boolean(member.active),
          },
          accessAll: Boolean(member.access_all),
          allowedIds,
          companies: (companies || []).map((company) => ({
            id: company.id,
            companyName: company.company_name,
            taxNo: company.tax_no,
            address: company.address,
            bankName: company.bank_name,
            bankAccount: company.bank_account,
            updatedAt: company.updated_at,
          })),
        });
      }

      if (request.method === "PATCH") {
        const body = await readJson(request, 200_000);
        const memberId = String(body.memberId || "");
        if (!validUuid(memberId)) throw new HttpError(400, "成员编号无效");
        const member = await getMember(memberId);
        if (!member) throw new HttpError(404, "未找到该成员账号");

        const accessAll = Boolean(body.accessAll);
        const companyIds = accessAll ? [] : cleanCompanyIds(body.companyIds);
        await supabase("rpc/set_invoice_member_permissions", {
          method: "POST",
          headers: { prefer: "return=minimal" },
          body: {
            p_member_id: memberId,
            p_access_all: accessAll,
            p_company_ids: companyIds,
            p_actor: session.actor,
          },
        });

        return json({
          ok: true,
          accessAll,
          permissionCount: accessAll ? null : companyIds.length,
        });
      }

      return methodNotAllowed(["GET", "PATCH"]);
    } catch (error) {
      return handleError(error);
    }
  },
};
