import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Pin Turbopack workspace root — otherwise it walked up to a
  // stray ~/package-lock.json and served a sibling project's pages.
  turbopack: {
    root: path.resolve(__dirname),
  },

  // Prisma 7 loads its query compiler as dynamic-imported wasm subpaths
  // (query_compiler_fast_bg.postgresql.wasm-base64.mjs) that aren't
  // listed in @prisma/client's package.json `exports` field. Turbopack
  // refuses to resolve them via subpath exports, so we mark the
  // packages as server-externals — Node resolves them at runtime
  // instead of Turbopack trying to bundle them.
  serverExternalPackages: [
    "@prisma/client",
    "@prisma/adapter-pg",
    "@/generated/prisma",
  ],
};

export default nextConfig;
