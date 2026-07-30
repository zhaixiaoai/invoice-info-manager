import { requireAdmin, requireSession } from "../lib/auth.js";
import { validUuid } from "../lib/company.js";
import { handleError, HttpError, json, methodNotAllowed, readJson } from "../lib/http.js";
import { supabase, writeAccessLog } from "../lib/supabase.js";

export default {
  async fetch(request) {
    try {
      if (request.method === "GET") {
        await requireAdmin(request);
        const url = new URL(request.url);
        const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 300), 1), 1000);
        const query = new URLSearchParams({
          select: "id,actor,role,event_type,company_id,company_name,created_at",
          order: "created_at.desc",
          limit: String(limit),
        });
        const logs = await supabase(`invoice_access_logs?${query}`);
        return json({ logs: logs || [] });
      }

      if (request.method === "POST") {
        const session = await requireSession(request);
        const body = await readJson(request, 20_000);
        if (!new Set(["view", "copy"]).has(body.eventType)) throw new HttpError(400, "访问记录类型无效");
        if (!validUuid(body.companyId)) throw new HttpError(400, "公司记录编号无效");

        const query = new URLSearchParams({
          select: "id,company_name",
          id: `eq.${body.companyId}`,
          deleted_at: "is.null",
          limit: "1",
        });
        const rows = await supabase(`invoice_companies?${query}`);
        const company = rows?.[0];
        if (!company) throw new HttpError(404, "该公司信息不存在或已被删除");
        await writeAccessLog({
          session,
          eventType: body.eventType,
          companyId: company.id,
          companyName: company.company_name,
        });
        return json({ ok: true });
      }

      return methodNotAllowed(["GET", "POST"]);
    } catch (error) {
      return handleError(error);
    }
  },
};
