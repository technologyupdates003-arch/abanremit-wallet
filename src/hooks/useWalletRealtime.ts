import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";

export function useWalletRealtime() {
  const qc = useQueryClient();
  const { user } = useAuth();
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel(`wallet-rt-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "wallets", filter: `user_id=eq.${user.id}` },
        () => { qc.invalidateQueries({ queryKey: ["wallets"] }); })
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions", filter: `user_id=eq.${user.id}` },
        () => { qc.invalidateQueries({ queryKey: ["transactions"] }); qc.invalidateQueries({ queryKey: ["wallets"] }); })
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => { qc.invalidateQueries({ queryKey: ["notifications"] }); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, qc]);
}
