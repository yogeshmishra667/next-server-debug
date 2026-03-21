import { defineConfig } from "tsup";

export default defineConfig([
  // Client bundle — includes "use client" banner
  {
    entry: { index: "src/index.ts" },
    format: ["cjs", "esm"],
    dts: true,
    clean: true,
    external: ["react", "react-dom", "next"],
    splitting: false,
    sourcemap: true,
    treeshake: false,
    esbuildOptions(options) {
      options.banner = {
        js: '"use client";',
      };
    },
  },
  // Server bundle — no "use client" banner
  {
    entry: { server: "src/server.ts" },
    format: ["cjs", "esm"],
    dts: true,
    clean: false,
    external: ["react", "react-dom", "next"],
    splitting: false,
    sourcemap: true,
    treeshake: true,
  },
  // Prisma plugin — server-only
  {
    entry: { prisma: "src/prisma.ts" },
    format: ["cjs", "esm"],
    dts: true,
    clean: false,
    external: ["react", "react-dom", "next"],
    splitting: false,
    sourcemap: true,
    treeshake: true,
  },
  // Drizzle plugin — server-only
  {
    entry: { drizzle: "src/drizzle.ts" },
    format: ["cjs", "esm"],
    dts: true,
    clean: false,
    external: ["react", "react-dom", "next"],
    splitting: false,
    sourcemap: true,
    treeshake: true,
  },
]);
