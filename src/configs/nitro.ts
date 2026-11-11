import { createHttpMiddleware, type HttpMiddlewareOptions } from "../modules/http";
import { createErrorHandler, type ErrorHandlerOptions } from "../modules/error";

/** Structural H3 v2/Nitro 3 boundary: the host supplies its native toResponse. */
export interface NitroRequestEvent {
  req: Request;
  context: object;
}

export interface NitroMiddlewareOptions<
  Event extends NitroRequestEvent,
> extends HttpMiddlewareOptions {
  toResponse(value: unknown, event: Event): Response | Promise<Response>;
  /** Required: map native/domain errors before H3 can log an unhandled provider cause. */
  onError(error: unknown): Response | Promise<Response>;
  /** Native next() cannot be forcibly cancelled; forward this to cooperative host operations. */
  onSignal?(event: Event, signal: AbortSignal): void;
}

/** Wrap once in the app's middleware file; no bundled Nitro/H3 or Hono runtime. */
export function createNitroMiddleware<Event extends NitroRequestEvent>(
  options: NitroMiddlewareOptions<Event>,
) {
  if (typeof options.toResponse !== "function" || typeof options.onError !== "function")
    throw new TypeError("Native response and error adapters are required");
  const policy = createHttpMiddleware(options);
  return (event: Event, next: () => unknown | Promise<unknown>) =>
    policy(event.req, async (_request, signal) => {
      options.onSignal?.(event, signal);
      try {
        return await options.toResponse(await next(), event);
      } catch (error) {
        return options.onError(error);
      }
    });
}

export function createNitroRequestGuard<
  Event extends NitroRequestEvent,
  Identity,
>(options: {
  verify(request: Request): Promise<Identity>;
  failure(error: unknown): Response;
  assign(event: Event, identity: Identity): void;
}) {
  return async (event: Event, next: () => unknown | Promise<unknown>) => {
    let identity: Identity;
    try {
      identity = await options.verify(event.req);
    } catch (error) {
      return options.failure(error);
    }
    options.assign(event, identity);
    return next();
  };
}

/** Supply this function to native onError. Protocol-specific projections remain explicit. */
export function createNitroErrorHandler(options: ErrorHandlerOptions) {
  const handler = createErrorHandler(options);
  return (failure: unknown) => {
    const wrapped = failure as { unhandled?: unknown; cause?: unknown } | null;
    return handler(
      wrapped?.unhandled === true && wrapped.cause instanceof Error
        ? wrapped.cause
        : failure,
    );
  };
}
