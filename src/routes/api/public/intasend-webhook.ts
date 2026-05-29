import { createFileRoute } from "@tanstack/react-router";

// Deprecated: IntaSend removed. Kept as no-op stub so the auto-generated
// route tree (src/routeTree.gen.ts) still resolves.
export const Route = createFileRoute("/api/public/intasend-webhook")({
  server: {
    handlers: {
      POST: async () => new Response("Gone", { status: 410 }),
      GET: async () => new Response("Gone", { status: 410 }),
    },
  },
});
