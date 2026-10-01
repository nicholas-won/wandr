import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: ["@wandr/core", "@wandr/db", "@wandr/ai"],
  // Native/wasm DB drivers stay out of the server bundle.
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  turbopack: {
    resolveAlias: {
      // packages/db/src/pglite.ts imports "./migrate-files", which uses a `new URL(dir,
      // import.meta.url)` Turbopack can't bundle. See src/lib/db/migrate-files-shim.ts.
      "./migrate-files": "./src/lib/db/migrate-files-shim.ts",
    },
  },
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
