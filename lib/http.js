export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}

export async function readJson(request, maxBytes = 1_500_000) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > maxBytes) throw new HttpError(413, "提交内容过大");
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "请求格式不正确");
  }
}

export class HttpError extends Error {
  constructor(status, message, details = null) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function handleError(error) {
  console.error(error);
  if (error instanceof HttpError) {
    return json({ error: error.message, details: error.details }, error.status);
  }
  return json({ error: "服务器暂时不可用，请稍后重试" }, 500);
}

export function methodNotAllowed(allowed) {
  return json({ error: "不支持此操作" }, 405, { allow: allowed.join(", ") });
}
