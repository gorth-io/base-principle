// Archived implementation retained for reference.
// import type { Request, Response } from "express";
// import morgan from "morgan";
// import pc from "picocolors"
//
// const ansiPattern = /\u001B\[[0-?]*[ -/]*[@-~]/g
// const escapedAnsiPattern = /\\u001b/gi
//
// function canUseColor(): boolean {
//   if (process.env.NO_COLOR !== undefined || process.env.FORCE_COLOR === "0") {
//     return false
//   }
//
//   return (
//     process.env.FORCE_COLOR !== undefined ||
//     process.stdout.isTTY === true ||
//     process.env.NODE_ENV !== "production"
//   )
// }
//
// morgan.token("response-time-ms", (req: Request, res: Response) => {
//   const time = (morgan as any)["response-time"](req, res)
//   if (!time) return "-"
//
//   const num = parseFloat(time)
//   return num >= 2000 ? `${(num / 1000).toFixed(1)}s` : `${Math.round(num)}ms`
// })
//
// // morgan.token("status-color", (req: Request, res: Response) => {
// //   const s = res.statusCode
// //   switch (true) {
// //     case s >= 500:
// //       return pc.red(s)
// //     case s >= 400:
// //       return pc.yellow(s)
// //     case s >= 300:
// //       return pc.cyan(s)
// //     default:
// //       return pc.green(s)
// //   }
// // })
//
// export const morganMiddleware = () => {
//   const useColor = canUseColor()
//   const colors = pc.createColors(useColor)
//   const details =
//     "(HTTP/:http-version, [:date[clf]], content-length: :res[content-length])"
//
//   morgan.token("status-color", (_req: Request, res: Response) => {
//     const status = res.statusCode
//
//     if (status >= 500) return colors.red(status)
//     if (status >= 400) return colors.yellow(status)
//     if (status >= 300) return colors.cyan(status)
//
//     return colors.green(status)
//   })
//
//   const format = useColor
//     ? `:method :url :status-color in :response-time-ms ${colors.dim(details)}`
//     : `:method :url :status in :response-time-ms ${details}`
//
//   return morgan(format, {
//     stream: {
//       write(message: string) {
//         const normalized = message.replace(escapedAnsiPattern, "\u001B")
//
//         process.stdout.write(
//           useColor ? normalized : normalized.replace(ansiPattern, "")
//         )
//       },
//     },
//   })
// }
//
// // export const morganMiddleware = () => {
// //   // app.use(morgan(` :method :url :status-color in :response-time-ms ${`(HTTP/:http-version, [:date[clf]], content-length: :res[content-length])`}`));
// //   return morgan(` :method :url :status-color in :response-time-ms ${pc.dim(`(HTTP/:http-version, [:date[clf]], content-length: :res[content-length])`)}`)
// // }
//
