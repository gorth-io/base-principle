export interface RateLimitEntry {
  totalHits: number;
  resetAt: number;
}

export interface AtomicRateLimitStorage {
  /** Atomically start/reset an expired window or increment its live count. */
  increment(input: {
    key: string;
    now: number;
    windowMs: number;
  }): Promise<RateLimitEntry>;
  get(key: string, now: number): Promise<RateLimitEntry | undefined>;
  decrement(key: string): Promise<void>;
  resetKey(key: string): Promise<void>;
}

export interface RateLimitStoreOptions {
  storage: AtomicRateLimitStorage;
  prefix: string;
  now?: () => number;
  windowMs?: number;
}

/** Structurally compatible with Hono's Store. All atomicity/persistence stays in the host adapter. */
export function createRateLimitStore(options: RateLimitStoreOptions) {
  let windowMs = options.windowMs ?? 60_000;
  const clock = options.now ?? Date.now;
  if (!options.prefix || !Number.isSafeInteger(windowMs) || windowMs <= 0)
    throw new TypeError("Invalid rate-limit store options");
  function key(value: string) {
    if (!value || value.length > 2048) throw new TypeError("Invalid rate-limit key");
    return options.prefix + value;
  }
  function entry(value: RateLimitEntry, now: number) {
    if (
      !Number.isSafeInteger(value.totalHits) ||
      value.totalHits < 0 ||
      !Number.isSafeInteger(value.resetAt) ||
      value.resetAt <= now ||
      value.resetAt > now + windowMs
    )
      throw new Error("Invalid rate-limit storage result");
    return { totalHits: value.totalHits, resetTime: new Date(value.resetAt) };
  }
  return {
    localKeys: false,
    prefix: options.prefix,
    init(input: { windowMs: number }) {
      if (!Number.isSafeInteger(input.windowMs) || input.windowMs < 1)
        throw new TypeError("Invalid rate-limit window");
      windowMs = input.windowMs;
    },
    async get(value: string) {
      const now = clock(),
        found = await options.storage.get(key(value), now);
      return found && found.resetAt > now ? entry(found, now) : undefined;
    },
    async increment(value: string) {
      const now = clock();
      return entry(
        await options.storage.increment({ key: key(value), now, windowMs }),
        now,
      );
    },
    decrement(value: string) {
      return options.storage.decrement(key(value));
    },
    resetKey(value: string) {
      return options.storage.resetKey(key(value));
    },
  };
}

export interface RequestRateLimitOptions {
  limit: number;
  windowMs: number;
  key(request: Request): string | Promise<string>;
  store: { increment(key: string): Promise<{ totalHits: number; resetTime: Date }> };
  skip?(request: Request): boolean;
  now?: () => number;
}

export function createRequestRateLimit(options: RequestRateLimitOptions) {
  if (
    ![options.limit, options.windowMs].every(
      (value) => Number.isSafeInteger(value) && value > 0,
    )
  )
    throw new TypeError("Invalid rate-limit policy");
  return async (request: Request) => {
    if (options.skip?.(request)) return { allowed: true, headers: new Headers() };
    const key = await options.key(request);
    if (!key || key.length > 2048) throw new TypeError("Invalid rate-limit key");
    const value = await options.store.increment(key),
      now = (options.now ?? Date.now)();
    const reset = value.resetTime.getTime();
    if (
      !Number.isSafeInteger(value.totalHits) ||
      value.totalHits < 1 ||
      !Number.isSafeInteger(reset) ||
      reset <= now ||
      reset > now + options.windowMs
    )
      throw new Error("Invalid rate-limit storage result");
    const seconds = Math.max(1, Math.ceil((reset - now) / 1000));
    const headers = new Headers({
      "RateLimit-Policy": `${options.limit};w=${Math.ceil(options.windowMs / 1000)}`,
      "RateLimit-Limit": String(options.limit),
      "RateLimit-Remaining": String(Math.max(0, options.limit - value.totalHits)),
      "RateLimit-Reset": String(seconds),
    });
    const allowed = value.totalHits <= options.limit;
    if (!allowed) headers.set("Retry-After", String(seconds));
    return { allowed, headers };
  };
}
