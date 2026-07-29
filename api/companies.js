import { requireSession } from "../lib/auth.js";
import { toClient, toDatabase, validUuid, validateCompany } from "../lib/company.js";
import { handleError, HttpError, json, methodNotAllowed, readJson } from "../lib/http.js";
import { supabase, writeAudit } from "../lib/supabase.js";

const selectFields = "id,company_name,tax_no,address,phone,bank_name,bank_account,remark,version,created_at,updated_at,deleted_at,created_by,updated_by";

export default {
  async fetch(request) {
    try {
      const session = requireSession(request);
      const url = new URL(request.url);

      if (request.method === "GET") {
        const deleted = url.searchParams.get("deleted") === "1";
        const query = new URLSearchParams({
          select: selectFields,
          deleted_at: deleted ? "not.is.null" : "is.null",
          order: "updated_at.desc",
        });
        const rows = await supabase(`invoice_companies?${query}`);
        return json({ records: (rows || []).map(toClient), serverTime: new Date().toISOString() });
      }

      if (request.method === "POST") {
        const body = await readJson(request);
        const item = validateCompany(body);
        const payload = { ...toDatabase(item), created_by: session.actor, updated_by: session.actor };
        const rows = await supabase("invoice_companies", {
          method: "POST",
          headers: { prefer: "return=representation" },
          body: [payload],
        });
        const record = toClient(rows[0]);
        await writeAudit({ companyId: record.id, action: "create", actor: session.actor, snapshot: rows[0] });
        return json({ record }, 201);
      }

      if (request.method === "PATCH") {
        const body = await readJson(request);
        if (!validUuid(body.id)) throw new HttpError(400, "记录编号无效");
        const version = Number(body.version);
        if (!Number.isInteger(version) || version < 1) throw new HttpError(400, "记录版本无效");

        if (body.action === "restore") {
          const query = new URLSearchParams({ id: `eq.${body.id}`, version: `eq.${version}`, deleted_at: "not.is.null" });
          const rows = await supabase(`invoice_companies?${query}`, {
            method: "PATCH",
            headers: { prefer: "return=representation" },
            body: { deleted_at: null, version: version + 1, updated_by: session.actor },
          });
          if (!rows?.length) throw new HttpError(409, "记录已被其他成员修改，请刷新后重试");
          await writeAudit({ companyId: body.id, action: "restore", actor: session.actor, snapshot: rows[0] });
          return json({ record: toClient(rows[0]) });
        }

        const item = validateCompany(body);
        const query = new URLSearchParams({ id: `eq.${body.id}`, version: `eq.${version}`, deleted_at: "is.null" });
        const rows = await supabase(`invoice_companies?${query}`, {
          method: "PATCH",
          headers: { prefer: "return=representation" },
          body: { ...toDatabase(item), version: version + 1, updated_by: session.actor },
        });
        if (!rows?.length) throw new HttpError(409, "该公司信息已被其他成员更新，请刷新后重新编辑");
        await writeAudit({ companyId: body.id, action: "update", actor: session.actor, snapshot: rows[0] });
        return json({ record: toClient(rows[0]) });
      }

      if (request.method === "DELETE") {
        const body = await readJson(request, 30_000);
        if (!validUuid(body.id)) throw new HttpError(400, "记录编号无效");
        const version = Number(body.version);
        const query = new URLSearchParams({ id: `eq.${body.id}`, version: `eq.${version}`, deleted_at: "is.null" });
        const rows = await supabase(`invoice_companies?${query}`, {
          method: "PATCH",
          headers: { prefer: "return=representation" },
          body: { deleted_at: new Date().toISOString(), version: version + 1, updated_by: session.actor },
        });
        if (!rows?.length) throw new HttpError(409, "该记录已发生变化，请刷新后重试");
        await writeAudit({ companyId: body.id, action: "delete", actor: session.actor, snapshot: rows[0] });
        return json({ ok: true });
      }

      return methodNotAllowed(["GET", "POST", "PATCH", "DELETE"]);
    } catch (error) {
      return handleError(error);
    }
  },
};
