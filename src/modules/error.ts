export interface HttpFailure {
  status: number;
  code: string;
  headers?: HeadersInit;
  details?: Record<string, unknown>;
}

/** Accepts Structure's ServiceFailure/AuthFailure structurally, without a runtime dependency. */
export function errorResponse(failure: HttpFailure): Response {
  if (
    !Number.isInteger(failure.status) ||
    failure.status < 400 ||
    failure.status > 599 ||
    !/^[a-z][a-z0-9_]{0,127}$/.test(failure.code)
  )
    return Response.json({ error: "internal_server_error" }, { status: 500 });
  return Response.json(
    { ...failure.details, error: failure.code },
    {
      status: failure.status,
      headers: failure.headers,
    },
  );
}

export interface ErrorHandlerOptions {
  project(error: unknown): HttpFailure | Response | undefined;
  onUnexpected?(error: unknown): void;
}

export function createErrorHandler(options: ErrorHandlerOptions) {
  return function handleError(error: unknown): Response {
    const projected = options.project(error);
    if (projected)
      return projected instanceof Response ? projected : errorResponse(projected);
    options.onUnexpected?.(error);
    return errorResponse({ status: 500, code: "internal_server_error" });
  };
}
