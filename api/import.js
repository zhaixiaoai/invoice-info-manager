import { requireAdmin } from "../lib/auth.js";
import { companyFingerprint, toDatabase, validateCompany } from "../lib/company.js";
import { handleError, HttpError, json, methodNotAllowed, readJson } from "../lib/http.js";
import { supabase } from "../lib/supabase.js";

export default {
  async fetch(request) {
    try {
      const session = await requireAdmin(request);
      if (request.method !== "POST") return methodNotAllowed(["POST"]);
      const body = await readJson(request, 4_000_000);
      const source = Array.isArray(body) ? body : body.records;
      if (!Array.isArray(source)) throw new HttpError(400, "备份文件中没有可导入的数据");
      if (source.length > 5000) throw new HttpError(400, "单次最多导入 5000 家公司");

      const existing = await supabase("invoice_companies?select=company_name,tax_no,address,phone,bank_name,bank_account,remark");
      const fingerprints = new Set((existing || []).map(companyFingerprint));
      const now = new Date().toISOString();
      const rows = [];
      let skipped = 0;

      for (const raw of source) {
        const item = validateCompany(raw);
        const fingerprint = companyFingerprint(item);
        if (fingerprints.has(fingerprint)) {
          skipped += 1;
          continue;
        }
        fingerprints.add(fingerprint);
        rows.push({
          ...toDatabase(item),
          deleted_at: raw.deletedAt || raw.deleted_at || null,
          created_by: raw.createdBy || raw.created_by || session.actor,
          updated_by: session.actor,
          updated_at: now,
        });
      }

      if (rows.length) {
        await supabase("invoice_companies", {
          method: "POST",
          headers: { prefer: "return=minimal" },
          body: rows,
        });
      }
      return json({ imported: rows.length, skipped });
    } catch (error) {
      return handleError(error);
    }
  },
};
