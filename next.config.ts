import type { NextConfig } from "next";
// Permit only this Codespace's port-3000 preview, never every GitHub preview.
const codespaceHost = process.env.CODESPACE_NAME
  ? `${process.env.CODESPACE_NAME}-3000.app.github.dev`
  : null;
const config: NextConfig = {
  devIndicators: false,
  allowedDevOrigins: codespaceHost ? [codespaceHost] : [],
};
export default config;
