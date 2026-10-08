/// <reference types="node" />

import { defineConfig } from "tsdown"

export default defineConfig({
  clean: true,
  dts: true,
  fixedExtension: false,
  // Keep shared modules (e.g. React contexts) in common chunks
  // so different entrypoints consume the same runtime instance.
  // splitting: true,
  entry: [
    "src/index.ts",
    "src/lib/*.ts",
    "src/cores/**/*.ts",
    // Archived Express configs remain in source, but are not published.
    "src/configs/body-limit.ts",
    "src/configs/cookie.ts",
    "src/configs/cors.ts",
    "src/configs/csrf.ts",
    "src/configs/hono.ts",
    "src/configs/logger.ts",
    "src/configs/nodemailer.ts",
    "src/configs/otplib.ts",
    "src/configs/qrcode.ts",
    "src/configs/rate-limit.ts",
    "src/configs/secure-headers.ts",
    "src/modules/*.ts",
  ],
  format: ["esm", "cjs"],
  sourcemap: false,
  minify: false,
  target: "es2024",
  outDir: "dist",
  treeshake: true,
})
