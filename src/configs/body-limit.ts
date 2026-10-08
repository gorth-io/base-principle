import { bodyLimit } from "hono/body-limit"

export type BodyLimitOptions = Parameters<typeof bodyLimit>[0]

export function bodyLimitConfig(options: Partial<BodyLimitOptions> = {}) {
  return bodyLimit({
    maxSize: 10 * 1024 * 1024,
    onError: (context) => context.json({ error: "Payload Too Large" }, 413),
    ...options,
  })
}
