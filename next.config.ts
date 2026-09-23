import type { NextConfig } from "next";

const isGitHubPages = process.env.GITHUB_PAGES === "true";

const nextConfig: NextConfig = {
  ...(isGitHubPages ? {
    output: "export" as const,
    basePath: "/MiniCaja",
    assetPrefix: "/MiniCaja",
    trailingSlash: true,
  } : {}),
};

export default nextConfig;
