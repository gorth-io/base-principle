import { expect, it, vi } from "vitest";
vi.mock("@vercel/otel", () => ({ registerOTel: vi.fn() }));
import { registerOTel } from "@vercel/otel";
import { createTelemetryPrivacyProcessor, registerVercelTelemetry } from "../src/configs/vercel";

it("removes URL, authorization, SQL, error text and events before export", () => {
  const span = {
    name: "GET /auth/callback?code=private",
    attributes: {
      "http.request.method": "GET", "http.response.status_code": 200,
      "http.url": "https://sso.test/?code=private",
      authorization: "Bearer private", "db.statement": "SELECT private",
    },
    status: { code: 2, message: "private error" },
    events: [{ name: "private exception" }], links: [{ attributes: { secret: "private" } }],
  };
  createTelemetryPrivacyProcessor().onEnd(span as never);
  expect(JSON.stringify(span)).not.toContain("private");
  expect(span.attributes).toEqual({ "http.request.method": "GET", "http.response.status_code": 200 });
  expect(span.status).toEqual({ code: 2 });
});

it("stays off unless the host explicitly enables the deployment runtime", () => {
  registerVercelTelemetry("fixture", false);
  expect(registerOTel).not.toHaveBeenCalled();
  registerVercelTelemetry("fixture", true);
  expect(registerOTel).toHaveBeenCalledWith(expect.objectContaining({ attributesFromHeaders: {} }));
});
