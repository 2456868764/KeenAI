import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@keenai/shared"],
  experimental: {
    externalDir: true,
  },
};

export default nextConfig;
