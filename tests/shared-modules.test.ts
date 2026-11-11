import { afterEach, describe, expect, it, vi } from "vitest";
import { createHttpMiddleware } from "../src/modules/http";
import {
  createRateLimitStore,
  createRequestRateLimit,
  type AtomicRateLimitStorage,
} from "../src/modules/rate-limit";
import {
  createNitroErrorHandler,
  createNitroMiddleware,
  createNitroRequestGuard,
} from "../src/configs/nitro";
import { errorResponse } from "../src/modules/error";
import {
  createOutboundClient,
  OutboundError,
  parseRetryAfter,
} from "../src/modules/outbound";
import type { Store } from "hono-rate-limiter";
import { Hono } from "hono";
import { rateLimitConfig } from "../src/configs/rate-limit";

afterEach(() => vi.useRealTimers());

describe("HTTP policy and Nitro boundaries", () => {
  it("preserves raw signed bytes and multiple cookies, including error responses", async () => {
    const middleware = createHttpMiddleware({ maxBodySize: 128 });
    const bytes = new TextEncoder().encode('{ "signed": "é" }');
    const request = new Request("https://service.test/webhook", {
      method: "POST",
      body: bytes,
    });
    const response = await middleware(request, async (req) => {
      expect(new Uint8Array(await req.arrayBuffer())).toEqual(bytes);
      const headers = new Headers({
        "WWW-Authenticate": 'Bearer error="invalid_token"',
        "X-Powered-By": "fixture",
      });
      headers.append("Set-Cookie", "a=1; HttpOnly");
      headers.append("Set-Cookie", "b=2; HttpOnly");
      return new Response("denied", { status: 401, headers });
    });
    expect(response.status).toBe(401);
    expect(response.headers.getSetCookie()).toHaveLength(2);
    expect(response.headers.get("WWW-Authenticate")).toContain("invalid_token");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.has("X-Powered-By")).toBe(false);
  });

  it("limits real streamed bytes even when content-length is absent or dishonest", async () => {
    const middleware = createHttpMiddleware({ maxBodySize: 2 });
    const next = vi.fn(async () => new Response("must not run"));
    const request = new Request("https://service.test/webhook", {
      method: "POST",
      body: "éé",
      headers: { "content-length": "1" },
    });
    const response = await middleware(request, next);
    expect(response.status).toBe(413);
    expect(next).not.toHaveBeenCalled();
    expect(response.headers.has("x-request-id")).toBe(true);
  });

  it("finishes exact-origin preflight before quota/auth/body processing", async () => {
    const store = { increment: vi.fn() },
      next = vi.fn();
    const middleware = createHttpMiddleware({
      maxBodySize: 0,
      cors: { origins: ["https://app.test"], credentials: true },
      rateLimit: { limit: 5, windowMs: 1000, key: () => "fixture", store },
    });
    const response = await middleware(
      new Request("https://service.test/item", {
        method: "OPTIONS",
        headers: {
          origin: "https://app.test",
          "access-control-request-method": "POST",
          "access-control-request-headers": "authorization",
        },
      }),
      next,
    );
    expect(response.status).toBe(204);
    expect(store.increment).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://app.test",
    );
    const denied = await middleware(
      new Request("https://service.test/item", {
        headers: { origin: "https://evil.test" },
      }),
      next,
    );
    expect(denied.status).toBe(403);
    expect(() =>
      createHttpMiddleware({
        maxBodySize: 10,
        cors: { origins: "*", credentials: true },
      }),
    ).toThrow();
  });

  it("bounds stalled handlers and supplies a cooperative cancellation signal", async () => {
    vi.useFakeTimers();
    let signal!: AbortSignal;
    const middleware = createHttpMiddleware({ maxBodySize: 0, timeoutMs: 10 });
    const pending = middleware(
      new Request("https://service.test/item"),
      async (_request, input) => {
        signal = input;
        return new Promise(() => {});
      },
    );
    await vi.advanceTimersByTimeAsync(11);
    expect((await pending).status).toBe(408);
    expect(signal.aborted).toBe(true);
  });

  it("keeps quota policy explicit, skips host-selected health requests, and fails closed on storage outage", async () => {
    const increment = vi.fn(async () => ({
      totalHits: 2,
      resetTime: new Date(Date.now() + 1000),
    }));
    const middleware = createHttpMiddleware({
      maxBodySize: 0,
      rateLimit: {
        limit: 1,
        windowMs: 1000,
        key: () => "trusted-host-key",
        store: { increment },
        skip: (req) => new URL(req.url).pathname === "/health",
      },
    });
    const next = async () => new Response("ok");
    expect(
      (await middleware(new Request("https://service.test/health"), next)).status,
    ).toBe(200);
    expect(increment).not.toHaveBeenCalled();
    const blocked = await middleware(new Request("https://service.test/item"), next);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBe("1");
    increment.mockRejectedValueOnce(new Error("DB internals"));
    const outage = await middleware(new Request("https://service.test/item"), next);
    expect(outage.status).toBe(503);
    expect(await outage.text()).not.toContain("DB internals");
  });

  it("compresses only eligible representations and honors q=0 and no-transform", async () => {
    const middleware = createHttpMiddleware({ maxBodySize: 0, compress: true });
    const content = "payload".repeat(300);
    const response = await middleware(
      new Request("https://service.test/item", {
        headers: { "accept-encoding": "gzip" },
      }),
      async () =>
        new Response(content, {
          headers: { "content-type": "text/plain", etag: '"value"' },
        }),
    );
    expect(response.headers.get("content-encoding")).toBe("gzip");
    expect(response.headers.get("etag")).toBe('W/"value"');
    expect(
      await new Response(
        response.body!.pipeThrough(new DecompressionStream("gzip")),
      ).text(),
    ).toBe(content);
    const refused = await middleware(
      new Request("https://service.test/item", {
        headers: { "accept-encoding": "gzip;q=0, deflate;q=0" },
      }),
      async () => new Response(content, { headers: { "content-type": "text/plain" } }),
    );
    expect(refused.headers.has("content-encoding")).toBe(false);
    const signed = await middleware(
      new Request("https://service.test/item", {
        headers: { "accept-encoding": "gzip" },
      }),
      async () =>
        new Response(content, {
          headers: {
            "content-type": "application/json",
            "cache-control": "private, no-transform",
          },
        }),
    );
    expect(signed.headers.has("content-encoding")).toBe(false);
  });

  it("delegates native response conversion and limits auth catching to the guard", async () => {
    const event = {
      req: new Request("https://service.test/item"),
      context: {} as Record<string, unknown>,
    };
    const convert = vi.fn((value: unknown) => Response.json(value));
    const middleware = createNitroMiddleware<typeof event>({
      maxBodySize: 0,
      toResponse: convert,
      onError: () => errorResponse({ status: 500, code: "internal_server_error" }),
    });
    expect(await (await middleware(event, async () => ({ ok: true }))).json()).toEqual({
      ok: true,
    });
    expect(convert).toHaveBeenCalled();
    const guard = createNitroRequestGuard<typeof event, string>({
      verify: async () => "identity",
      assign: (e, identity) => {
        e.context.identity = identity;
      },
      failure: () => new Response(null, { status: 401 }),
    });
    const failure = new Error("domain failure");
    await expect(
      guard(event, async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(event.context.identity).toBe("identity");
  });

  it("maps native errors through explicit projection and never serializes unknown causes", async () => {
    const cause = new Error("private provider payload");
    const handler = createNitroErrorHandler({
      project: (error) =>
        error === cause
          ? { status: 403, code: "denied", headers: { "WWW-Authenticate": "Bearer" } }
          : undefined,
    });
    const mapped = handler({ unhandled: true, cause });
    expect(mapped.status).toBe(403);
    expect(mapped.headers.get("www-authenticate")).toBe("Bearer");
    const unknown = handler(new Error("SQL credentials"));
    expect(unknown.status).toBe(500);
    expect(await unknown.text()).not.toContain("SQL");
    expect(errorResponse({ status: 200, code: "unsafe" }).status).toBe(500);
  });
});

