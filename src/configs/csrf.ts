import type { Context, Env, MiddlewareHandler } from "hono"
import { csrf } from "hono/csrf"

export type CsrfOptions<E extends Env = Env> =
  NonNullable<Parameters<typeof csrf>[0]> & {
    // Skip only routes protected by another mechanism (e.g. Better Auth).
    skip?: (context: Context<E>) => boolean | Promise<boolean>
  }

export function csrfConfig<E extends Env = Env>(
  options: CsrfOptions<E> = {},
): MiddlewareHandler<E> {
  const { skip, ...policy } = options
  const middleware = csrf(policy)
  return async (context, next) =>
    (await skip?.(context)) ? next() : middleware(context, next)
}
