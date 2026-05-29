import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/lib/use-server-fn";
import { adminKycQueue, adminReviewKyc } from "@/lib/admin.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/admin/kyc")({ component: KycPage });

function KycPage() {
  const list = useServerFn(adminKycQueue);
  const review = useServerFn(adminReviewKyc);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["admin", "kyc-queue"], queryFn: () => list(), refetchInterval: 10000 });
  async function act(id: string, action: "approve"|"reject"|"request_resubmission") {
    let reason: string | undefined;
    if (action !== "approve") {
      reason = window.prompt("Reason?") ?? undefined;
      if (!reason) return;
    }
    try {
      await review({ data: { documentId: id, action, reason, tier: action==="approve" ? 1 : undefined } });
      toast.success("Done");
      qc.invalidateQueries({ queryKey: ["admin", "kyc-queue"] });
    } catch (e: any) { toast.error(e.message); }
  }
  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold">KYC Queue</h1>
      <div className="grid gap-3">
        {(data ?? []).map((k: any) => (
          <div key={k.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <div className="flex justify-between items-start gap-4">
              <div>
                <div className="font-semibold">{k.profiles?.full_name ?? "—"} <span className="text-white/40 text-sm">{k.profiles?.email}</span></div>
                <div className="text-xs text-white/50 mt-1">{k.doc_type} · submitted {new Date(k.created_at).toLocaleString()}</div>
                <div className="text-xs text-white/40 mt-1">Front: {k.front_path ?? "—"} · Back: {k.back_path ?? "—"}</div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => act(k.id, "approve")} className="px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 text-sm">Approve</button>
                <button onClick={() => act(k.id, "reject")} className="px-3 py-1.5 rounded-lg bg-red-500/15 text-red-400 text-sm">Reject</button>
                <button onClick={() => act(k.id, "request_resubmission")} className="px-3 py-1.5 rounded-lg bg-white/10 text-white/70 text-sm">Resubmit</button>
              </div>
            </div>
          </div>
        ))}
        {(!data || data.length === 0) && <div className="text-white/40 text-sm">Queue empty.</div>}
      </div>
    </div>
  );
}