it("delegates fixed-window atomic operations to shared durable storage and satisfies Hono Store", async () => {
  const entries = new Map<string, { totalHits: number; resetAt: number }>();
  const storage: AtomicRateLimitStorage = {
    async increment({ key, now, windowMs }) {
      const prior = entries.get(key);
      const next =
        !prior || prior.resetAt <= now
          ? { totalHits: 1, resetAt: now + windowMs }
          : { ...prior, totalHits: prior.totalHits + 1 };
      entries.set(key, next);
      return next;
    },
    async get(key) {
      return entries.get(key);
    },
    async decrement(key) {
      const entry = entries.get(key);
      if (entry) entry.totalHits = Math.max(0, entry.totalHits - 1);
    },
    async resetKey(key) {
      entries.delete(key);
    },
  };
  let now = 1000;
  const first = createRateLimitStore({
    storage,
    prefix: "test:",
    now: () => now,
    windowMs: 1000,
  }) satisfies Store;
  const second = createRateLimitStore({
    storage,
    prefix: "test:",
    now: () => now,
    windowMs: 1000,
  });
  const values = await Promise.all([first.increment("key"), second.increment("key")]);
  expect(values.map((value) => value.totalHits)).toEqual([1, 2]);
  expect(first.localKeys).toBe(false);
  now = 2000;
  expect((await first.increment("key")).totalHits).toBe(1);
  await first.resetKey("key");
  expect(await first.get("key")).toBeUndefined();
  const app = new Hono();
  app.use(
    rateLimitConfig({
      store: first,
      limit: 1,
      windowMs: 1000,
      keyGenerator: () => "native-hono",
    }),
  );
  app.get("/item", (context) => context.text("ok"));
  expect((await app.request("/item")).status).toBe(200);
  expect((await app.request("/item")).status).toBe(429);
});

describe("outbound private JSON workflow", () => {
  it("enforces destinations, refuses redirects, disables caching and bounds bytes", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      expect(init?.redirect).toBe("error");
      expect(init?.cache).toBe("no-store");
      return Response.json({ ok: true });
    });
    const client = createOutboundClient({
      allowedOrigins: ["https://provider.test"],
      fetch: fetcher,
    });
    expect(await client.json("https://provider.test/item")).toEqual({ ok: true });
    await expect(client.json("https://evil.test/item")).rejects.toBeInstanceOf(
      OutboundError,
    );
    const small = createOutboundClient({
      allowedOrigins: ["https://provider.test"],
      fetch: fetcher,
      maxResponseBytes: 1,
    });
    await expect(small.json("https://provider.test/item")).rejects.toMatchObject({
      code: "invalid_response",
    });
  });

  it("never implicitly retries a token grant POST, but permits bounded explicit idempotent retries", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("private-error", { status: 503 }))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    const client = createOutboundClient({
      allowedOrigins: ["https://provider.test"],
      fetch: fetcher,
    });
    await expect(
      client.json("https://provider.test/token", { method: "POST" }, { attempts: 2 }),
    ).rejects.toThrow("not replayable");
    expect(fetcher).not.toHaveBeenCalled();
    expect(
      await client.json("https://provider.test/item", {}, { attempts: 2, delayMs: 0 }),
    ).toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(parseRetryAfter("2")).toBe(2000);
    expect(parseRetryAfter("invalid")).toBeUndefined();
  });
});
