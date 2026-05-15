import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminListTransactions } from "@/lib/admin.functions";

export const Route = createFileRoute("/_app/admin/transactions")({ component: TxPage });

function TxPage() {
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const fn = useServerFn(adminListTransactions);
  const { data } = useQuery({
    queryKey: ["admin", "tx", status, type],
    queryFn: () => fn({ data: { status: status || undefined, type: type || undefined, limit: 100, offset: 0 } }),
    refetchInterval: 8000,
  });
  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold">Transactions</h1>
      <div className="flex gap-2">
        <select value={status} onChange={e => setStatus(e.target.value)} className="h-9 px-2 bg-white/5 border border-white/10 rounded-lg text-sm">
          <option value="">All statuses</option>
          {["successful","failed","pending","processing","reversed"].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={type} onChange={e => setType(e.target.value)} className="h-9 px-2 bg-white/5 border border-white/10 rounded-lg text-sm">
          <option value="">All types</option>
          {["wallet_to_wallet","currency_conversion","admin_adjustment","card_funding","bank_withdrawal"].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-white/40 text-xs uppercase"><tr>
            <th className="p-3">Ref</th><th>Type</th><th>Status</th><th className="text-right">Amount</th><th>Currency</th><th>When</th>
          </tr></thead>
          <tbody>
            {(data?.rows ?? []).map((t: any) => (
              <tr key={t.id} className="border-t border-white/5">
                <td className="p-3 font-mono text-xs">{t.reference}</td>
                <td>{t.type}</td>
                <td>{t.status}</td>
                <td className="text-right font-mono">{Number(t.amount).toLocaleString()}</td>
                <td>{t.source_currency}</td>
                <td className="text-white/40 text-xs">{new Date(t.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-xs text-white/40">Total: {data?.total ?? 0}</div>
    </div>
  );
}
