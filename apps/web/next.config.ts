import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Let local testing on 127.0.0.1 reach dev resources (dev only).
  allowedDevOrigins: ["127.0.0.1"],
  // Workspace packages ship TypeScript source.
  transpilePackages: ["@wandr/core", "@wandr/db", "@wandr/ai"],
  // Native/wasm DB drivers stay out of the server bundle.
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  async headers() {
    return [
      {
        // Personal links are never indexed or cached (FR-5, N-4).
        source: "/l/:token*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "private, no-store" },
        ],
      },
    ];
  },
};

export default nextConfig;
