import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true
  },
  experimental: {
    webpackBuildWorker: false
  },
  transpilePackages: ["@crypto-bot/shared"],
  allowedDevOrigins: ["127.0.0.1", "localhost"]
};

export default nextConfig;
