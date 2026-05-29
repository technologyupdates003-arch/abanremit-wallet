import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/lib/use-server-fn";
import { adminListUsers, adminGetUser, adminAdjustBalance, adminSetWalletStatus } from "@/lib/admin.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/admin/wallets")({ component: WalletsPage });

function WalletsPage() {
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const listFn = useServerFn(adminListUsers);
  const getUser = useServerFn(adminGetUser);
  const adjust = useServerFn(adminAdjustBalance);
  const setStatus = useServerFn(adminSetWalletStatus);
  const qc = useQueryClient();

  const users = useQuery({ queryKey: ["admin","users-pick", search], queryFn: () => listFn({ data: { search: search||undefined, limit: 20, offset: 0 } }) });
  const detail = useQuery({ queryKey: ["admin","user-detail", picked], queryFn: () => getUser({ data: { userId: picked! } }), enabled: !!picked });

  async function onAdjust(walletId: string, direction: "credit"|"debit") {
    const amountStr = window.prompt(`Amount to ${direction}?`);
    const amount = Number(amountStr);
    if (!amount || amount <= 0) return;
    const reason = window.prompt("Reason (min 5 chars)?");
    if (!reason || reason.length < 5) return;
    try {
      const r = await adjust({ data: { walletId, amount, direction, reason } });
      toast.success(`Done · ref ${r.reference}`);
      qc.invalidateQueries({ queryKey: ["admin","user-detail"] });
    } catch (e: any) { toast.error(e.message); }
  }
  async function onStatus(walletId: string, status: "active"|"frozen"|"closed") {
    const reason = window.prompt("Reason (min 5 chars)?");
    if (!reason || reason.length < 5) return;
    try {
      await setStatus({ data: { walletId, status, reason } });
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["admin","user-detail"] });
    } catch (e: any) { toast.error(e.message); }
  }

  return (
    <div className="grid lg:grid-cols-[320px_1fr] gap-6">
      <div className="space-y-3">
        <h1 className="font-display text-2xl font-bold">Wallets</h1>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search user…"
          className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white" />
        <div className="rounded-xl border border-white/10 bg-white/[0.02] divide-y divide-white/5 max-h-[70vh] overflow-y-auto">
          {(users.data?.rows ?? []).map((u: any) => (
            <button key={u.id} onClick={() => setPicked(u.id)}
              className={`w-full text-left p-3 hover:bg-white/5 ${picked === u.id ? "bg-white/10" : ""}`}>
              <div className="text-sm">{u.full_name ?? u.email}</div>
              <div className="text-xs text-white/40">{u.email}</div>
            </button>
          ))}
        </div>
      </div>
      <div>
        {!picked && <div className="text-white/40 text-sm">Pick a user to manage wallets.</div>}
        {detail.data && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">{detail.data.profile?.full_name ?? detail.data.profile?.email}</h2>
              <div className="text-xs text-white/40">{detail.data.profile?.email} · KYC: {detail.data.profile?.kyc_status}</div>
            </div>
            <div className="grid gap-3">
              {(detail.data.wallets as any[]).map(w => (
                <div key={w.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs text-white/40 font-mono">{w.wallet_number}</div>
                      <div className="font-display text-2xl font-bold">{w.currency} {Number(w.balance).toLocaleString()}</div>
                      <div className="text-xs text-white/40">Locked: {Number(w.locked_balance).toLocaleString()} · Status: {w.status}</div>
                    </div>
                    <div className="flex flex-wrap gap-2 justify-end">
                      <button onClick={() => onAdjust(w.id, "credit")} className="px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 text-sm">Credit</button>
                      <button onClick={() => onAdjust(w.id, "debit")} className="px-3 py-1.5 rounded-lg bg-red-500/15 text-red-400 text-sm">Debit</button>
                      {w.status === "active"
                        ? <button onClick={() => onStatus(w.id, "frozen")} className="px-3 py-1.5 rounded-lg bg-amber-500/15 text-amber-400 text-sm">Freeze</button>
                        : <button onClick={() => onStatus(w.id, "active")} className="px-3 py-1.5 rounded-lg bg-white/10 text-white/70 text-sm">Unfreeze</button>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
