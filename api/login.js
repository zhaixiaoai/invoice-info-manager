import { createSession, passwordMatches, sessionCookie } from "../lib/auth.js";
import { handleError, HttpError, json, methodNotAllowed, readJson } from "../lib/http.js";

export default {
  async fetch(request) {
    try {
      if (request.method !== "POST") return methodNotAllowed(["POST"]);
      const body = await readJson(request, 20_000);
      const actor = String(body.actor || "").trim().slice(0, 30);
      if (!actor) throw new HttpError(400, "请输入您的姓名或昵称");
      if (!passwordMatches(body.password)) {
        await new Promise((resolve) => setTimeout(resolve, 350));
        throw new HttpError(401, "团队口令不正确");
      }
      const token = createSession(actor);
      return json({ ok: true, actor }, 200, { "set-cookie": sessionCookie(token) });
    } catch (error) {
      return handleError(error);
    }
  },
};
