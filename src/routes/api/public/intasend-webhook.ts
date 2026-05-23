import { createFileRoute } from "@tanstack/react-router";

// Deprecated: IntaSend removed. Kept as no-op to satisfy stale route tree.
export const Route = createFileRoute("/api/public/intasend-webhook")({
  server: {
    handlers: {
      POST: async () => new Response("Gone", { status: 410 }),
      GET: async () => new Response("Gone", { status: 410 }),
    },
  },
});
