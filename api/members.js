import { hashMemberPassword, normalizeUsername, requireAdmin } from "../lib/auth.js";
import { handleError, HttpError, json, methodNotAllowed, readJson } from "../lib/http.js";
import { supabase } from "../lib/supabase.js";
import { validUuid } from "../lib/company.js";

const memberFields = "id,username,display_name,active,session_version,last_login_at,created_at,updated_at,created_by";

function cleanUsername(value) {
  const username = String(value || "").trim().slice(0, 30);
  if (!/^[\p{L}\p{N}._-]{2,30}$/u.test(username)) {
    throw new HttpError(400, "成员账号需为 2—30 位，可使用中文、字母、数字、点、下划线或短横线");
  }
  return username;
}

function cleanDisplayName(value, fallback) {
  const displayName = String(value || fallback || "").trim().slice(0, 30);
  if (!displayName) throw new HttpError(400, "请填写成员姓名");
  return displayName;
}

function toClient(row) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    active: Boolean(row.active),
    sessionVersion: Number(row.session_version || 1),
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by || "",
  };
}

async function getMember(id) {
  const query = new URLSearchParams({ select: memberFields, id: `eq.${id}`, limit: "1" });
  const rows = await supabase(`invoice_members?${query}`);
  return rows?.[0] || null;
}

export default {
  async fetch(request) {
    try {
      const session = await requireAdmin(request);

      if (request.method === "GET") {
        const rows = await supabase(`invoice_members?select=${memberFields}&order=created_at.desc`);
        return json({ members: (rows || []).map(toClient) });
      }

      if (request.method === "POST") {
        const body = await readJson(request, 30_000);
        const username = cleanUsername(body.username);
        const usernameKey = normalizeUsername(username);
        const displayName = cleanDisplayName(body.displayName, username);
        const password = hashMemberPassword(body.password);

        const existsQuery = new URLSearchParams({ select: "id", username_key: `eq.${usernameKey}`, limit: "1" });
        const existing = await supabase(`invoice_members?${existsQuery}`);
        if (existing?.length) throw new HttpError(409, "该成员账号已经存在，请换一个账号");

        const rows = await supabase("invoice_members", {
          method: "POST",
          headers: { prefer: "return=representation" },
          body: [{
            username,
            username_key: usernameKey,
            display_name: displayName,
            password_salt: password.salt,
            password_hash: password.hash,
            active: true,
            created_by: session.actor,
          }],
        });
        return json({ member: toClient(rows[0]) }, 201);
      }

      if (request.method === "PATCH") {
        const body = await readJson(request, 30_000);
        if (!validUuid(body.id)) throw new HttpError(400, "成员编号无效");
        const member = await getMember(body.id);
        if (!member) throw new HttpError(404, "未找到该成员账号");

        if (body.action === "setActive") {
          const active = Boolean(body.active);
          const rows = await supabase(`invoice_members?id=eq.${body.id}`, {
            method: "PATCH",
            headers: { prefer: "return=representation" },
            body: {
              active,
              session_version: Number(member.session_version || 1) + 1,
            },
          });
          return json({ member: toClient(rows[0]) });
        }

        if (body.action === "resetPassword") {
          const password = hashMemberPassword(body.password);
          const rows = await supabase(`invoice_members?id=eq.${body.id}`, {
            method: "PATCH",
            headers: { prefer: "return=representation" },
            body: {
              password_salt: password.salt,
              password_hash: password.hash,
              session_version: Number(member.session_version || 1) + 1,
            },
          });
          return json({ member: toClient(rows[0]) });
        }

        if (body.action === "updateProfile") {
          const displayName = cleanDisplayName(body.displayName, member.username);
          const rows = await supabase(`invoice_members?id=eq.${body.id}`, {
            method: "PATCH",
            headers: { prefer: "return=representation" },
            body: { display_name: displayName },
          });
          return json({ member: toClient(rows[0]) });
        }

        throw new HttpError(400, "不支持的成员操作");
      }

      return methodNotAllowed(["GET", "POST", "PATCH"]);
    } catch (error) {
      return handleError(error);
    }
  },
};
