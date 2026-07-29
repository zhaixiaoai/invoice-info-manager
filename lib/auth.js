import crypto from "node:crypto";
import { HttpError, json } from "./http.js";

const COOKIE_NAME = "invoice_session";
const SESSION_SECONDS = 60 * 60 * 24 * 7;

function getSecret() {
  const secret = process.env.SESSION_SECRET || "";
  if (secret.length < 32) throw new Error("SESSION_SECRET 至少需要 32 个字符");
  return secret;
}

function encode(value) {
  return Buffer.from(value).toString("base64url");
}

function signature(data) {
  return crypto.createHmac("sha256", getSecret()).update(data).digest("base64url");
}

function parseCookies(request) {
  const raw = request.headers.get("cookie") || "";
  return Object.fromEntries(raw.split(";").map((part) => {
    const index = part.indexOf("=");
    if (index < 0) return [part.trim(), ""];
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1))];
  }).filter(([key]) => key));
}

export function createSession(actor) {
  const payload = encode(JSON.stringify({ actor, exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS }));
  return `${payload}.${signature(payload)}`;
}

export function sessionCookie(token) {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_SECONDS}`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function verifySession(request) {
  try {
    const token = parseCookies(request)[COOKIE_NAME];
    if (!token) return null;
    const [payload, sig] = token.split(".");
    if (!payload || !sig) return null;
    const expected = signature(payload);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!data.exp || data.exp < Math.floor(Date.now() / 1000)) return null;
    return { actor: String(data.actor || "团队成员").slice(0, 30) };
  } catch {
    return null;
  }
}

export function requireSession(request) {
  const session = verifySession(request);
  if (!session) throw new HttpError(401, "登录状态已失效，请重新输入团队口令");
  return session;
}

export function passwordMatches(input) {
  const expected = process.env.TEAM_PASSWORD || "";
  if (expected.length < 8) throw new Error("TEAM_PASSWORD 至少需要 8 个字符");
  const left = crypto.createHash("sha256").update(String(input || "")).digest();
  const right = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(left, right);
}
