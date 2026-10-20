import type { NextConfig } from "next";

// One id per deploy, baked into both the client bundle and the server, so an open
// tab can tell when a newer version is live (see components/UpdateChecker.tsx)
const BUILD_ID =
  process.env.VERCEL_DEPLOYMENT_ID ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  `local-${Date.now()}`;

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_ID: BUILD_ID,
  },
};

export default nextConfig;
