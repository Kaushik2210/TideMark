import type { NextConfig } from "next";

// Fully static site: every page is prerendered and all data is precomputed JSON in public/data,
// so it can be hosted for free on any static host (Vercel, Netlify, GitHub Pages with basePath).
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
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
