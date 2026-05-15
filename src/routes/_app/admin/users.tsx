import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminListUsers } from "@/lib/admin.functions";

export const Route = createFileRoute("/_app/admin/users")({ component: UsersPage });

function UsersPage() {
  const [search, setSearch] = useState("");
  const fn = useServerFn(adminListUsers);
  const { data } = useQuery({
    queryKey: ["admin", "users", search],
    queryFn: () => fn({ data: { search: search || undefined, limit: 50, offset: 0 } }),
  });
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">Users</h1>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search name, email, phone…"
          className="h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm w-72 text-white placeholder:text-white/30"
        />
      </div>
      <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-left text-white/40 text-xs uppercase">
            <tr><th className="p-3">Name</th><th>Email</th><th>Country</th><th>KYC</th><th>Joined</th></tr>
          </thead>
          <tbody>
            {(data?.rows ?? []).map((u: any) => (
              <tr key={u.id} className="border-t border-white/5 hover:bg-white/5">
                <td className="p-3">{u.full_name ?? "—"}</td>
                <td className="text-white/70">{u.email}</td>
                <td>{u.country ?? "—"}</td>
                <td><span className="px-2 py-0.5 rounded text-xs bg-white/10">{u.kyc_status}</span></td>
                <td className="text-white/40 text-xs">{new Date(u.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
            {(!data || data.rows.length === 0) && <tr><td colSpan={5} className="p-8 text-center text-white/40">No users found</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="text-xs text-white/40">Total: {data?.total ?? 0}</div>
    </div>
  );
}
