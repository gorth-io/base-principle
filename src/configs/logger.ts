import { logger } from "hono/logger"

export type LogWriter = Parameters<typeof logger>[0]

export function loggerConfig(writer?: LogWriter) {
  return logger(writer)
}
