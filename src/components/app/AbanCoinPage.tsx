import { GlassCard, PageHeader, StatPill } from "./shared";
import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

function gen(base = 0.84, n = 90) {
  let v = base;
  return Array.from({ length: n }).map((_, i) => {
    v = v * (1 + (Math.random() - 0.48) * 0.018);
    return { i, v };
  });
}

export function AbanCoinPage() {
  const { user } = useAuth();
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 1800); return () => clearInterval(t); }, []);
  const series = useMemo(() => gen(0.84 + Math.sin(tick / 4) * 0.04), [tick]);
  const last = series[series.length - 1].v;
  const first = series[0].v;
  const change = ((last - first) / first) * 100;

  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("100");

  async function place() {
    if (!user) return;
    const { error } = await supabase.from("market_orders").insert({
      user_id: user.id, symbol: "ABAN/USD", side, amount: Number(amount), price: last, status: "completed",
    });
    if (error) return toast.error(error.message);
    toast.success(`${side === "buy" ? "Bought" : "Sold"} ${amount} ABAN @ $${last.toFixed(4)}`);
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Aban Coin" subtitle="The native asset of the AbanRemit ecosystem." />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatPill label="Price" value={`$${last.toFixed(4)}`} delta={`${change.toFixed(2)}%`} positive={change >= 0} />
        <StatPill label="Market Cap" value="$84.2M" delta="2.1%" />
        <StatPill label="24h Volume" value="$8.4M" delta="14.2%" />
        <StatPill label="Holders" value="42,184" delta="320" />
      </div>

      <div className="grid lg:grid-cols-[1.7fr_1fr] gap-4">
        <GlassCard>
          <div className="font-display text-lg font-semibold mb-3">ABAN/USD</div>
          <div className="h-80">
            <ResponsiveContainer>
              <AreaChart data={series}>
                <defs>
                  <linearGradient id="ab" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.62 0.24 25)" stopOpacity={0.55} />
                    <stop offset="100%" stopColor="oklch(0.62 0.24 25)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="i" hide />
                <YAxis domain={["dataMin", "dataMax"]} stroke="oklch(0.5 0 0)" fontSize={11} width={60} />
                <Tooltip contentStyle={{ background: "oklch(0.17 0.006 20)", border: "1px solid oklch(0.28 0.008 20)", borderRadius: 12 }} />
                <Area dataKey="v" stroke="oklch(0.62 0.24 25)" strokeWidth={2.5} fill="url(#ab)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>
        <GlassCard>
          <div className="grid grid-cols-2 gap-2 mb-4 p-1 bg-surface-2 rounded-xl">
            <button onClick={() => setSide("buy")} className={`h-10 rounded-lg text-sm font-medium ${side === "buy" ? "bg-success/20 text-success" : "text-muted-foreground"}`}>Buy</button>
            <button onClick={() => setSide("sell")} className={`h-10 rounded-lg text-sm font-medium ${side === "sell" ? "bg-destructive/20 text-destructive" : "text-muted-foreground"}`}>Sell</button>
          </div>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Amount (ABAN)</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="rounded-xl bg-surface-2/60 p-3 text-sm flex justify-between">
              <span className="text-muted-foreground">Total</span>
              <span className="font-mono">${(Number(amount) * last).toFixed(2)}</span>
            </div>
            <Button onClick={place} className={`w-full h-11 ${side === "buy" ? "gradient-primary glow-primary" : "bg-destructive"} text-primary-foreground`}>
              {side === "buy" ? "Buy ABAN" : "Sell ABAN"}
            </Button>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
