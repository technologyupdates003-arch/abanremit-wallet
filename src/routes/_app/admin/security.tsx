import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminSecurityOverview, adminReplayWebhook } from "@/lib/admin.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/admin/security")({ component: SecurityPage });

function SecurityPage() {
  const fn = useServerFn(adminSecurityOverview);
  const replay = useServerFn(adminReplayWebhook);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["admin","security"], queryFn: () => fn(), refetchInterval: 15000 });
  async function onReplay(id: string) {
    try { await replay({ data: { webhookId: id } }); toast.success("Replayed"); qc.invalidateQueries({ queryKey: ["admin","security"] }); }
    catch (e: any) { toast.error(e.message); }
  }
  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold">Security</h1>

      <Section title="PIN lockouts & failed attempts">
        <table className="w-full text-sm">
          <thead className="text-left text-white/40 text-xs uppercase"><tr>
            <th className="p-3">User</th><th>Failed</th><th>Last failed</th><th>Locked until</th>
          </tr></thead>
          <tbody>
            {(data?.pinAttempts ?? []).map((p: any) => (
              <tr key={p.user_id} className="border-t border-white/5">
                <td className="p-3 text-xs">{p.profiles?.email ?? p.user_id.slice(0,8)}</td>
                <td className="text-red-400 font-mono">{p.failed_count}</td>
                <td className="text-white/40 text-xs">{p.last_failed_at ? new Date(p.last_failed_at).toLocaleString() : "—"}</td>
                <td className="text-amber-400 text-xs">{p.locked_until ? new Date(p.locked_until).toLocaleString() : "—"}</td>
              </tr>
            ))}
            {(!data?.pinAttempts?.length) && <tr><td colSpan={4} className="p-6 text-center text-white/40">No issues</td></tr>}
          </tbody>
        </table>
      </Section>

      <Section title="Stuck webhooks (Paystack transfers)">
        <table className="w-full text-sm">
          <thead className="text-left text-white/40 text-xs uppercase"><tr>
            <th className="p-3">When</th><th>Event</th><th>Reference</th><th></th>
          </tr></thead>
          <tbody>
            {(data?.stuckWebhooks ?? []).map((w: any) => (
              <tr key={w.id} className="border-t border-white/5">
                <td className="p-3 text-xs text-white/40">{new Date(w.created_at).toLocaleString()}</td>
                <td className="text-xs">{w.event}</td>
                <td className="font-mono text-xs">{w.payload?.data?.reference}</td>
                <td><button onClick={() => onReplay(w.id)} className="text-xs text-red-400">Replay</button></td>
              </tr>
            ))}
            {(!data?.stuckWebhooks?.length) && <tr><td colSpan={4} className="p-6 text-center text-white/40">All caught up</td></tr>}
          </tbody>
        </table>
      </Section>
    </div>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02]">
      <div className="px-4 py-3 border-b border-white/5 text-sm font-semibold text-white/70">{title}</div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}
