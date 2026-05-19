import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@keenai/ui", "@keenai/shared"],
  experimental: {
    externalDir: true,
  },
};

export default nextConfig;
