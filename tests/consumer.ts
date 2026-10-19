import { Hono } from "hono"
import { configureHono } from "@gorth/principle/configs/hono"
import { MemoryStore } from "@gorth/principle/cores/hono/rate-limiter"

interface AppEnv {
  Variables: { userId: string }
}

const app = new Hono<AppEnv>().basePath("/service")
const configured = configureHono(app, {
  csrf: { skip: (context) => context.get("userId") === "service-user" },
  rateLimit: {
    store: new MemoryStore<AppEnv>(),
    keyGenerator: (context) => context.get("userId"),
  },
  onError: (_error, context) => context.json({ userId: context.get("userId") }, 500),
})

// Context and base path must survive configuration.
const preserved: typeof app = configured
preserved.get("/user", (context) => context.json({ id: context.get("userId") }))
