// Archived implementation retained for reference.
// import session, { type SessionOptions } from "express-session";
// import type { RequestHandler } from "express";
//
// export const sessionOptions = {
//   // secret,
//   // secret: process.env.EXPRESS_JWT_SECRET!,
//   resave: false,
//   saveUninitialized: false,
//   cookie: {
//     // secure: process.env.EXPRESS_ENV === "production",
//     // secure,
//     httpOnly: true,
//     maxAge: 30 * 60 * 60 * 24,
//     sameSite: "lax",
//     // expires: new Date(Date.now() + 1000 * 60 * 60 * 24), // Thời gian hết hạn cookie
//     // domain: process.env.EXPRESS_CLIENT_URL!, // Tùy chọn: tên miền cookie
//     // secure: true, // Chỉ gửi cookie qua HTTPS
//     // sameSite: 'Lax' // Hoặc 'Strict'. 'None' cần secure: true
//     // path: '/', // Phạm vi cookie (thường là gốc)
//   },
// }
//
// export const sessionLimitConfig = (
//   options?: SessionOptions,
//   secret?: string,
//   secure?: boolean
// ): RequestHandler => {
//   return session({
//     ...sessionOptions,
//     secret,
//     ...options,
//     cookie: {
//       ...sessionOptions.cookie,
//       secure
//     }
//   } as any)
// }
//
