import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  createNitroMiddleware,
  createNitroRequestGuard,
  createNitroErrorHandler,
} from "@gorth-io/principle/configs/nitro";
import { errorResponse } from "@gorth-io/principle/modules/error";

// Use an already installed host SDK; do not install/link Nitro into this library.
const host = createRequire(resolve(process.argv[2] ?? ".", "package.json"));
const { H3, toResponse, HTTPError } = await import(
  pathToFileURL(host.resolve("nitro/h3")).href
);
const onError = createNitroErrorHandler({
  project: (error) =>
    error instanceof HTTPError
      ? new Response(error.message, { status: error.status, headers: error.headers })
      : undefined,
});
const app = new H3({ onError });
app.use(
  createNitroMiddleware({
    maxBodySize: 64,
    onError,
    toResponse: (value, event) => toResponse(value, event, event.app?.config),
  }),
);
app.post("/signed", async (event) => new Response(await event.req.text()));
app.get("/denied", () => {
  throw new HTTPError({
    status: 401,
    message: "denied",
    headers: { "WWW-Authenticate": "Bearer" },
  });
});
app.get("/unknown", () => {
  throw new Error("private-provider-fixture");
});
const payload = '{ "signed": "é" }';
const signed = await app.fetch(
  new Request("https://native.test/signed", { method: "POST", body: payload }),
);
assert.equal(signed.status, 200);
assert.equal(await signed.text(), payload);
assert.equal(signed.headers.get("x-content-type-options"), "nosniff");
const oversized = await app.fetch(
  new Request("https://native.test/signed", { method: "POST", body: "x".repeat(65) }),
);
assert.equal(oversized.status, 413);
const protocol = await app.fetch(new Request("https://native.test/denied"));
assert.equal(protocol.status, 401);
assert.equal(protocol.headers.get("www-authenticate"), "Bearer");
assert.equal(protocol.headers.get("x-content-type-options"), "nosniff");
const logs = [];
const previousError = console.error;
let unknown;
try {
  console.error = (...args) => logs.push(args);
  unknown = await app.fetch(new Request("https://native.test/unknown"));
} finally {
  console.error = previousError;
}
assert.equal(unknown.status, 500);
assert.equal((await unknown.text()).includes("private-provider-fixture"), false);
assert.equal(logs.length, 0);
const guarded = new H3();
guarded.use(
  createNitroRequestGuard({
    verify: async () => {
      throw new Error();
    },
    failure: () =>
      errorResponse({
        status: 401,
        code: "invalid_access_token",
        headers: { "WWW-Authenticate": "Bearer" },
      }),
    assign: () => {},
  }),
);
guarded.get("/item", () => ({ never: true }));
const denied = await guarded.fetch(new Request("https://native.test/item"));
assert.equal(denied.status, 401);
assert.equal(denied.headers.get("www-authenticate"), "Bearer");
for (const entry of [
  "configs/nitro",
  "modules/http",
  "modules/error",
  "modules/rate-limit",
  "modules/outbound",
]) {
  assert.ok(Object.keys(hostModule(entry)).length);
  assert.ok(Object.keys(await import(`@gorth-io/principle/${entry}`)).length);
}
function hostModule(entry) {
  return createRequire(import.meta.url)(`@gorth-io/principle/${entry}`);
}
console.log(
  "Native Nitro/H3: raw body, byte limit, protocol headers, sanitized errors, guard and ESM/CJS entries passed.",
);
