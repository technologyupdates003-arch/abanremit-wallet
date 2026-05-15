import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminListAudits } from "@/lib/admin.functions";

export const Route = createFileRoute("/_app/admin/audit")({ component: AuditPage });

function AuditPage() {
  const fn = useServerFn(adminListAudits);
  const { data } = useQuery({ queryKey: ["admin","audit"], queryFn: () => fn({ data: { limit: 100, offset: 0 } }) });
  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold">Admin Audit Log</h1>
      <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-white/40 text-xs uppercase"><tr>
            <th className="p-3">When</th><th>Admin</th><th>Action</th><th>Entity</th><th>Metadata</th>
          </tr></thead>
          <tbody>
            {(data?.rows ?? []).map((a: any) => (
              <tr key={a.id} className="border-t border-white/5 align-top">
                <td className="p-3 text-xs text-white/40 whitespace-nowrap">{new Date(a.created_at).toLocaleString()}</td>
                <td className="font-mono text-xs">{a.admin_id?.slice(0,8)}…</td>
                <td><span className="px-2 py-0.5 rounded bg-red-500/10 text-red-400 text-xs">{a.action}</span></td>
                <td className="text-white/70 text-xs">{a.entity}{a.entity_id ? ` · ${a.entity_id.slice(0,8)}…` : ""}</td>
                <td><pre className="text-[11px] text-white/50 whitespace-pre-wrap break-all max-w-md">{JSON.stringify(a.metadata, null, 0)}</pre></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
