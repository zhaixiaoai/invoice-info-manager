import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import activityApi from "./api/activity.js";
import companiesApi from "./api/companies.js";
import exportApi from "./api/export.js";
import importApi from "./api/import.js";
import loginApi from "./api/login.js";
import logoutApi from "./api/logout.js";
import membersApi from "./api/members.js";
import permissionsApi from "./api/permissions.js";
import sessionApi from "./api/session.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const HOST = "0.0.0.0";
const MAX_REQUEST_BYTES = 2_000_000;

const apiRoutes = new Map([
  ["/api/activity", activityApi],
  ["/api/companies", companiesApi],
  ["/api/export", exportApi],
  ["/api/import", importApi],
  ["/api/login", loginApi],
  ["/api/logout", logoutApi],
  ["/api/members", membersApi],
  ["/api/permissions", permissionsApi],
  ["/api/session", sessionApi],
]);

const staticFiles = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/app.js", "app.js"],
  ["/styles.css", "styles.css"],
  ["/login-grid.js", "login-grid.js"],
  ["/logo-focus.js", "logo-focus.js"],
  ["/specular-card.js", "specular-card.js"],
  ["/splash-cursor.js", "splash-cursor.js"],
]);

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
};

function securityHeaders() {
  return {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
  };
}

function htmlHeaders() {
  return {
    ...securityHeaders(),
    "cache-control": "no-store, max-age=0",
    "content-security-policy": "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  };
}

function writeHeaders(res, status, headers = {}) {
  res.statusCode = status;
  for (const [key, value] of Object.entries({ ...securityHeaders(), ...headers })) {
    if (value !== undefined && value !== null) res.setHeader(key, value);
  }
}

async function readBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_REQUEST_BYTES) {
      const error = new Error("Request body too large");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return chunks.length ? Buffer.concat(chunks) : null;
}

function requestHeaders(req) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) value.forEach((item) => headers.append(key, item));
    else if (value !== undefined) headers.set(key, value);
  }
  return headers;
}

async function handleApi(req, res, handler, url) {
  const method = String(req.method || "GET").toUpperCase();
  const headers = requestHeaders(req);
  const body = method === "GET" || method === "HEAD" ? null : await readBody(req);
  const init = { method, headers };
  if (body) {
    init.body = body;
    init.duplex = "half";
  }
  const request = new Request(url, init);
  const response = await handler.fetch(request);
  const outHeaders = {};
  response.headers.forEach((value, key) => { outHeaders[key] = value; });
  if (typeof response.headers.getSetCookie === "function") {
    const cookies = response.headers.getSetCookie();
    if (cookies?.length) outHeaders["set-cookie"] = cookies;
  }
  writeHeaders(res, response.status, outHeaders);
  if (method === "HEAD") return res.end();
  const arrayBuffer = await response.arrayBuffer();
  res.end(Buffer.from(arrayBuffer));
}

function safeAssetPath(pathname) {
  if (!pathname.startsWith("/assets/")) return null;
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return null; }
  const relative = decoded.slice(1);
  const full = path.resolve(__dirname, relative);
  const assetsRoot = path.resolve(__dirname, "assets") + path.sep;
  return full.startsWith(assetsRoot) ? full : null;
}

async function serveStatic(req, res, pathname) {
  let filePath = null;
  const mapped = staticFiles.get(pathname);
  if (mapped) filePath = path.join(__dirname, mapped);
  else filePath = safeAssetPath(pathname);
  if (!filePath) return false;

  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const headers = pathname === "/" || pathname === "/index.html"
      ? htmlHeaders()
      : { ...securityHeaders(), "cache-control": "no-store, max-age=0" };
    headers["content-type"] = contentTypes[ext] || "application/octet-stream";
    writeHeaders(res, 200, headers);
    if (req.method === "HEAD") res.end();
    else res.end(data);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const forwardedProto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
    const host = req.headers.host || "localhost";
    const url = new URL(req.url || "/", `${forwardedProto}://${host}`);
    const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;

    if (pathname === "/healthz") {
      writeHeaders(res, 200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      return res.end(JSON.stringify({ ok: true, service: "invoice-info-manager" }));
    }

    const api = apiRoutes.get(pathname);
    if (api) return await handleApi(req, res, api, url.toString());

    if (await serveStatic(req, res, pathname)) return;

    writeHeaders(res, 404, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(JSON.stringify({ error: "Not Found" }));
  } catch (error) {
    console.error("CloudBase server error:", error);
    const status = Number(error?.status || 500);
    writeHeaders(res, status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(JSON.stringify({ error: status === 413 ? "提交内容过大" : "服务器暂时不可用，请稍后重试" }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`invoice-info-manager listening on http://${HOST}:${PORT}`);
});
