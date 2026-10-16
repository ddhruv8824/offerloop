import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
};

export default nextConfig;
