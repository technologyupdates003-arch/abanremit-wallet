import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "./auth-middleware";

export const requireAdmin = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const { data, error } = await context.supabase.rpc("is_admin", { _uid: context.userId });
    if (error) throw new Error(error.message);
    if (!data) throw new Response("Forbidden", { status: 403 });
    return next();
  });
