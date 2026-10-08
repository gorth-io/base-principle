// Archived implementation retained for reference.
// import rateLimit, { type Options, type RateLimitRequestHandler } from "express-rate-limit";
//
// export const rateLimitOptions: Partial<Options> = {
//   windowMs: 15 * 60 * 1000,
//   limit: 100,
//   message: "Too many requests. Please try again later.",
//   standardHeaders: "draft-8",
//   legacyHeaders: false,
//   passOnStoreError: false,
//   // statusCode: 500,
//   // identifier: "GORTH",
//   // requestPropertyName: "",
//   // skipFailedRequests: true,
//   // skipSuccessfulRequests: false,
//   // keyGenerator: "GORTH",
// }
//
// export const rateLimitConfig = (
//   options?: Partial<Options>,
// ): RateLimitRequestHandler => {
//   return rateLimit({
//     ...rateLimitOptions,
//     ...options,
//     handler: options?.handler ??
//     ((request, response, next, rateLimitOptions) => {
//       response.status(rateLimitOptions.statusCode).json({
//         status: rateLimitOptions.statusCode,
//         code: "TOO_MANY_REQUESTS",
//         message: "Too many requests. Please try again later.",
//         retryAfter: response.getHeader("Retry-After") ?? null,
//         path: request.originalUrl,
//       });
//     }),
//   });
// };
//

import type { Env, MiddlewareHandler } from "hono"
import { rateLimiter, type HonoConfigProps, type Store } from "hono-rate-limiter"

// Explicit store and key generator: apps own persistence and trusted proxy policy.
export type RateLimitOptions<E extends Env = Env> = HonoConfigProps<E> & {
  store: Store<E>
}

export const rateLimitOptions = {
  windowMs: 60_000,
  limit: 100,
  standardHeaders: "draft-6",
  message: { error: "Too Many Requests" },
} as const

export function rateLimitConfig<E extends Env = Env>(
  options: RateLimitOptions<E>,
): MiddlewareHandler<E> {
  return rateLimiter<E>({ ...rateLimitOptions, ...options })
}
