import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The whole portal lives behind auth (cookies/session), so every route is
  // dynamic — Cache Components / partial prerendering doesn't help here.
  cacheComponents: false,
  partialPrefetching: false,
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
