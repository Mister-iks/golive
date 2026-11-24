import path from "node:path";
import type { NextConfig } from "next";

// One .env at the repository root serves the web app and the worker in development.
try {
  process.loadEnvFile(path.resolve(process.cwd(), "../../.env"));
} catch {}

const config: NextConfig = {
  output: "standalone",
  // Trace files from the monorepo root so the standalone server includes workspace packages.
  outputFileTracingRoot: path.resolve(process.cwd(), "../.."),
  transpilePackages: ["@golive/spec", "@golive/packs-sdk", "@golive/packs", "@golive/engine", "@golive/db"],
  serverExternalPackages: ["undici", "postgres", "pg-boss", "pg", "nodemailer"],
  poweredByHeader: false,
  async headers() {
    // PcyBox GoLive passes its own checks.
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""),
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ");
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default config;
