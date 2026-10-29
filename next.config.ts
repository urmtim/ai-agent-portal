import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The whole portal lives behind auth (cookies/session), so every route is
  // dynamic — Cache Components / partial prerendering doesn't help here.
  cacheComponents: false,
  partialPrefetching: false,
  // guardrail documents (up to 4 MB) arrive in a server action; their parsers stay plain Node packages
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
  serverExternalPackages: ["mammoth", "unpdf"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
