// Shim for `useServerFn` so the same components work in both the TanStack Start
// runtime (Lovable preview) and the static SPA build (cPanel deploy).
//
// All our *.functions.ts wrappers are already plain async fns that call
// `supabase.functions.invoke(...)` (see src/lib/invoke-fn.ts), so we just hand
// the function back unchanged — no RPC wrapping needed.
export function useServerFn<T extends (...args: any[]) => any>(fn: T): T {
  return fn;
}
