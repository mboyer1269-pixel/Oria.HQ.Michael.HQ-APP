import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required for Docker standalone build (copies server.js + minimal runtime)
  // See: https://nextjs.org/docs/app/api-reference/config/next-config-js/output
  output: "standalone",
  typedRoutes: true,
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
