import { secureHeaders } from "hono/secure-headers"

export type SecureHeadersOptions = NonNullable<Parameters<typeof secureHeaders>[0]>

export function secureHeadersConfig(options: SecureHeadersOptions = {}) {
  return secureHeaders(options)
}
