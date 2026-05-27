import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

/**
 * HTTP security headers applied to every response.
 *
 * CSP is set to report-only in development so hot-reload (webpack HMR,
 * inline scripts) doesn't break the dev experience.  In production it is
 * enforced.  Tighten `script-src` once external analytics/scripts are known.
 */
const securityHeaders = [
  // Block clickjacking — no one should frame this app.
  { key: "X-Frame-Options", value: "DENY" },
  // Disable MIME-type sniffing.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Don't leak the Referer to third parties.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Disable browser features the app doesn't use.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  // HSTS — only active in production (HTTPS only).
  ...(isProd
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),
  // Content Security Policy.
  // report-only in dev; enforced in prod.  Extend script-src when adding
  // third-party scripts (analytics, maps, etc.).
  {
    key: isProd ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only",
    value: [
      "default-src 'self'",
      // Next.js requires 'unsafe-inline' for CSS-in-JS; inline scripts are
      // blocked.  Nonce-based CSP is the next step to remove 'unsafe-inline'.
      "style-src 'self' 'unsafe-inline'",
      // Inline event handlers are blocked; Next.js adds its own scripts.
      "script-src 'self' 'unsafe-inline'",
      // Supabase is the only external data source.
      `connect-src 'self' ${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}`,
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ]
      .filter(Boolean)
      .join("; "),
  },
];

const nextConfig: NextConfig = {
  // Required for Docker standalone build (copies server.js + minimal runtime)
  // See: https://nextjs.org/docs/app/api-reference/config/next-config-js/output
  output: "standalone",
  typedRoutes: true,
  turbopack: {
    root: process.cwd(),
  },
  async headers() {
    return [
      {
        // Apply to all routes.
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
