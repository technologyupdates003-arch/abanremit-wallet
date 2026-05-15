import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { GlassCard, PageHeader } from "./shared";
import { Button } from "@/components/ui/button";
import { Copy, Plus, QrCode } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { motion } from "framer-motion";

const ALL_CURRENCIES = ["KES", "USD", "EUR", "GBP", "BTC", "ABAN"] as const;

export function WalletsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [qrFor, setQrFor] = useState<{ wallet_number: string; currency: string } | null>(null);

  const { data: wallets = [] } = useQuery({
    queryKey: ["wallets", user?.id],
    queryFn: async () => (await supabase.from("wallets").select("*").order("is_primary", { ascending: false })).data ?? [],
    enabled: !!user,
  });

  const existing = new Set(wallets.map((w) => w.currency));
  const missing = ALL_CURRENCIES.filter((c) => !existing.has(c));

  async function addWallet(currency: typeof ALL_CURRENCIES[number]) {
    const { data: num } = await supabase.rpc("gen_wallet_number" as never, { _currency: currency } as never).single();
    // Fallback: generate client-side if RPC restricted
    const wallet_number = (num as unknown as string) ?? `ABN-${currency}-${Math.floor(100000 + Math.random() * 900000)}`;
    const { error } = await supabase.from("wallets").insert({
      user_id: user!.id, currency, wallet_number, is_primary: false,
    });
    if (error) return toast.error(error.message);
    toast.success(`${currency} wallet created`);
    qc.invalidateQueries({ queryKey: ["wallets"] });
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Wallets" subtitle="Multi-currency accounts. One identity." />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {wallets.map((w, i) => (
          <motion.div key={w.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <GlassCard className="relative overflow-hidden h-full">
              <div className="absolute -top-16 -right-16 h-44 w-44 rounded-full bg-primary/20 blur-3xl" />
              <div className="relative">
                <div className="flex items-center justify-between">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">{w.currency} Wallet</div>
                  {w.is_primary && <span className="text-[10px] uppercase tracking-wider bg-primary/15 text-primary px-2 py-0.5 rounded-full">Primary</span>}
                </div>
                <div className="mt-4 font-display text-3xl font-bold">
                  {Number(w.balance).toLocaleString(undefined, { maximumFractionDigits: 6 })}
                  <span className="text-base text-muted-foreground ml-2">{w.currency}</span>
                </div>
                <div className="mt-5 flex items-center justify-between p-3 rounded-xl bg-surface-2/60 border border-border/40">
                  <div className="font-mono text-sm">{w.wallet_number}</div>
                  <div className="flex gap-1">
                    <button onClick={() => { navigator.clipboard.writeText(w.wallet_number); toast.success("Copied"); }} className="p-1.5 hover:bg-surface-3 rounded-lg">
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => setQrFor(w)} className="p-1.5 hover:bg-surface-3 rounded-lg">
                      <QrCode className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        ))}

        {missing.map((c) => (
          <button key={c} onClick={() => addWallet(c)} className="glass-card rounded-3xl p-6 border-dashed text-left hover:border-primary/40 transition-colors group">
            <div className="h-10 w-10 rounded-xl bg-surface-2 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
              <Plus className="h-5 w-5 text-muted-foreground group-hover:text-primary" />
            </div>
            <div className="mt-4 font-display font-semibold">Add {c} wallet</div>
            <div className="text-xs text-muted-foreground mt-1">Generate a new {c} account number</div>
          </button>
        ))}
      </div>

      <Dialog open={!!qrFor} onOpenChange={(o) => !o && setQrFor(null)}>
        <DialogContent className="max-w-sm bg-surface border-border">
          <DialogHeader><DialogTitle>Receive on {qrFor?.currency}</DialogTitle></DialogHeader>
          {qrFor && (
            <div className="flex flex-col items-center gap-4 py-2">
              <div className="p-4 bg-white rounded-2xl">
                <QRCodeSVG value={qrFor.wallet_number} size={200} />
              </div>
              <div className="font-mono text-sm">{qrFor.wallet_number}</div>
              <Button onClick={() => { navigator.clipboard.writeText(qrFor.wallet_number); toast.success("Copied"); }} className="w-full gradient-primary text-primary-foreground">
                Copy wallet number
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
