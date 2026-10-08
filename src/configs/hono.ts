// Archived implementation retained for reference.
// import { Hono } from "hono"
//
// import { bodyLimit } from "hono/body-limit"
// import { compress } from "hono/compress"
// import { cors } from "hono/cors"
// import { csrf } from "hono/csrf"
// import { etag } from "hono/etag"
// import { HTTPException } from "hono/http-exception"
// import { logger } from "hono/logger"
// import { prettyJSON } from "hono/pretty-json"
// import { requestId } from "hono/request-id"
// import { secureHeaders } from "hono/secure-headers"
// import { timeout } from "hono/timeout"
// import { timing } from "hono/timing"
// import { rateLimiter } from "hono-rate-limiter"
//
// export function application() {
//   const app = new Hono()
//
//   app.use("*", requestId())
//   app.use("*", logger())
//   app.use("*", timing())
//   app.use("*", secureHeaders())
//
//   app.use(
//     "*",
//     cors({
//       origin: "*",
//       allowMethods: [
//         "GET",
//         "POST",
//         "PUT",
//         "PATCH",
//         "DELETE",
//         "OPTIONS",
//       ],
//       allowHeaders: [
//         "Content-Type",
//         "Authorization",
//         "X-Requested-With",
//         "X-Request-Id",
//       ],
//       exposeHeaders: [
//         "Content-Length",
//         "X-Request-Id",
//         "Server-Timing",
//       ],
//       credentials: true,
//       maxAge: 86400,
//     }),
//   )
//
//   app.use(
//     "*",
//     csrf({
//       origin: "*",
//     }),
//   )
//
//   app.use(
//     "*",
//     rateLimiter({
//       windowMs: 60_000,
//       limit: 100,
//       standardHeaders: "draft-6",
//       keyGenerator: (c) =>
//         c.req.header("x-forwarded-for") ??
//         c.req.header("x-real-ip") ??
//         "unknown",
//     }),
//   )
//
//   app.use(
//     "*",
//     bodyLimit({
//       maxSize: 10 * 1024 * 1024,
//
//       onError: (c) =>
//         c.json(
//           {
//             error: "Payload Too Large",
//           },
//           413,
//         ),
//     }),
//   )
//
//   app.use(
//     "*",
//     timeout(
//       30_000,
//       () =>
//         new HTTPException(408, {
//           message: "Request Timeout",
//         }),
//     ),
//   )
//
//   app.use("*", compress())
//   app.use("*", etag())
//
//   if (process.env.NODE_ENV === "development") {
//     app.use("*", prettyJSON())
//   }
//
//   app.get("/health", (c) =>
//     c.json({
//       status: "ok",
//       timestamp: new Date().toISOString(),
//     }),
//   )
//
//   app.notFound((c) =>
//     c.json(
//       {
//         error: "Not Found",
//         path: c.req.path,
//       },
//       404,
//     ),
//   )
//
//   app.onError((error, c) => {
//     console.error(error)
//
//     if (error instanceof HTTPException) {
//       return c.json(
//         {
//           error: error.message,
//         },
//         error.status,
//       )
//     }
//
//     return c.json(
//       {
//         error: "Internal Server Error",
//       },
//       500,
//     )
//   })
//
//   return app
// }

import type { Env, ErrorHandler, Hono, Schema } from "hono"
import { compress } from "hono/compress"
import { etag } from "hono/etag"
import { HTTPException } from "hono/http-exception"
import { prettyJSON } from "hono/pretty-json"
import { requestId } from "hono/request-id"
import { timeout } from "hono/timeout"
import { timing } from "hono/timing"

import { bodyLimitConfig, type BodyLimitOptions } from "./body-limit"
import { corsConfig, type CorsOptions } from "./cors"
import { csrfConfig, type CsrfOptions } from "./csrf"
import { loggerConfig, type LogWriter } from "./logger"
import { rateLimitConfig, type RateLimitOptions } from "./rate-limit"
import { secureHeadersConfig, type SecureHeadersOptions } from "./secure-headers"

export interface HonoConfigOptions<E extends Env = Env> {
  development?: boolean
  logger?: false | LogWriter
  timing?: boolean
  secureHeaders?: false | SecureHeadersOptions
  // CORS is enabled only when the app supplies its origin policy.
  cors?: CorsOptions | false
  csrf?: CsrfOptions<E> | false
  // Disabled until the app supplies a store and a trusted client key.
  rateLimit?: RateLimitOptions<E> | false
  bodyLimit?: Partial<BodyLimitOptions> | false
  timeout?: number | false
  // Opt in per runtime/route policy; never cache private auth responses.
  compress?: boolean
  etag?: boolean
  onError?: ErrorHandler<E>
}

// Preserves the concrete Hono type, including app-specific context variables.
// Call once, before registering routes. No env reads, DB access, or listener.
export function configureHono<E extends Env, S extends Schema, BasePath extends string>(
  app: Hono<E, S, BasePath>,
  options: HonoConfigOptions<E> = {},
): Hono<E, S, BasePath> {
  app.use("*", requestId())
  if (options.logger !== false) app.use("*", loggerConfig(options.logger))
  if (options.timing !== false) app.use("*", timing())
  if (options.secureHeaders !== false) {
    app.use("*", secureHeadersConfig(options.secureHeaders))
  }
  // Preflight must finish before CSRF, rate limit and route handlers.
  if (options.cors) app.use("*", corsConfig(options.cors))
  if (options.csrf !== false) app.use("*", csrfConfig<E>(options.csrf))
  if (options.rateLimit) app.use("*", rateLimitConfig<E>(options.rateLimit))
  if (options.bodyLimit !== false) {
    app.use("*", bodyLimitConfig(options.bodyLimit))
  }
  if (options.timeout !== false) {
    app.use("*", timeout(
      options.timeout ?? 30_000,
      () => new HTTPException(408, { message: "Request Timeout" }),
    ))
  }
  if (options.compress) app.use("*", compress())
  if (options.etag) app.use("*", etag())
  if (options.development) app.use("*", prettyJSON())

  app.notFound((context) =>
    context.json({ error: "Not Found", path: context.req.path }, 404),
  )
  app.onError(options.onError ?? ((error, context) => {
    if (error instanceof HTTPException) return error.getResponse()
    console.error("[server-error]", error)
    return context.json({ error: "Internal Server Error" }, 500)
  }))
  return app
}
