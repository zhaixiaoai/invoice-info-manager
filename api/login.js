import { createSession, resolveLogin, sessionCookie } from "../lib/auth.js";
import { handleError, HttpError, json, methodNotAllowed, readJson } from "../lib/http.js";
import { writeAccessLog } from "../lib/supabase.js";

export default {
  async fetch(request) {
    try {
      if (request.method !== "POST") return methodNotAllowed(["POST"]);
      const body = await readJson(request, 20_000);
      const identity = String(body.actor || "").trim().slice(0, 30);
      if (!identity) throw new HttpError(400, "请输入成员账号或管理员姓名");
      const session = await resolveLogin(identity, body.password);
      if (!session) {
        await new Promise((resolve) => setTimeout(resolve, 350));
        throw new HttpError(401, "账号、口令不正确，或该成员账号已停用");
      }
      const token = createSession(session);
      await writeAccessLog({ session, eventType: "login" });
      return json({ ok: true, actor: session.actor, username: session.username, role: session.role }, 200, { "set-cookie": sessionCookie(token) });
    } catch (error) {
      return handleError(error);
    }
  },
};
