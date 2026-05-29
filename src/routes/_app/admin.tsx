import { createFileRoute, Outlet, Link, useRouterState, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@/lib/use-server-fn";
import { getAdminContext, adminDashboardStats, adminRecentTransactions } from "@/lib/admin.functions";
import { LayoutDashboard, Users, Receipt, ArrowUpFromLine, ShieldCheck, Wallet, TrendingUp, FileText, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_app/admin")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) throw redirect({ to: "/" });
  },
  component: AdminShell,
});

const NAV = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/admin/users", label: "Users", icon: Users },
  { to: "/admin/transactions", label: "Transactions", icon: Receipt },
  { to: "/admin/withdrawals", label: "Withdrawals", icon: ArrowUpFromLine },
  { to: "/admin/kyc", label: "KYC Queue", icon: ShieldCheck },
  { to: "/admin/wallets", label: "Wallets", icon: Wallet },
  { to: "/admin/rates", label: "FX Rates", icon: TrendingUp },
  { to: "/admin/audit", label: "Audit Log", icon: FileText },
  { to: "/admin/security", label: "Security", icon: Lock },
];

function AdminShell() {
  const fetchCtx = useServerFn(getAdminContext);
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "context"],
    queryFn: () => fetchCtx(),
    retry: false,
  });
  const path = useRouterState({ select: s => s.location.pathname });

  if (isLoading) return <div className="p-10 text-muted-foreground">Verifying admin access…</div>;
  if (error || !data) return (
    <div className="p-10">
      <h1 className="text-2xl font-bold text-destructive">Access denied</h1>
      <p className="text-muted-foreground mt-2">Your account does not have admin access.</p>
      <Link to="/dashboard" className="text-primary mt-4 inline-block">Back to dashboard</Link>
    </div>
  );

  return (
    <div data-theme="admin" className="-mx-4 sm:-mx-6 lg:-mx-10 -my-6 lg:-my-8 min-h-[calc(100vh-4rem)] bg-[#0a0a0a] text-white">
      <div className="flex">
        <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-white/10 bg-black/40 backdrop-blur-xl py-4 px-2 sticky top-16 h-[calc(100vh-4rem)]">
          <div className="px-3 py-2 mb-3">
            <div className="text-xs uppercase tracking-widest text-red-500 font-semibold">Operations</div>
            <div className="text-sm text-white/70 mt-0.5">Super Admin</div>
          </div>
          <nav className="flex-1 space-y-0.5">
            {NAV.map(item => {
              const active = item.exact ? path === item.to : path.startsWith(item.to);
              return (
                <Link key={item.to} to={item.to}
                  className={cn("flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors",
                    active ? "bg-red-500/15 text-white border-l-2 border-red-500" : "text-white/60 hover:text-white hover:bg-white/5")}>
                  <item.icon className="h-4 w-4" />{item.label}
                </Link>
              );
            })}
          </nav>
          <div className="px-3 py-2 text-[11px] text-white/40 border-t border-white/5">
            Roles: {data.roles.join(", ") || "admin"}
          </div>
        </aside>
        <div className="flex-1 min-w-0 p-6 lg:p-8">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
