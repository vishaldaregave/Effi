import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@effi/design-tokens", "@effi/ui-web", "@effi/auth-contracts"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.convex.cloud", pathname: "/api/storage/**" },
      { protocol: "https", hostname: "**.convex.site", pathname: "/api/storage/**" },
      { protocol: "http", hostname: "127.0.0.1", port: "3210", pathname: "/api/storage/**" },
      { protocol: "http", hostname: "localhost", port: "3210", pathname: "/api/storage/**" },
      { protocol: "http", hostname: "127.0.0.1", port: "3211", pathname: "/api/storage/**" },
      { protocol: "http", hostname: "localhost", port: "3211", pathname: "/api/storage/**" },
      { protocol: "http", hostname: "127.0.0.1", pathname: "/api/storage/**" },
      { protocol: "http", hostname: "localhost", pathname: "/api/storage/**" },
    ],
  },
};
export default nextConfig;
