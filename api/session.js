import { getSession } from "../lib/auth.js";
import { handleError, json, methodNotAllowed } from "../lib/http.js";

export default {
  async fetch(request) {
    try {
      if (request.method !== "GET") return methodNotAllowed(["GET"]);
      const session = await getSession(request);
      return json(session ? {
        authenticated: true,
        actor: session.actor,
        username: session.username,
        role: session.role,
      } : { authenticated: false });
    } catch (error) {
      return handleError(error);
    }
  },
};
