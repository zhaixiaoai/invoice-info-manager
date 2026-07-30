import { requireAdmin } from "../lib/auth.js";
import { toClient } from "../lib/company.js";
import { handleError, json, methodNotAllowed } from "../lib/http.js";
import { supabase } from "../lib/supabase.js";

export default {
  async fetch(request) {
    try {
      const session = await requireAdmin(request);
      if (request.method !== "GET") return methodNotAllowed(["GET"]);
      const rows = await supabase("invoice_companies?select=*&order=updated_at.desc");
      return json({
        app: "公司开票信息管理云端版",
        version: 4,
        exportedAt: new Date().toISOString(),
        exportedBy: session.actor,
        records: (rows || []).map(toClient),
      });
    } catch (error) {
      return handleError(error);
    }
  },
};
