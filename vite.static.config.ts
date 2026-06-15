// Static SPA build config for cPanel deploys.
//
// Usage:   bun run build:static
// Output:  dist-static/   (upload contents to your cPanel public_html)
//
// This config is intentionally separate from vite.config.ts (which drives the
// Lovable / TanStack Start preview + Cloudflare Worker build). It does NOT
// touch the server entry, server functions, or wrangler config.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import path from "node:path";

export default defineConfig({
  // Relative assets keep the cPanel zip working whether the user uploads the
  // files into public_html/ or extracts them into a subfolder. Routing is
  // handled by hash history in src/main.tsx, so deep-link refreshes no longer
  // turn JS chunk requests into index.html on Apache.
  base: "./",
  plugins: [
    tanstackRouter({
      target: "react",
      routesDirectory: "src/routes",
      generatedRouteTree: "src/routeTree.gen.ts",
      autoCodeSplitting: true,
    }),
    react(),
    tsconfigPaths(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    outDir: "dist-static",
    emptyOutDir: true,
    sourcemap: false,
    target: "es2022",
  },
});
