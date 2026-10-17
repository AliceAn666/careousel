import type { NextConfig } from "next";

const config: NextConfig = {
  devIndicators: false,
  // Prisma 6's engine-free client reads a WASM file at runtime.
  // Ensure Vercel includes that non-JS asset inside all serverless functions.
  outputFileTracingIncludes: {
    "/*": ["./node_modules/.prisma/client/**/*.wasm"],
  },
};

export default config;
