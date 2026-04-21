import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Pin Turbopack workspace root — otherwise it walked up and picked
  // a sibling Next.js project on this machine.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
