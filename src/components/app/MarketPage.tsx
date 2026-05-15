import { GlassCard, PageHeader } from "./shared";
import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Star, TrendingUp, TrendingDown } from "lucide-react";
import { motion } from "framer-motion";

const MARKETS = [
  { sym: "BTC/USD", base: 67800, vol: "12.4B" },
  { sym: "ETH/USD", base: 3420, vol: "5.2B" },
  { sym: "ABAN/USD", base: 0.8421, vol: "84M" },
  { sym: "USD/KES", base: 128.5, vol: "2.1B" },
  { sym: "EUR/USD", base: 1.082, vol: "98B" },
  { sym: "GBP/USD", base: 1.272, vol: "42B" },
  { sym: "USD/UGX", base: 3720, vol: "180M" },
  { sym: "USD/NGN", base: 1580, vol: "1.2B" },
];

function genSeries(base: number, n = 80) {
  const out: { i: number; v: number }[] = [];
  let v = base;
  for (let i = 0; i < n; i++) {
    v = v * (1 + (Math.random() - 0.5) * 0.012);
    out.push({ i, v });
  }
  return out;
}

export function MarketPage() {
  const [active, setActive] = useState(MARKETS[0].sym);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 2200);
    return () => clearInterval(t);
  }, []);

  const tickers = useMemo(
    () => MARKETS.map((m) => {
      const change = (Math.sin(tick / 3 + m.base) * 2.4).toFixed(2);
      const price = m.base * (1 + Number(change) / 100);
      return { ...m, change, price, up: Number(change) >= 0 };
    }),
    [tick],
  );

  const activeMarket = tickers.find((t) => t.sym === active)!;
  const series = useMemo(() => genSeries(activeMarket.price), [active, tick]);

  return (
    <div className="space-y-6">
      <PageHeader title="Market" subtitle="Live forex, crypto, and Aban Coin pairs." />

      {/* Ticker strip */}
      <div className="overflow-x-auto -mx-4 px-4">
        <div className="flex gap-3 min-w-max">
          {tickers.map((t) => (
            <button key={t.sym} onClick={() => setActive(t.sym)} className={`glass-card rounded-2xl px-4 py-3 min-w-[180px] text-left transition-all ${active === t.sym ? "ring-1 ring-primary/50" : ""}`}>
              <div className="text-xs text-muted-foreground">{t.sym}</div>
              <div className="font-display font-semibold mt-1">{t.price.toLocaleString(undefined, { maximumFractionDigits: 4 })}</div>
              <div className={`text-xs mt-0.5 flex items-center gap-1 ${t.up ? "text-success" : "text-destructive"}`}>
                {t.up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {t.change}%
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-[1.7fr_1fr] gap-4">
        <GlassCard>
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="font-display text-2xl font-bold">{activeMarket.sym}</div>
              <div className={`text-sm ${activeMarket.up ? "text-success" : "text-destructive"}`}>
                {activeMarket.price.toLocaleString(undefined, { maximumFractionDigits: 4 })} · {activeMarket.change}%
              </div>
            </div>
            <Button variant="outline" size="sm" className="rounded-xl"><Star className="h-4 w-4 mr-1.5" />Watchlist</Button>
          </div>
          <div className="h-72">
            <ResponsiveContainer>
              <AreaChart data={series}>
                <defs>
                  <linearGradient id="mkt" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.62 0.24 25)" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="oklch(0.62 0.24 25)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="i" hide />
                <YAxis domain={["dataMin", "dataMax"]} stroke="oklch(0.5 0 0)" fontSize={11} width={60} />
                <Tooltip contentStyle={{ background: "oklch(0.17 0.006 20)", border: "1px solid oklch(0.28 0.008 20)", borderRadius: 12 }} />
                <Area dataKey="v" stroke="oklch(0.62 0.24 25)" strokeWidth={2} fill="url(#mkt)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>

        <GlassCard>
          <div className="font-display text-lg font-semibold mb-3">Trade</div>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <Button className="bg-success/15 text-success hover:bg-success/25 h-11 rounded-xl">Buy</Button>
            <Button className="bg-destructive/15 text-destructive hover:bg-destructive/25 h-11 rounded-xl">Sell</Button>
          </div>
          <div className="space-y-2 text-sm">
            <Row k="Bid" v={(activeMarket.price * 0.9995).toFixed(4)} />
            <Row k="Ask" v={(activeMarket.price * 1.0005).toFixed(4)} />
            <Row k="24h Volume" v={`$${activeMarket.vol}`} />
            <Row k="Spread" v="0.05%" />
          </div>

          <div className="mt-5">
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Order book</div>
            <div className="space-y-0.5">
              {Array.from({ length: 6 }).map((_, i) => (
                <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-3 text-xs font-mono py-1 px-2 rounded">
                  <span className="text-success">{(activeMarket.price * (1 - (i + 1) * 0.0008)).toFixed(4)}</span>
                  <span className="text-right">{(Math.random() * 5 + 0.1).toFixed(3)}</span>
                  <span className="text-right text-muted-foreground">{(Math.random() * 100).toFixed(0)}</span>
                </motion.div>
              ))}
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex items-center justify-between p-2.5 rounded-xl bg-surface-2/60"><span className="text-muted-foreground">{k}</span><span className="font-mono">{v}</span></div>;
}
