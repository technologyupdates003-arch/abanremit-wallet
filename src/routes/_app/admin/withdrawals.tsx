import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/lib/use-server-fn";
import { adminListWithdrawals, adminRejectWithdrawal, adminB2cPayout } from "@/lib/admin.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/admin/withdrawals")({ component: WPage });

function WPage() {
  const [status, setStatus] = useState("pending");
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [narration, setNarration] = useState("");
  const [sending, setSending] = useState(false);

  const list = useServerFn(adminListWithdrawals);
  const reject = useServerFn(adminRejectWithdrawal);
  const payout = useServerFn(adminB2cPayout);
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["admin", "wd", status],
    queryFn: () => list({ data: { status: status || undefined, limit: 100, offset: 0 } }),
    refetchInterval: 8000,
  });

  async function onReject(id: string) {
    const reason = window.prompt("Reason for rejecting / reversing this withdrawal?");
    if (!reason) return;
    try {
      await reject({ data: { withdrawalId: id, reason } });
      toast.success("Withdrawal reversed");
      qc.invalidateQueries({ queryKey: ["admin", "wd"] });
    } catch (e: any) { toast.error(e.message); }
  }

  async function onPayout() {
    const amt = Number(amount);
    if (!phone || !amt) { toast.error("Phone and amount required"); return; }
    if (!window.confirm(`Send KES ${amt.toLocaleString()} to ${phone} via M-Pesa B2C?`)) return;
    setSending(true);
    try {
      const r = await payout({ data: { phone, amount: amt, narration: narration || undefined } });
      toast.success(`Payout dispatched · ${r.reference}`);
      setPhone(""); setAmount(""); setNarration("");
      qc.invalidateQueries({ queryKey: ["admin", "wd"] });
    } catch (e: any) { toast.error(e.message); }
    finally { setSending(false); }
  }

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold">Withdrawals</h1>

      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
        <h2 className="text-sm font-semibold text-white/80">M-Pesa B2C payout (admin float)</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="2547XXXXXXXX"
            className="h-9 px-3 bg-white/5 border border-white/10 rounded-lg text-sm" />
          <input value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount KES" type="number"
            className="h-9 px-3 bg-white/5 border border-white/10 rounded-lg text-sm" />
          <input value={narration} onChange={e => setNarration(e.target.value)} placeholder="Narration (optional)"
            className="h-9 px-3 bg-white/5 border border-white/10 rounded-lg text-sm md:col-span-1" />
          <button onClick={onPayout} disabled={sending}
            className="h-9 px-3 bg-emerald-500/80 hover:bg-emerald-500 rounded-lg text-sm font-medium disabled:opacity-50">
            {sending ? "Sending…" : "Send B2C"}
          </button>
        </div>
        <p className="text-xs text-white/40">Dispatches directly from your Daraja float. No user wallet is debited.</p>
      </div>

      <select value={status} onChange={e => setStatus(e.target.value)} className="h-9 px-2 bg-white/5 border border-white/10 rounded-lg text-sm">
        {["pending","queued","processing","completed","failed","reversed"].map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-white/40 text-xs uppercase"><tr>
            <th className="p-3">User</th><th>Reference</th><th className="text-right">Amount</th><th>Currency</th><th>Method</th><th>Status</th><th></th>
          </tr></thead>
          <tbody>
            {(data?.rows ?? []).map((w: any) => (
              <tr key={w.id} className="border-t border-white/5">
                <td className="p-3">{w.profiles?.full_name ?? w.profiles?.email ?? "—"}</td>
                <td className="font-mono text-xs">{w.reference}</td>
                <td className="text-right font-mono">{Number(w.amount).toLocaleString()}</td>
                <td>{w.currency}</td>
                <td>{w.method}</td>
                <td>{w.status}</td>
                <td>
                  {["pending","queued","processing","completed"].includes(w.status) && (
                    <button onClick={() => onReject(w.id)} className="text-xs text-red-400 hover:text-red-300">Reverse</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
