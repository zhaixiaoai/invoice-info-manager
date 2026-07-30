import crypto from "node:crypto";
import { HttpError } from "./http.js";

const COOKIE_NAME = "invoice_session";
const SESSION_SECONDS = 60 * 60 * 24 * 7;
const ROLE_ADMIN = "admin";
const ROLE_VIEWER = "viewer";

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

function secureMatches(input, expected) {
  const left = crypto.createHash("sha256").update(String(input || "")).digest();
  const right = crypto.createHash("sha256").update(String(expected || "")).digest();
  return crypto.timingSafeEqual(left, right);
}

export function createSession(actor, role) {
  const safeRole = role === ROLE_ADMIN ? ROLE_ADMIN : ROLE_VIEWER;
  const payload = encode(JSON.stringify({ actor, role: safeRole, exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS }));
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
    return {
      actor: String(data.actor || "团队成员").slice(0, 30),
      role: data.role === ROLE_ADMIN ? ROLE_ADMIN : ROLE_VIEWER,
    };
  } catch {
    return null;
  }
}

export function requireSession(request) {
  const session = verifySession(request);
  if (!session) throw new HttpError(401, "登录状态已失效，请重新输入访问口令");
  return session;
}

export function requireAdmin(request) {
  const session = requireSession(request);
  if (session.role !== ROLE_ADMIN) throw new HttpError(403, "当前账号为只读权限，不能执行此操作");
  return session;
}

export function assertAdmin(session) {
  if (session?.role !== ROLE_ADMIN) throw new HttpError(403, "当前账号为只读权限，不能执行此操作");
  return session;
}

export function resolveAccessRole(input) {
  const viewerPassword = process.env.TEAM_PASSWORD || "";
  const adminPassword = process.env.ADMIN_PASSWORD || "";

  if (viewerPassword.length < 8) throw new Error("TEAM_PASSWORD 至少需要 8 个字符");
  if (adminPassword && adminPassword.length < 8) throw new Error("ADMIN_PASSWORD 至少需要 8 个字符");
  if (adminPassword && secureMatches(adminPassword, viewerPassword)) {
    throw new Error("ADMIN_PASSWORD 不能与 TEAM_PASSWORD 相同");
  }

  if (adminPassword && secureMatches(input, adminPassword)) return ROLE_ADMIN;
  if (secureMatches(input, viewerPassword)) return ROLE_VIEWER;
  return null;
}
