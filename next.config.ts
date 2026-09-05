import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  agentRules: false,
  serverExternalPackages: ["pg", "kysely", "pdf-lib"],
  experimental: {
    serverActions: { bodySizeLimit: "12mb" },
  },
  images: { unoptimized: true },
};

export default nextConfig;
