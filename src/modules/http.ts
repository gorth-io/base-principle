import { errorResponse } from "./error";
import { createRequestRateLimit, type RequestRateLimitOptions } from "./rate-limit";

export interface CorsPolicy {
  origins: readonly string[] | "*";
  credentials?: boolean;
  methods?: readonly string[];
  allowHeaders?: readonly string[];
  exposeHeaders?: readonly string[];
  maxAgeSeconds?: number;
}

export interface HttpMiddlewareOptions {
  maxBodySize: number;
  timeoutMs?: number | false;
  secureHeaders?: false | Record<string, string>;
  cors?: CorsPolicy;
  rateLimit?: RequestRateLimitOptions;
  compress?: boolean;
  onError?(error: unknown): Response | Promise<Response>;
}

class HttpPolicyError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status: number) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

function vary(headers: Headers, name: string) {
  const current = headers.get("vary");
  if (
    current !== "*" &&
    !current?.split(",").some((v) => v.trim().toLowerCase() === name.toLowerCase())
  )
    headers.set("vary", current ? `${current}, ${name}` : name);
}

export async function checkRequestBody(request: Request, limit: number) {
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length))))
    throw new HttpPolicyError("invalid_content_length", 400);
  if (length && Number(length) > limit)
    throw new HttpPolicyError("payload_too_large", 413);
  const reader = request.clone().body?.getReader();
  if (!reader) return;
  let bytes = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) return;
      bytes += part.value.byteLength;
      if (bytes > limit) throw new HttpPolicyError("payload_too_large", 413);
    }
  } finally {
    // Awaiting cancellation of one tee branch can deadlock before the host reads the original.
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function corsHeaders(
  request: Request,
  policy: CorsPolicy,
  headers: Headers,
): Response | undefined {
  const origin = request.headers.get("origin");
  if (policy.origins !== "*") vary(headers, "Origin");
  if (!origin) return;
  if (policy.origins !== "*" && !policy.origins.includes(origin))
    throw new HttpPolicyError("origin_not_allowed", 403);
  headers.set("Access-Control-Allow-Origin", policy.origins === "*" ? "*" : origin);
  if (policy.credentials) headers.set("Access-Control-Allow-Credentials", "true");
  if (policy.exposeHeaders?.length)
    headers.set("Access-Control-Expose-Headers", policy.exposeHeaders.join(", "));
  if (
    request.method !== "OPTIONS" ||
    !request.headers.has("access-control-request-method")
  )
    return;
  const methods = policy.methods ?? [
    "GET",
    "HEAD",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "OPTIONS",
  ];
  const allowedHeaders = policy.allowHeaders ?? [
    "Content-Type",
    "Authorization",
    "X-Request-Id",
  ];
  const requested =
    request.headers
      .get("access-control-request-headers")
      ?.split(",")
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean) ?? [];
  vary(headers, "Access-Control-Request-Method");
  vary(headers, "Access-Control-Request-Headers");
  if (
    !methods.includes(request.headers.get("access-control-request-method")!) ||
    requested.some((h) => !allowedHeaders.some((v) => v.toLowerCase() === h))
  )
    throw new HttpPolicyError("preflight_not_allowed", 403);
  headers.set("Access-Control-Allow-Methods", methods.join(", "));
  headers.set("Access-Control-Allow-Headers", allowedHeaders.join(", "));
  headers.set("Access-Control-Max-Age", String(policy.maxAgeSeconds ?? 86400));
  return new Response(null, { status: 204, headers });
}

export function compressHttpResponse(request: Request, response: Response): Response {
  if (
    !response.body ||
    request.method === "HEAD" ||
    [204, 206, 304].includes(response.status) ||
    response.headers.has("content-encoding") ||
    response.headers.has("transfer-encoding") ||
    /(?:^|,)\s*no-transform(?:,|$)/i.test(
      response.headers.get("cache-control") ?? "",
    ) ||
    !/^(text\/(?!event-stream)|application\/(?:json|javascript|xml|[^;]+\+json|[^;]+\+xml)|image\/svg\+xml)/i.test(
      response.headers.get("content-type") ?? "",
    ) ||
    (response.headers.has("content-length") &&
      Number(response.headers.get("content-length")) < 1024)
  )
    return response;
  const accepted = (request.headers.get("accept-encoding") ?? "")
    .split(",")
    .map((part) => {
      const [name, ...parameters] = part.trim().split(";");
      const value = parameters.find((v) => v.trim().startsWith("q="));
      const q = value ? Number(value.trim().slice(2)) : 1;
      return {
        name: name.toLowerCase(),
        q: Number.isFinite(q) && q >= 0 && q <= 1 ? q : 0,
      };
    });
  const formats = (["gzip", "deflate"] as const)
    .map((name) => ({
      name,
      q:
        accepted.find((v) => v.name === name)?.q ??
        accepted.find((v) => v.name === "*")?.q ??
        0,
    }))
    .sort((a, b) => b.q - a.q);
  vary(response.headers, "Accept-Encoding");
  if (!formats[0]?.q) return response;
  const result = new Response(
    response.body.pipeThrough(new CompressionStream(formats[0].name)),
    response,
  );
  result.headers.delete("Content-Length");
  result.headers.set("Content-Encoding", formats[0].name);
  const etag = result.headers.get("etag");
  if (etag && !etag.startsWith("W/")) result.headers.set("etag", "W/" + etag);
  return result;
}

