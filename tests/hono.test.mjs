import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { configureHono, createApplication } from "@gorth/principle"
import { corsConfig } from "@gorth/principle/configs/cors"
import { getCookie, setCookie } from "@gorth/principle/configs/cookie"

const quiet = { logger: false, timing: false, timeout: false }

test("configured app retains identity, request ID, security headers, and 404", async () => {
  const app = new Hono()
  assert.equal(configureHono(app, quiet), app)
  const response = await app.request("/missing")
  assert.equal(response.status, 404)
  assert.ok(response.headers.get("x-request-id"))
  assert.equal(response.headers.get("x-content-type-options"), "nosniff")
})

test("credentialed CORS validates origins and preflight precedes rate limiting", async () => {
  assert.throws(() => corsConfig({ origin: "*", credentials: true }), TypeError)
  let hits = 0
  const app = createApplication({
    ...quiet,
    cors: { origin: ["https://client.example"], credentials: true },
    rateLimit: {
      keyGenerator: () => "client",
      store: {
        increment: () => ({ totalHits: ++hits }),
        decrement() {},
        resetKey() {},
      },
    },
  })
  const response = await app.request("/user", {
    method: "OPTIONS",
    headers: { Origin: "https://client.example", "Access-Control-Request-Method": "POST" },
  })
  assert.equal(response.status, 204)
  assert.equal(response.headers.get("access-control-allow-origin"), "https://client.example")
  assert.equal(response.headers.get("access-control-allow-credentials"), "true")
  assert.equal(hits, 0)
  const denied = await app.request("/user", { headers: { Origin: "https://untrusted.example" } })
  assert.equal(denied.headers.get("access-control-allow-origin"), null)
})

test("CSRF skip covers auth path boundaries while custom cookie routes remain protected", async () => {
  const app = createApplication({
    ...quiet,
    csrf: { skip: (c) => c.req.path === "/auth" || c.req.path.startsWith("/auth/") },
  })
  app.post("*", (c) => c.json({ ok: true }))
  const options = { method: "POST", headers: { "Content-Type": "text/plain", Origin: "https://untrusted.example" }, body: "payload" }
  assert.equal((await app.request("/auth/token", options)).status, 200)
  assert.equal((await app.request("/auth", options)).status, 200)
  assert.equal((await app.request("/authentication", options)).status, 403)
  assert.equal((await app.request("/user", options)).status, 403)
})

test("body limit returns 413 and HTTPException preserves status, body, and auth headers", async () => {
  const app = createApplication({ ...quiet, bodyLimit: { maxSize: 4 } })
  app.post("/payload", (c) => c.json({ ok: true }))
  app.get("/private", () => {
    throw new HTTPException(401, { res: new Response("denied", { status: 401, headers: { "WWW-Authenticate": "Bearer" } }) })
  })
  const large = await app.request("/payload", { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"data":1}' })
  assert.equal(large.status, 413)
  assert.deepEqual(await large.json(), { error: "Payload Too Large" })
  const denied = await app.request("/private")
  assert.equal(denied.status, 401)
  assert.equal(denied.headers.get("www-authenticate"), "Bearer")
  assert.equal(await denied.text(), "denied")
})

test("caller supplied store and skip control rate limiting", async () => {
  const keys = []
  const app = createApplication({
    ...quiet,
    rateLimit: {
      limit: 1,
      keyGenerator: () => "verified-client",
      skip: (c) => c.req.path.startsWith("/auth/"),
      store: {
        increment: (key) => { keys.push(key); return { totalHits: keys.length, resetTime: new Date(Date.now() + 60_000) } },
        decrement() {},
        resetKey() {},
      },
    },
  })
  app.get("*", (c) => c.json({ ok: true }))
  assert.equal((await app.request("/auth/session")).status, 200)
  assert.equal((await app.request("/user")).status, 200)
  const limited = await app.request("/user")
  assert.equal(limited.status, 429)
  assert.deepEqual(await limited.json(), { error: "Too Many Requests" })
  assert.deepEqual(keys, ["verified-client", "verified-client"])
})

test("cookie helpers work without parser and ETag remains opt in", async () => {
  const app = createApplication(quiet)
  app.get("/cookie", (c) => { setCookie(c, "session", "value", { httpOnly: true }); return c.json({ session: getCookie(c, "session") }) })
  const response = await app.request("/cookie", { headers: { Cookie: "session=existing" } })
  assert.deepEqual(await response.json(), { session: "existing" })
  assert.match(response.headers.get("set-cookie"), /HttpOnly/)
  assert.equal(response.headers.get("etag"), null)
})

test("CommonJS root exports load", () => {
  const require = createRequire(import.meta.url)
  const exports = require("@gorth/principle")
  assert.equal(typeof exports.configureHono, "function")
  assert.equal(typeof exports.createApplication, "function")
})
