import type { NextConfig } from "next";

// BASE_PATH serves the app under a path instead of the site root, e.g. "/offerloop" for
// https://example.com/offerloop. Read at build time: set it before `next build`.
const basePath = (process.env.BASE_PATH ?? "").trim().replace(/\/+$/, "");
if (basePath && !/^\/[\w-]+(\/[\w-]+)*$/.test(basePath)) {
  throw new Error(`BASE_PATH must look like "/offerloop", got "${basePath}".`);
}

// With a base path, the rest of the domain can show another site (e.g. a portfolio):
// PORTFOLIO_URL is fetched for every address outside the base path. Also build time.
const portfolioUrl = (process.env.PORTFOLIO_URL ?? "").trim().replace(/\/+$/, "");

const nextConfig: NextConfig = {
  basePath: basePath || undefined,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  // Tool modules ship TypeScript source; Next compiles them with the app.
  transpilePackages: ["@offerloop/resume-studio", "@offerloop/storage"],
  // Code Practice (the in-app editor) was replaced by DSA Prep (LeetCode lists).
  async redirects() {
    return [
      { source: "/practice", destination: "/dsa", permanent: false },
      // Job Finder moved onto the dashboard as its main feed.
      { source: "/jobs", destination: "/dashboard", permanent: false },
    ];
  },
  async rewrites() {
    if (!basePath || !portfolioUrl) return [];
    // "fallback": only addresses no page of the app answers — so never the app's own pages.
    return {
      beforeFiles: [],
      afterFiles: [],
      fallback: [
        { source: "/", destination: `${portfolioUrl}/`, basePath: false },
        { source: `/:path((?!${basePath.slice(1)}(?:/|$)|_next/).*)`, destination: `${portfolioUrl}/:path`, basePath: false },
      ],
    };
  },
};

export default nextConfig;
