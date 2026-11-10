import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: { typedEnv: true },
  logging: { fetches: { fullUrl: false } },
};

export default nextConfig;
