import { HttpError } from "./http.js";

function config() {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SECRET_KEY || "";
  if (!url || !key) throw new Error("缺少 SUPABASE_URL 或 SUPABASE_SECRET_KEY 环境变量");
  return { url, key };
}

export async function supabase(path, options = {}) {
  const { url, key } = config();
  const headers = {
    apikey: key,
    accept: "application/json",
    "content-type": "application/json",
    ...options.headers,
  };
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const text = await response.text();
  let payload = null;
  if (text) {
    try { payload = JSON.parse(text); } catch { payload = text; }
  }

  if (!response.ok) {
    if (payload?.code === "23505") {
      throw new HttpError(409, "该统一社会信用代码已存在，请勿重复录入", payload);
    }
    const message = payload?.message || payload?.hint || "数据库操作失败";
    const status = response.status === 409 ? 409 : 502;
    throw new HttpError(status, message, payload);
  }
  return payload;
}

export async function writeAudit({ companyId, action, actor, snapshot }) {
  try {
    await supabase("invoice_company_audit", {
      method: "POST",
      headers: { prefer: "return=minimal" },
      body: [{ company_id: companyId, action, actor, snapshot }],
    });
  } catch (error) {
    console.error("写入审计记录失败", error);
  }
}
