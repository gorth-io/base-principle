# @gorth-io/principle

Configurable Hono middleware and server integrations for the **gorth-io** ecosystem.

| Includes | Public imports |
| --- | --- |
| HTTP application configuration | `@gorth-io/principle/configs/hono` |
| Middleware configuration | `@gorth-io/principle/configs/*` |
| Application factory | `@gorth-io/principle/modules/application` |
| JOSE and JWT helpers | `@gorth-io/principle/cores/jose`, `cores/jsonwebtoken` |
| Email, OTP, and QR integrations | `@gorth-io/principle/cores/nodemailer`, `cores/otplib`, `cores/qrcode` |

## Installation

Use Node.js 24 and install from the npm registry with Bun:

```bash
bun add @gorth-io/principle
```

Hono is a peer dependency for the HTTP application and middleware entrypoints.
Keep backend imports in server code.

Example dependency declaration (`0.0.0` is a demo version; replace it with an available release):

```json
{
  "dependencies": {
    "@gorth-io/principle": "0.0.0"
  }
}
```

## Configure an existing app

```ts
import { Hono } from "hono"
import { configureHono } from "@gorth-io/principle/configs/hono"

const app = new Hono<AppEnv>()

configureHono(app, {
  development: isDevelopment,
  cors: { origin: allowedOrigins, credentials: true },
  csrf: {
    // Better Auth owns CSRF/origin checks for its own endpoints.
    skip: (c) => c.req.path === "/auth" || c.req.path.startsWith("/auth/"),
    origin: allowedOrigins,
  },
  rateLimit: {
    store: databaseRateLimitStore,
    keyGenerator: getTrustedClientKey,
    skip: (c) => c.req.path === "/auth" || c.req.path.startsWith("/auth/"),
  },
})

app.route("/auth", authRoutes)
app.route("/user", userRoutes)

export default app
```

All values in the example come from the owning app. Call `configureHono` once,
before registering routes. It preserves app bindings, context variables, route
schema and base path. It does not read environment variables, access a database,
mount health routes, create a listener, or validate authentication.

Defaults: request ID, logger, timing, Hono security headers, same-origin CSRF,
10 MiB body limit, 30 second response timeout, 404 and error handlers. CORS and rate
limiting require explicit configuration. Compression and ETag are opt in; pretty
JSON requires `development: true`. Disable configurable middleware with `false`.
The response timeout does not cancel downstream DB/network work. Platform body
limits still apply. Scope compression/ETag to suitable routes when necessary.

`csrf.skip` is app-owned: exclude only endpoints protected by another mechanism.
Bearer authentication and scope checks remain in app route middleware. Rate-limit
configuration requires both a store and key generator; use shared atomic storage
on serverless runtimes and derive keys using the deployment's trusted proxy policy.
Never trust arbitrary forwarded IP headers. Credentialed CORS needs explicit
origins, including when supplied by a callback.

Default HTTPException handling preserves its response and headers. Supply
`onError` for app-specific validation errors; a later `app.onError` or
`app.notFound` may override the shared handlers.

## Public configurations

- `configs/hono`: `configureHono`, `HonoConfigOptions`.
- `configs/body-limit`: `bodyLimitConfig`.
- `configs/cookie`: Hono cookie helpers, including signed cookies.
- `configs/cors`: `corsConfig`, `CorsOptions`.
- `configs/csrf`: `csrfConfig`, with an optional async skip predicate.
- `configs/logger`: `loggerConfig`, with an optional writer.
- `configs/secure-headers`: `secureHeadersConfig`.
- `configs/rate-limit`: `rateLimitConfig`, requiring an explicit store and key.
- `modules/application`: optional `createApplication` factory.

Node server helpers, OpenAPI, validators, mail, OTP, QR and JWT core exports remain
available at their existing public paths. No Express session or multer replacement
is mounted: read request bodies with Hono, use the owning auth system for sessions,
and use the media service/presigned URLs for uploads.

## Next.js applications

Install this package in the Next.js app that uses its backend helpers. Import
specific public subpaths from Route Handlers, Server Actions or server utilities:

```ts
import "server-only"
import { jwtVerify, createRemoteJWKSet } from "@gorth-io/principle/cores/jose"
```

`cores/jose` re-exports all named exports and types from jose; there is no default
export. It is an independent entrypoint and does not import Node server/mail
helpers or Hono configuration. jose uses Web Crypto and supports Web runtimes.
Keep session secrets, private keys, and session/auth operations on the server.
Node-specific entrypoints (Node server, mail and jsonwebtoken) require the Node.js
runtime. Next.js does not require a separate Vite server to use these helpers.
Do not import the package root or backend helpers into Client Components.

jose v6 is ESM. Its CJS wrapper requires a Node version supporting require(esm)
(Node 20.19+, 22.12+, or 23+). Prefer ESM imports in Next.js apps.

## Development

```bash
bun install --frozen-lockfile
bun run build
bun run typecheck
bun run test
```

Tests verify public ESM/CJS exports, typed consumer contracts, and middleware policies.

## Related packages

- [@gorth-io/primitive](https://www.npmjs.com/package/@gorth-io/primitive): React UI, themes, and application components.
- [@gorth-io/structure](https://www.npmjs.com/package/@gorth-io/structure): HTTP, authentication coordination, and data infrastructure.
