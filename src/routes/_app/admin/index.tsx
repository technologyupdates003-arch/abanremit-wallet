import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminDashboardStats, adminRecentTransactions } from "@/lib/admin.functions";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_app/admin/")({ component: AdminDashboard });

function AdminDashboard() {
  const stats = useServerFn(adminDashboardStats);
  const recent = useServerFn(adminRecentTransactions);
  const s = useQuery({ queryKey: ["admin", "stats"], queryFn: () => stats(), refetchInterval: 15000 });
  const r = useQuery({ queryKey: ["admin", "recent-tx"], queryFn: () => recent(), refetchInterval: 10000 });

  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    const ch = supabase.channel("admin-tx-feed")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "transactions" }, () => {
        setPulse(p => p + 1);
        r.refetch();
        s.refetch();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [r, s]);

  const d = (s.data ?? {}) as any;
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">Operations Dashboard</h1>
          <p className="text-white/50 text-sm mt-1">Live system overview · {pulse} events this session</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-emerald-400">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" /> Realtime connected
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Total users" value={d.users_total ?? 0} sub={`+${d.users_24h ?? 0} (24h)`} />
        <Kpi label="Transactions (24h)" value={d.tx_24h ?? 0} sub={`${d.tx_failed_24h ?? 0} failed`} />
        <Kpi label="Pending KYC" value={d.kyc_pending ?? 0} accent />
        <Kpi label="Pending withdrawals" value={d.withdrawals_pending ?? 0} accent={Number(d.withdrawals_pending) > 0} />
        <Kpi label="Failed withdrawals (24h)" value={d.withdrawals_failed_24h ?? 0} />
        <Kpi label="Stuck webhooks" value={d.webhooks_unprocessed ?? 0} />
        <Kpi label="Wallets" value={d.wallets_total ?? 0} />
        <Kpi label="Custody (KES)" value={Number((d.wallets_balance_by_ccy ?? {}).KES ?? 0).toLocaleString()} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel title="Custody by currency">
          <div className="space-y-2">
            {Object.entries((d.wallets_balance_by_ccy ?? {}) as Record<string, number>).map(([ccy, total]) => (
              <div key={ccy} className="flex justify-between text-sm">
                <span className="text-white/60">{ccy}</span>
                <span className="font-mono">{Number(total).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Volume 24h">
          <div className="space-y-2">
            {Object.entries((d.tx_volume_24h ?? {}) as Record<string, number>).map(([ccy, total]) => (
              <div key={ccy} className="flex justify-between text-sm">
                <span className="text-white/60">{ccy}</span>
                <span className="font-mono text-red-400">{Number(total).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
              </div>
            ))}
            {!d.tx_volume_24h || Object.keys(d.tx_volume_24h).length === 0 ? <div className="text-white/40 text-sm">No volume yet</div> : null}
          </div>
        </Panel>
      </div>

      <Panel title="Live transaction feed">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-white/40 text-xs uppercase">
              <tr><th className="py-2">Reference</th><th>Type</th><th>Status</th><th className="text-right">Amount</th><th>When</th></tr>
            </thead>
            <tbody>
              {(r.data ?? []).map((t: any) => (
                <tr key={t.id} className="border-t border-white/5">
                  <td className="py-2 font-mono text-xs">{t.reference}</td>
                  <td>{t.type}</td>
                  <td><StatusPill status={t.status} /></td>
                  <td className="text-right font-mono">{t.source_currency} {Number(t.amount).toLocaleString()}</td>
                  <td className="text-white/50 text-xs">{new Date(t.created_at).toLocaleTimeString()}</td>
                </tr>
              ))}
              {(!r.data || r.data.length === 0) && <tr><td colSpan={5} className="py-6 text-center text-white/40">No transactions yet</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function Kpi({ label, value, sub, accent }: { label: string; value: any; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 backdrop-blur-xl ${accent ? "bg-red-500/5 border-red-500/30" : "bg-white/[0.02] border-white/10"}`}>
      <div className="text-[11px] uppercase tracking-wider text-white/50">{label}</div>
      <div className="mt-1 font-display text-2xl font-bold">{String(value)}</div>
      {sub && <div className="text-xs text-white/40 mt-0.5">{sub}</div>}
    </div>
  );
}
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] backdrop-blur-xl p-5">
      <h2 className="text-sm font-semibold text-white/70 mb-4">{title}</h2>
      {children}
    </div>
  );
}
function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    successful: "bg-emerald-500/15 text-emerald-400",
    failed: "bg-red-500/15 text-red-400",
    processing: "bg-amber-500/15 text-amber-400",
    pending: "bg-white/10 text-white/60",
    reversed: "bg-purple-500/15 text-purple-400",
  };
  return <span className={`px-2 py-0.5 rounded-md text-xs ${map[status] ?? "bg-white/10 text-white/60"}`}>{status}</span>;
}
