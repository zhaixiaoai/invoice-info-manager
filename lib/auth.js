import crypto from "node:crypto";
import { HttpError } from "./http.js";
import { supabase } from "./supabase.js";

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

export function normalizeUsername(value) {
  return String(value || "").trim().toLocaleLowerCase("zh-CN");
}

export function validateMemberPassword(value) {
  const password = String(value || "");
  if (password.length < 8) throw new HttpError(400, "成员口令至少需要 8 个字符");
  if (password.length > 128) throw new HttpError(400, "成员口令不能超过 128 个字符");
  return password;
}

export function hashMemberPassword(value) {
  const password = validateMemberPassword(value);
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

function verifyMemberPassword(value, salt, expectedHash) {
  try {
    const actual = crypto.scryptSync(String(value || ""), String(salt || ""), 64);
    const expected = Buffer.from(String(expectedHash || ""), "hex");
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function createSession({ actor, role, memberId = null, sessionVersion = 0, username = "" }) {
  const safeRole = role === ROLE_ADMIN ? ROLE_ADMIN : ROLE_VIEWER;
  const payload = encode(JSON.stringify({
    actor: String(actor || "团队成员").slice(0, 30),
    role: safeRole,
    memberId: safeRole === ROLE_VIEWER ? memberId : null,
    sessionVersion: safeRole === ROLE_VIEWER ? Number(sessionVersion || 1) : 0,
    username: safeRole === ROLE_VIEWER ? String(username || "").slice(0, 30) : "",
    exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS,
  }));
  return `${payload}.${signature(payload)}`;
}

export function sessionCookie(token) {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_SECONDS}`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function verifySessionToken(request) {
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
      memberId: data.memberId || null,
      sessionVersion: Number(data.sessionVersion || 0),
      username: String(data.username || "").slice(0, 30),
    };
  } catch {
    return null;
  }
}

export async function getSession(request) {
  const token = verifySessionToken(request);
  if (!token) return null;
  if (token.role === ROLE_ADMIN) return token;
  if (!token.memberId || !token.sessionVersion) return null;

  const query = new URLSearchParams({
    select: "id,username,display_name,active,session_version,access_all",
    id: `eq.${token.memberId}`,
    limit: "1",
  });
  const rows = await supabase(`invoice_members?${query}`);
  const member = rows?.[0];
  if (!member || !member.active || Number(member.session_version) !== token.sessionVersion) return null;

  return {
    actor: String(member.display_name || member.username).slice(0, 30),
    username: String(member.username || "").slice(0, 30),
    role: ROLE_VIEWER,
    memberId: member.id,
    sessionVersion: Number(member.session_version),
    accessAll: Boolean(member.access_all),
  };
}

export async function requireSession(request) {
  const session = await getSession(request);
  if (!session) throw new HttpError(401, "账号已停用或登录状态已失效，请重新登录");
  return session;
}

export async function requireAdmin(request) {
  const session = await requireSession(request);
  if (session.role !== ROLE_ADMIN) throw new HttpError(403, "当前账号为只读权限，不能执行此操作");
  return session;
}

export function assertAdmin(session) {
  if (session?.role !== ROLE_ADMIN) throw new HttpError(403, "当前账号为只读权限，不能执行此操作");
  return session;
}

export async function resolveLogin(identity, password) {
  const input = String(identity || "").trim().slice(0, 30);
  const adminPassword = process.env.ADMIN_PASSWORD || "";
  if (adminPassword.length < 8) throw new Error("ADMIN_PASSWORD 至少需要 8 个字符");

  if (secureMatches(password, adminPassword)) {
    return {
      actor: input || "管理员",
      username: "",
      role: ROLE_ADMIN,
      memberId: null,
      sessionVersion: 0,
    };
  }

  const usernameKey = normalizeUsername(input);
  if (!usernameKey) return null;
  const query = new URLSearchParams({
    select: "id,username,display_name,password_salt,password_hash,active,session_version,access_all",
    username_key: `eq.${usernameKey}`,
    limit: "1",
  });
  const rows = await supabase(`invoice_members?${query}`);
  const member = rows?.[0];
  if (!member || !member.active || !verifyMemberPassword(password, member.password_salt, member.password_hash)) return null;

  await supabase(`invoice_members?id=eq.${member.id}`, {
    method: "PATCH",
    headers: { prefer: "return=minimal" },
    body: { last_login_at: new Date().toISOString() },
  });

  return {
    actor: String(member.display_name || member.username).slice(0, 30),
    username: String(member.username || "").slice(0, 30),
    role: ROLE_VIEWER,
    memberId: member.id,
    sessionVersion: Number(member.session_version || 1),
    accessAll: Boolean(member.access_all),
  };
}
