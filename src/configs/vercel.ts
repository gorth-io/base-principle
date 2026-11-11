import { registerOTel, type Configuration } from "@vercel/otel";

type Processor = Exclude<NonNullable<Configuration["spanProcessors"]>[number], string>;

/** Keep timing, trace linkage and numeric status; never export request/SQL/error content. */
export function createTelemetryPrivacyProcessor(): Processor {
  return {
    onStart() {},
    onEnd(span) {
      const attributes: Record<string, string | number> = {};
      for (const key of ["http.request.method", "http.method", "http.response.status_code", "http.status_code"]) {
        const value = span.attributes[key];
        if (typeof value === "number" ||
            (typeof value === "string" && /^(GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)$/.test(value)))
          attributes[key] = value;
      }
      // Runs before the SDK's export processor sees the completed span.
      Object.assign(span, {
        name: "application.operation",
        attributes,
        events: [],
        links: [],
        status: { code: span.status.code },
      });
    },
    async shutdown() {},
    async forceFlush() {},
  };
}

/** The host explicitly permits the Vercel runtime; shared config never reads env. */
export function registerVercelTelemetry(serviceName: string, enabled: boolean) {
  if (!enabled) return;
  registerOTel({
    serviceName,
    autoDetectResources: false,
    resourceDetectors: [],
    attributesFromHeaders: {},
    spanProcessors: [createTelemetryPrivacyProcessor(), "auto"],
    instrumentationConfig: {
      fetch: {
        attributesFromRequestHeaders: {},
        attributesFromResponseHeaders: {},
        propagateContextUrls: [],
      },
    },
  });
}
