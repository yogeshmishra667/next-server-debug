import type { NextConfig } from "next";
import { withServerDebug } from "next-server-debug/plugin";

const nextConfig: NextConfig = {
  transpilePackages: ["next-server-debug"],
};

export default withServerDebug(nextConfig, {
  thresholds: { slow: 100, critical: 500 },
});
