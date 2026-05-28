import { supabase } from "@/integrations/supabase/client";

/**
 * Invoke a Supabase Edge Function and unwrap errors into thrown Error objects.
 * Used by the *.functions.ts thin client wrappers so component code keeps the
 * same async-throw contract it had under TanStack server functions.
 */
export async function invokeFn<T = unknown>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let msg = error.message || "Request failed";
    const ctx: any = (error as any).context;
    if (ctx && typeof ctx.json === "function") {
      try {
        const j = await ctx.json();
        if (j?.error) msg = j.error;
      } catch { /* ignore */ }
    }
    throw new Error(msg);
  }
  if (data && typeof data === "object" && (data as any).error) {
    throw new Error((data as any).error);
  }
  return data as T;
}
