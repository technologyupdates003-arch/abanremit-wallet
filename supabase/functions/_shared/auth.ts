import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export type AuthCtx = {
  userId: string;
  supabase: SupabaseClient;
  admin: SupabaseClient;
};

export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export async function requireAuth(req: Request): Promise<AuthCtx> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) throw new Error("Unauthorized");
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Unauthorized");
  return { userId: data.user.id, supabase, admin: adminClient() };
}

export async function requireAdmin(req: Request): Promise<AuthCtx> {
  const ctx = await requireAuth(req);
  const { data } = await ctx.admin
    .from("admin_roles")
    .select("role")
    .eq("user_id", ctx.userId)
    .limit(1);
  if (!data || data.length === 0) throw new Error("Forbidden");
  return ctx;
}
