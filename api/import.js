import { requireAdmin } from "../lib/auth.js";
import { toDatabase, validateCompany } from "../lib/company.js";
import { handleError, HttpError, json, methodNotAllowed, readJson } from "../lib/http.js";
import { supabase } from "../lib/supabase.js";

export default {
  async fetch(request) {
    try {
      const session = requireAdmin(request);
      if (request.method !== "POST") return methodNotAllowed(["POST"]);
      const body = await readJson(request, 4_000_000);
      const source = Array.isArray(body) ? body : body.records;
      if (!Array.isArray(source)) throw new HttpError(400, "备份文件中没有可导入的数据");
      if (source.length > 5000) throw new HttpError(400, "单次最多导入 5000 家公司");
      const now = new Date().toISOString();
      const rows = source.map((raw) => {
        const item = validateCompany(raw);
        return {
          ...toDatabase(item),
          deleted_at: raw.deletedAt || raw.deleted_at || null,
          created_by: raw.createdBy || raw.created_by || session.actor,
          updated_by: session.actor,
          updated_at: now,
        };
      });
      if (!rows.length) return json({ imported: 0 });
      await supabase("invoice_companies?on_conflict=tax_no", {
        method: "POST",
        headers: { prefer: "resolution=merge-duplicates,return=minimal" },
        body: rows,
      });
      return json({ imported: rows.length });
    } catch (error) {
      return handleError(error);
    }
  },
};
