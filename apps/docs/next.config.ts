import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@keenai/shared", "fumadocs-ui"],
  experimental: {
    externalDir: true,
  },
};

export default nextConfig;
