// Archived implementation retained for reference.
// import cors, { type CorsOptions } from "cors";
//
// export { default } from "cors";
//
// export const corsOptions: CorsOptions = {
//   credentials: true,
//   methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
//   allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
//   exposedHeaders: ["Set-Cookie", "Authorization"],
//   maxAge: 86400,
//   optionsSuccessStatus: 200,
// }
//
// export const corsConfig = (
//   options?: CorsOptions,
//   // origin?: CorsOptions["origin"],
// ) => {
//   return cors({
//     ...corsOptions,
//     ...options,
//     // ...(origin === undefined ? {} : { origin }),
//   })
// }
//

import { cors } from "hono/cors"

export type CorsOptions = NonNullable<Parameters<typeof cors>[0]>

export const corsOptions: CorsOptions = {
  origin: [],
  credentials: false,
  allowMethods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
  exposeHeaders: ["X-Request-Id", "Server-Timing", "RateLimit-Limit", "RateLimit-Remaining", "RateLimit-Reset"],
  maxAge: 86400,
}

export function corsConfig(options: CorsOptions = {}) {
  const resolved = { ...corsOptions, ...options }
  if (resolved.credentials && resolved.origin === "*") {
    throw new TypeError("Credentialed CORS requires explicit allowed origins")
  }
  return cors(resolved)
}
