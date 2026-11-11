# Shared backend infrastructure

Use narrow public subpaths from `@gorth-io/principle`. Existing Hono integrations
remain available; Nitro hosts do not need to import the Hono configuration.

| Entry | API | Host supplies |
| --- | --- | --- |
| `configs/nitro` | `createNitroMiddleware` | Native `toResponse`, body/CORS/security/timeout/rate policy; optional cooperative cancellation hook |
| `configs/nitro` | `createNitroRequestGuard` | Verifier, failure projection, identity assignment; mount explicitly on protected routes |
| `configs/nitro` | `createNitroErrorHandler` | Explicit domain/native error projection and optional sanitized diagnostics |
| `modules/http` | `createHttpMiddleware` | Web Request/Response callbacks and explicit policy; no env/listener/global store |
| `modules/http` | `checkRequestBody`, `compressHttpResponse` | Reuse byte limits/compression while retaining an existing host middleware's response, quota and proxy policy |
| `modules/error` | `errorResponse`, `createErrorHandler` | Public status/code/headers/details; compatible with Structure's safe projections |
| `modules/rate-limit` | `createRateLimitStore`, `createRequestRateLimit` | Atomic shared storage, namespace, trusted client key, quota and health skip policy |
| `modules/outbound` | `createOutboundClient`, `parseRetryAfter`, `OutboundError` | Exact allowed origins, fetch transport, body/timeout bounds and explicit replay policy |

## Nitro 3 / H3 integration

```ts
import { toResponse, HTTPError, type H3Event } from "nitro/h3";
import { serviceFailure } from "@gorth-io/structure/modules/http";
import { createNitroMiddleware, createNitroErrorHandler } from "@gorth-io/principle/configs/nitro";

const onError = createNitroErrorHandler({
  project(error) {
    if (error instanceof HTTPError) {
      return new Response(error.message, { status: error.status, headers: error.headers });
    }
    return serviceFailure(error);
  },
});

export default createNitroMiddleware<H3Event>({
  maxBodySize: hostBodyLimit,
  onError,
  toResponse: (value, event) => toResponse(value, event, event.app?.config),
  cors: { origins: registeredOrigins, credentials: false },
  rateLimit: {
    limit: hostQuota,
    windowMs: hostWindowMs,
    store: durableStore,
    key: trustedClientKey,
    skip: isHealthProbe,
  },
  onSignal: (event, signal) => { event.context.operationSignal = signal; },
});
```

The adapter uses a structural H3 event and the host's native converter, so it
does not bundle/install a second Nitro/H3 version or require a new runtime peer.
Pass `event.app?.config` to preserve native conversion behavior. The required
`onError` adapter maps public native/domain errors and masks unknown causes
before H3's default unhandled-error logger can see them. Only intentionally
public HTTPError messages should be exposed. Protected routes attach
`createNitroRequestGuard` explicitly; it only catches verifier errors, not domain
handler failures. For example its failure callback can be
`error => errorResponse(authFailure(error))`, using Structure's verifier/projection.

HTTP handling checks a cloned stream's real byte count while leaving the signed
original body untouched. Security/request-ID/rate headers survive error Responses;
multiple cookies and WWW-Authenticate are preserved. CORS finishes preflight before
quota/body processing, requires exact origins (or explicit non-credentialed `*`),
and varies by Origin. Compression is opt-in, honors q=0/no-transform, excludes SSE,
and adjusts length/ETag/Vary. There is no implicit private-response cache or ETag.

The response deadline supplies an AbortSignal; it cannot forcibly stop H3 `next()`
or a database write. The host forwards `operationSignal` to cooperative operations.
Signed webhook verification, cookie-route CSRF, proxy trust and request-specific
auth/ACL remain host responsibilities. No forwarded IP header is trusted implicitly.

## Durable rate limits and outbound SDK workflows

`createRateLimitStore` is structurally compatible with Hono's native Store and
the Web/Nitro policy. The injected storage must atomically increment/reset windows;
there is no Map fallback. Schema, transactions, cleanup and connection lifecycle
remain in the app. Storage outages fail closed at the HTTP boundary.

`createOutboundClient` refuses redirects, sets no-store, bounds private JSON bytes
and uses timeout/caller signals. Requests default to one attempt. Only explicit
retries of 429/502/503/504 are supported; non-GET/HEAD requests additionally require
host-declared idempotency, and streams cannot be replayed. It does not refresh or
cache tokens, keep credentials, or decide service destinations.

```ts
// Native Better Auth constructs client authentication in Structure.
const { url, ...grant } = await createMachineTokenRequest(machineOptions);
const transport = createOutboundClient({ allowedOrigins: registeredTokenOrigins });
const token = parseMachineToken(await transport.json(url, grant));
```

Run `bun run typecheck`, `bun run test:types`, `bun run test`, `bun run build`.
For native integration against an already installed Nitro host, run
`bun run test:nitro ../resource-interaction`; this does not start its app, import
its DB/env configuration, install/link packages or change the consumer.
## Vercel telemetry adapter

`@gorth-io/principle/configs/vercel` exposes `registerVercelTelemetry(serviceName, enabled)`.
The host explicitly enables it only in Vercel, with no external OTLP collector configured.
The adapter uses `@vercel/otel`; it does not implement a tracing transport.
Completed spans retain timing, trace linkage, HTTP method and numeric status. URL/query,
headers, SQL, exception events, links, free-text status and operation names are removed
before the SDK export processor. No application environment is read by the library.

Outbound retry backoff uses the public `createRetryStrategy` export from
`@better-fetch/fetch`. Gorth retains origin allowlists, byte bounds, Retry-After,
request replay policy and cancellation, which the generic SDK does not replace.
