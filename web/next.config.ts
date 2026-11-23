import type { NextConfig } from "next";

// Fully static site: every page is prerendered and all data is precomputed JSON in public/data,
// so it can be hosted for free on any static host (Vercel, Netlify, GitHub Pages with basePath).
const nextConfig: NextConfig = {
  output: "export",
  // Set NEXT_PUBLIC_BASE_PATH=/TideMark when hosting under a sub-path (GitHub Pages project site).
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined,
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
