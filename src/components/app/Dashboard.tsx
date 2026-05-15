import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Link } from "@tanstack/react-router";
import { GlassCard, PageHeader, CountUp, StatPill } from "./shared";
import { ArrowDownToLine, Send, ArrowUpFromLine, TrendingUp, Eye, EyeOff, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useMemo } from "react";
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import { motion } from "framer-motion";

const FX: Record<string, number> = { USD: 1, KES: 0.0078, EUR: 1.08, GBP: 1.27, BTC: 68000, ABAN: 0.84 };

export function Dashboard() {
  const { user } = useAuth();
  const [hidden, setHidden] = useState(false);

  const { data: wallets = [] } = useQuery({
    queryKey: ["wallets", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("wallets").select("*").order("is_primary", { ascending: false });
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: txs = [] } = useQuery({
    queryKey: ["recent-tx", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("wallet_transactions").select("*").order("created_at", { ascending: false }).limit(6);
      return data ?? [];
    },
    enabled: !!user,
  });

  const totalUsd = useMemo(
    () => wallets.reduce((s, w) => s + Number(w.balance) * (FX[w.currency] ?? 0), 0),
    [wallets],
  );

  const chartData = useMemo(() => {
    const seed = totalUsd || 1000;
    return Array.from({ length: 30 }, (_, i) => ({
      d: i,
      v: seed * (0.85 + Math.sin(i / 3) * 0.07 + Math.random() * 0.05),
    }));
  }, [totalUsd]);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  })();
  const name = (user?.user_metadata?.full_name as string | undefined)?.split(" ")[0] ?? "there";

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${greeting}, ${name}`}
        subtitle="Here's what's moving across your wallets today."
      />

      {/* Hero balance */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="relative overflow-hidden rounded-3xl glass-card p-6 sm:p-8">
        <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-primary/30 blur-[100px]" />
        <div className="relative grid lg:grid-cols-[1.1fr_1fr] gap-8 items-center">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Total balance
              <button onClick={() => setHidden((h) => !h)} className="text-muted-foreground hover:text-foreground">
                {hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
            <div className="mt-3 font-display text-5xl sm:text-6xl font-bold tracking-tight">
              {hidden ? "••••••" : <><span className="text-muted-foreground text-3xl mr-1.5">$</span><CountUp value={totalUsd} /></>}
            </div>
            <div className="text-sm text-success mt-2">↑ $128.42 (1.84%) today</div>

            <div className="mt-6 flex flex-wrap gap-2">
              <QuickAction to="/fund" icon={ArrowDownToLine} label="Fund" />
              <QuickAction to="/send" icon={Send} label="Send" primary />
              <QuickAction to="/withdraw" icon={ArrowUpFromLine} label="Withdraw" />
              <QuickAction to="/market" icon={TrendingUp} label="Trade" />
            </div>
          </div>

          <div className="h-40 -mx-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.62 0.24 25)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="oklch(0.62 0.24 25)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="d" hide />
                <YAxis hide domain={["dataMin", "dataMax"]} />
                <Tooltip contentStyle={{ background: "oklch(0.17 0.006 20)", border: "1px solid oklch(0.28 0.008 20 / 0.6)", borderRadius: 12 }} labelStyle={{ color: "oklch(0.68 0.01 20)" }} />
                <Area dataKey="v" stroke="oklch(0.62 0.24 25)" strokeWidth={2.5} fill="url(#bg)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatPill label="Wallets" value={String(wallets.length)} delta="2 active" />
        <StatPill label="24h volume" value="$2,418" delta="12.4%" />
        <StatPill label="Aban Coin" value="$0.8421" delta="4.16%" />
        <StatPill label="KYC Tier" value="Tier 1" delta="Verified" />
      </div>

      {/* Wallets + transactions */}
      <div className="grid lg:grid-cols-[1.1fr_1fr] gap-4">
        <GlassCard>
          <div className="flex items-center justify-between mb-4">
            <div className="font-display text-lg font-semibold">Your wallets</div>
            <Link to="/wallets" className="text-xs text-primary hover:underline">View all</Link>
          </div>
          <div className="space-y-2">
            {wallets.slice(0, 4).map((w) => (
              <Link key={w.id} to="/wallets" className="flex items-center justify-between p-3 rounded-xl hover:bg-surface-2/60 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl gradient-primary/20 bg-primary/10 flex items-center justify-center font-mono text-xs font-semibold">
                    {w.currency}
                  </div>
                  <div>
                    <div className="text-sm font-medium">{w.currency} Wallet</div>
                    <div className="text-[11px] text-muted-foreground font-mono">{w.wallet_number}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-display font-semibold">{Number(w.balance).toLocaleString(undefined, { maximumFractionDigits: 4 })}</div>
                  <div className="text-[11px] text-muted-foreground">{w.currency}</div>
                </div>
              </Link>
            ))}
            <Link to="/wallets">
              <Button variant="outline" className="w-full mt-2 border-dashed h-11 rounded-xl">
                <Plus className="h-4 w-4 mr-2" /> Add new wallet
              </Button>
            </Link>
          </div>
        </GlassCard>

        <GlassCard>
          <div className="flex items-center justify-between mb-4">
            <div className="font-display text-lg font-semibold">Recent activity</div>
            <Link to="/transactions" className="text-xs text-primary hover:underline">View all</Link>
          </div>
          {txs.length === 0 ? (
            <div className="text-sm text-muted-foreground py-12 text-center">No transactions yet. Fund your wallet to get started.</div>
          ) : (
            <div className="space-y-2">
              {txs.map((t) => (
                <div key={t.id} className="flex items-center justify-between p-2.5 rounded-xl hover:bg-surface-2/60">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-surface-2 flex items-center justify-center capitalize text-xs">
                      {t.type[0]}
                    </div>
                    <div>
                      <div className="text-sm capitalize">{t.type.replace("_", " ")}</div>
                      <div className="text-[11px] text-muted-foreground">{new Date(t.created_at).toLocaleString()}</div>
                    </div>
                  </div>
                  <div className="text-right text-sm font-medium font-mono">
                    {Number(t.amount).toLocaleString()} {t.currency}
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  );
}

function QuickAction({ to, icon: Icon, label, primary }: { to: string; icon: React.ComponentType<{ className?: string }>; label: string; primary?: boolean }) {
  return (
    <Link to={to}>
      <Button className={primary ? "gradient-primary glow-primary text-primary-foreground rounded-xl h-11 px-5" : "rounded-xl h-11 px-5 bg-surface-2 hover:bg-surface-3 text-foreground"}>
        <Icon className="h-4 w-4 mr-2" /> {label}
      </Button>
    </Link>
  );
}
