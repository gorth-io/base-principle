// Archived implementation retained for reference.
// import helmet, { type HelmetOptions } from "helmet";
//
// export const helmetOptions: HelmetOptions = {
//   crossOriginOpenerPolicy: { policy: "unsafe-none" },
//   crossOriginResourcePolicy: { policy: "cross-origin" },
//   contentSecurityPolicy: false,
// }
//
// export const helmetConfig = (options?: HelmetOptions) => {
//   return helmet({
//     ...helmetOptions,
//     ...options,
//   })
//   // app.use(
//   //   helmet({
//   //     crossOriginOpenerPolicy: { policy: "unsafe-none" },
//   //     crossOriginResourcePolicy: { policy: "cross-origin" },
//   //     contentSecurityPolicy: false,
//   //   })
//   // )
//   // app.use(
//   //   helmet.crossOriginResourcePolicy({
//   //     policy: "cross-origin",
//   //   })
//   // )
//   // app.use(helmet({
//   //   crossOriginResourcePolicy: { policy: "cross-origin" },
//   //   contentSecurityPolicy: false, // Disable if causes issues with assets
//   // }));
// }
//
