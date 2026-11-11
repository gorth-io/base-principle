import { createRetryStrategy } from "@better-fetch/fetch";

export interface OutboundClientOptions {
  allowedOrigins: readonly string[];
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  maxResponseBytes?: number;
}

export interface OutboundRetryOptions {
  attempts?: number;
  /** Required to replay any non-GET/HEAD request; host owns idempotency. */
  idempotent?: boolean;
  delayMs?: number;
}

export class OutboundError extends Error {
  readonly code: "unavailable" | "invalid_response" | "rejected";
  readonly status?: number;
  constructor(code: "unavailable" | "invalid_response" | "rejected", status?: number) {
    super(`Outbound request ${code}`);
    this.code = code;
    this.status = status;
    this.name = "OutboundError";
  }
}

export function parseRetryAfter(
  value: string | null,
  now = Date.now(),
): number | undefined {
  if (!value) return;
  if (/^\d+$/.test(value)) {
    const ms = Number(value) * 1000;
    return Number.isSafeInteger(ms) ? ms : undefined;
  }
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : undefined;
}

/** Bounded private JSON transport. No token cache, automatic credential refresh or implicit POST retries. */
export function createOutboundClient(options: OutboundClientOptions) {
  const request = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 10_000,
    maxBytes = options.maxResponseBytes ?? 1_048_576;
  const origins = new Set(options.allowedOrigins);
  if (
    !origins.size ||
    ![timeoutMs, maxBytes].every((v) => Number.isSafeInteger(v) && v > 0)
  )
    throw new TypeError("Invalid outbound options");
  for (const origin of origins)
    if (new URL(origin).origin !== origin)
      throw new TypeError("Invalid outbound origin");
  return {
    async json(
      url: string | URL,
      init: RequestInit = {},
      retry: OutboundRetryOptions = {},
    ): Promise<unknown> {
      const target = new URL(url);
      if (
        !origins.has(target.origin) ||
        target.username ||
        target.password ||
        target.hash ||
        !["https:", "http:"].includes(target.protocol)
      )
        throw new OutboundError("rejected");
      const attempts = retry.attempts ?? 1,
        delayMs = retry.delayMs ?? 250;
      if (
        !Number.isSafeInteger(attempts) ||
        attempts < 1 ||
        attempts > 5 ||
        !Number.isSafeInteger(delayMs) ||
        delayMs < 0 ||
        delayMs > 30_000
      )
        throw new TypeError("Invalid outbound retry options");
      const method = (init.method ?? "GET").toUpperCase();
      if (
        attempts > 1 &&
        ((!["GET", "HEAD"].includes(method) && !retry.idempotent) ||
          init.body instanceof ReadableStream)
      )
        throw new TypeError("Request is not replayable");
      const strategy = createRetryStrategy({
        type: "exponential",
        attempts: attempts - 1,
        baseDelay: delayMs,
        maxDelay: 30_000,
        shouldRetry: (response) =>
          response !== null && [429, 502, 503, 504].includes(response.status),
      });
      for (let attempt = 0; ; attempt++) {
        const signal = AbortSignal.any([
          AbortSignal.timeout(timeoutMs),
          ...(init.signal ? [init.signal] : []),
        ]);
        let response: Response;
        try {
          response = await request(target, {
            ...init,
            redirect: "error",
            cache: "no-store",
            signal,
          });
        } catch {
          throw new OutboundError("unavailable");
        }
        if (!response.ok) {
          void response.body?.cancel().catch(() => {});
          if (
            await strategy.shouldAttemptRetry(attempt, response)
          ) {
            const delay = Math.min(
              30_000,
              parseRetryAfter(response.headers.get("retry-after")) ??
                strategy.getDelay(attempt),
            );
            await new Promise<void>((resolve, reject) => {
              if (init.signal?.aborted) {
                reject(new OutboundError("unavailable"));
                return;
              }
              const timer = setTimeout(done, delay);
              function done() {
                init.signal?.removeEventListener("abort", abort);
                resolve();
              }
              function abort() {
                clearTimeout(timer);
                init.signal?.removeEventListener("abort", abort);
                reject(new OutboundError("unavailable"));
              }
              init.signal?.addEventListener("abort", abort, { once: true });
            });
            continue;
          }
          throw new OutboundError(
            response.status === 401 || response.status === 403
              ? "rejected"
              : "unavailable",
            response.status,
          );
        }
        const reader = response.body?.getReader();
        if (!reader) throw new OutboundError("invalid_response");
        const chunks: Uint8Array[] = [];
        let length = 0;
        try {
          for (;;) {
            const part = await reader.read();
            if (part.done) break;
            length += part.value.byteLength;
            if (length > maxBytes) {
              void reader.cancel().catch(() => {});
              throw new Error();
            }
            chunks.push(part.value);
          }
          const bytes = new Uint8Array(length);
          let offset = 0;
          for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.byteLength;
          }
          return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
        } catch {
          throw new OutboundError("invalid_response");
        } finally {
          reader.releaseLock();
        }
      }
    },
  };
}
