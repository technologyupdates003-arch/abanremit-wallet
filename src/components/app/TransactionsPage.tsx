import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { GlassCard, PageHeader, EmptyState } from "./shared";
import { Input } from "@/components/ui/input";
import { Receipt, Search } from "lucide-react";
import { useState } from "react";

const STATUS_STYLES: Record<string, string> = {
  completed: "bg-success/15 text-success",
  pending: "bg-warning/15 text-warning",
  failed: "bg-destructive/15 text-destructive",
  reversed: "bg-muted text-muted-foreground",
};

export function TransactionsPage() {
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");

  const { data: txs = [] } = useQuery({
    queryKey: ["txs", user?.id],
    queryFn: async () => (await supabase.from("wallet_transactions").select("*").order("created_at", { ascending: false }).limit(200)).data ?? [],
    enabled: !!user,
  });

  const filtered = txs.filter((t) =>
    (status === "all" || t.status === status) &&
    (q === "" || t.type.includes(q.toLowerCase()) || (t.description ?? "").toLowerCase().includes(q.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Transactions" subtitle="A complete, exportable audit log of every move." />

      <GlassCard>
        <div className="flex flex-wrap gap-3 items-center mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search type, description…" className="pl-9 bg-surface-2 border-border" />
          </div>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-10 rounded-md border border-input bg-surface-2 px-3 text-sm">
            {["all", "pending", "completed", "failed", "reversed"].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {filtered.length === 0 ? (
          <EmptyState icon={Receipt} title="No transactions yet" body="Your wallet activity will appear here." />
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                <tr><th className="text-left p-3">Type</th><th className="text-left p-3">Description</th><th className="text-right p-3">Amount</th><th className="text-left p-3">Status</th><th className="text-left p-3">Date</th></tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id} className="border-t border-border/30 hover:bg-surface-2/40">
                    <td className="p-3 capitalize">{t.type.replace("_", " ")}</td>
                    <td className="p-3 text-muted-foreground">{t.description || "—"}</td>
                    <td className="p-3 text-right font-mono">{Number(t.amount).toLocaleString()} {t.currency}</td>
                    <td className="p-3"><span className={`px-2 py-1 rounded-md text-xs ${STATUS_STYLES[t.status] ?? ""}`}>{t.status}</span></td>
                    <td className="p-3 text-muted-foreground text-xs">{new Date(t.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