/** Web-standard policy mechanism. No env, listener, hidden proxy trust or in-memory limiter. */
export function createHttpMiddleware(options: HttpMiddlewareOptions) {
  const timeoutMs = options.timeoutMs === false ? false : (options.timeoutMs ?? 30_000);
  if (
    !Number.isSafeInteger(options.maxBodySize) ||
    options.maxBodySize < 0 ||
    (timeoutMs !== false && (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1)) ||
    (options.cors?.origins === "*" && options.cors.credentials)
  )
    throw new TypeError("Invalid HTTP policy");
  if (options.cors) {
    const cors = options.cors;
    if (
      cors.origins !== "*" &&
      cors.origins.some((origin) => {
        try {
          return new URL(origin).origin !== origin;
        } catch {
          return true;
        }
      })
    )
      throw new TypeError("Invalid CORS origin policy");
    if (
      cors.methods?.some((method) => !/^[A-Z]+$/.test(method)) ||
      [...(cors.allowHeaders ?? []), ...(cors.exposeHeaders ?? [])].some(
        (header) => !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(header),
      ) ||
      (cors.maxAgeSeconds !== undefined &&
        (!Number.isSafeInteger(cors.maxAgeSeconds) || cors.maxAgeSeconds < 0))
    )
      throw new TypeError("Invalid CORS policy");
  }
  const rateLimit = options.rateLimit && createRequestRateLimit(options.rateLimit);
  return async function handleHttp(
    request: Request,
    next: (request: Request, signal: AbortSignal) => Promise<Response>,
  ): Promise<Response> {
    const started = performance.now(),
      headers = new Headers();
    const requestId = request.headers.get("x-request-id");
    headers.set(
      "X-Request-Id",
      requestId && /^[\w-]{1,255}$/.test(requestId) ? requestId : crypto.randomUUID(),
    );
    if (options.secureHeaders !== false) {
      const security: Record<string, string> = {
        "Cross-Origin-Resource-Policy": "same-origin",
        "Cross-Origin-Opener-Policy": "same-origin",
        "Origin-Agent-Cluster": "?1",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
        "X-DNS-Prefetch-Control": "off",
        "X-Download-Options": "noopen",
        "X-Frame-Options": "SAMEORIGIN",
        "X-Permitted-Cross-Domain-Policies": "none",
        "X-XSS-Protection": "0",
        ...(new URL(request.url).protocol === "https:"
          ? { "Strict-Transport-Security": "max-age=15552000; includeSubDomains" }
          : {}),
        ...options.secureHeaders,
      };
      for (const [key, value] of Object.entries(security)) headers.set(key, value);
    }
    const controller = new AbortController();
    const signal = AbortSignal.any([request.signal, controller.signal]);
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function execute() {
      const preflight = options.cors && corsHeaders(request, options.cors, headers);
      if (preflight) return preflight;
      if (rateLimit) {
        let result;
        try {
          result = await rateLimit(request);
        } catch {
          throw new HttpPolicyError("rate_limit_unavailable", 503);
        }
        for (const [key, value] of result.headers) headers.set(key, value);
        if (!result.allowed)
          return errorResponse({ status: 429, code: "too_many_requests" });
      }
      signal.throwIfAborted();
      await checkRequestBody(request, options.maxBodySize);
      signal.throwIfAborted();
      return next(request, signal);
    }
    let response: Response;
    try {
      response =
        timeoutMs === false
          ? await execute()
          : await Promise.race([
              execute(),
              new Promise<Response>((_, reject) => {
                timer = setTimeout(() => {
                  controller.abort();
                  reject(new HttpPolicyError("request_timeout", 408));
                }, timeoutMs);
                timer.unref?.();
              }),
            ]);
    } catch (error) {
      response = signal.aborted
        ? errorResponse({
            status: 408,
            code: controller.signal.aborted ? "request_timeout" : "request_aborted",
          })
        : error instanceof HttpPolicyError
          ? errorResponse(error)
          : options.onError
            ? await options.onError(error)
            : errorResponse({ status: 500, code: "internal_server_error" });
    } finally {
      if (timer) clearTimeout(timer);
    }
    response = new Response(response.body, response);
    const originVary = headers.get("vary");
    headers.delete("vary");
    for (const [key, value] of headers) response.headers.set(key, value);
    for (const name of originVary?.split(",") ?? [])
      vary(response.headers, name.trim());
    response.headers.delete("X-Powered-By");
    const timing = response.headers.get("Server-Timing");
    response.headers.set(
      "Server-Timing",
      `${timing ? timing + ", " : ""}total;dur=${(performance.now() - started).toFixed(1)}`,
    );
    return options.compress ? compressHttpResponse(request, response) : response;
  };
}
