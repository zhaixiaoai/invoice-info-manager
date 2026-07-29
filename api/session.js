import { verifySession } from "../lib/auth.js";
import { json, methodNotAllowed } from "../lib/http.js";

export default {
  async fetch(request) {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    const session = verifySession(request);
    return json(session ? { authenticated: true, actor: session.actor } : { authenticated: false });
  },
};
