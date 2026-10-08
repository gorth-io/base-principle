// Archived implementation retained for reference.
// import express, { Express, Request, Response, NextFunction } from "express"
// import path from "path";
// import dotenv from 'dotenv';
// import session from "express-session";
// import { createServer } from "http";
// import { Logger } from "@/lib/logger"
// import { corsConfig } from "@/configs/cors"
// import { helmetConfig } from "@/configs/helmet"
// import { morganMiddleware } from "@/configs/morgan"
// import { bodyParserConfig } from "@/configs/body-parser"
// import { cookieParserConfig } from "@/configs/cookie-parser"
//
// export default async function AppModule(): Promise<Express> {
//   const app = express()
//
//   // ================================
//   // 🌐 EXPRESS SERVER CONFIGURATION
//   // ================================
//
//   // CORS must run before sessions, parsers, routes, and authentication so
//   // credentialed OPTIONS preflight requests always receive the correct headers.
//   app.use(
//     corsConfig({
//       origin: [],
//     })
//   )
//
//   app.use(
//     express.urlencoded({
//       extended: true,
//       limit: "50mb",
//     })
//   )
//
//   app.use(helmetConfig())
//   app.use(morganMiddleware())
//   app.use(bodyParserConfig())
//   app.use(cookieParserConfig())
//   app.use(session())
//
//   /* ROUTES */
//
//   app.use((req: Request, res: Response) => {
//     res.status(404).json({
//       error: "Not Found",
//       message: `Route ${req.method} ${req.url} not found`,
//     })
//   })
//
//   app.use((error: Error, req: Request, res: Response, _next: NextFunction) => {
//     console.log(Logger(`Error: ${error}`, "error", "red"))
//     res.status(500).json({
//       error: "Internal Server Error",
//       message: false ? "Something went wrong" : error.message,
//     })
//   })
//
//   return app
// }

import { Hono, type Env } from "hono"
import { configureHono, type HonoConfigOptions } from "../configs/hono"

// Optional factory. Apps can also keep new Hono() at top level.
export function createApplication<E extends Env = Env>(
  options: HonoConfigOptions<E> = {},
): Hono<E> {
  return configureHono(new Hono<E>(), options)
}
