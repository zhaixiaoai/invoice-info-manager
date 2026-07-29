import { clearSessionCookie } from "../lib/auth.js";
import { json, methodNotAllowed } from "../lib/http.js";

export default {
  async fetch(request) {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    return json({ ok: true }, 200, { "set-cookie": clearSessionCookie() });
  },
};
