import { createFileRoute, redirect, Outlet, Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/brand/Logo";
import { useAuth } from "@/lib/auth-context";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, Wallet, ArrowDownToLine, Send, ArrowUpFromLine,
  TrendingUp, Coins, Receipt, ShieldCheck, User, Settings, LogOut,
  Bell, Search, Menu, X
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_app")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/" });
  },
  component: AppShell,
});

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/wallets", label: "Wallets", icon: Wallet },
  { to: "/fund", label: "Fund Wallet", icon: ArrowDownToLine },
  { to: "/send", label: "Send Money", icon: Send },
  { to: "/withdraw", label: "Withdraw", icon: ArrowUpFromLine },
  { to: "/market", label: "Market", icon: TrendingUp },
  { to: "/aban", label: "Aban Coin", icon: Coins },
  { to: "/transactions", label: "Transactions", icon: Receipt },
  { to: "/kyc", label: "KYC", icon: ShieldCheck },
  { to: "/profile", label: "Profile", icon: User },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

const MOBILE_NAV = [
  { to: "/dashboard", label: "Home", icon: LayoutDashboard },
  { to: "/wallets", label: "Wallets", icon: Wallet },
  { to: "/send", label: "Send", icon: Send, primary: true },
  { to: "/market", label: "Market", icon: TrendingUp },
  { to: "/transactions", label: "Activity", icon: Receipt },
] as const;

function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div className="min-h-screen flex bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-[260px] shrink-0 flex-col border-r border-border/40 bg-sidebar/80 backdrop-blur-xl sticky top-0 h-screen">
        <SidebarBody />
      </aside>

      {/* Mobile sidebar drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 lg:hidden"
            />
            <motion.aside
              initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 280 }}
              className="fixed top-0 left-0 bottom-0 w-[280px] bg-sidebar border-r border-border z-50 lg:hidden"
            >
              <SidebarBody onNavigate={() => setMobileOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar onMenu={() => setMobileOpen(true)} />
        <main className="flex-1 px-4 sm:px-6 lg:px-10 py-6 lg:py-8 pb-28 lg:pb-10 max-w-[1400px] w-full mx-auto">
          <Outlet />
        </main>
        <BottomNav />
      </div>
    </div>
  );
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const nav = useNavigate();
  const { signOut } = useAuth();

  async function handleLogout() {
    await signOut();
    toast.success("Signed out");
    nav({ to: "/" });
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 h-16 flex items-center border-b border-sidebar-border">
        <Logo />
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {NAV.map((item) => {
          const active = path === item.to || path.startsWith(item.to + "/");
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all relative group",
                active
                  ? "bg-primary/10 text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/60"
              )}
            >
              {active && (
                <motion.span
                  layoutId="nav-active"
                  className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-primary"
                  transition={{ type: "spring", damping: 26, stiffness: 320 }}
                />
              )}
              <item.icon className={cn("h-[18px] w-[18px]", active && "text-primary")} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-3 border-t border-sidebar-border">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors"
        >
          <LogOut className="h-[18px] w-[18px]" /> Logout
        </button>
      </div>
    </div>
  );
}

function TopBar({ onMenu }: { onMenu: () => void }) {
  const { user } = useAuth();
  const initial = (user?.user_metadata?.full_name as string | undefined)?.[0] ?? user?.email?.[0]?.toUpperCase() ?? "A";
  return (
    <header className="h-16 border-b border-border/40 bg-background/60 backdrop-blur-xl sticky top-0 z-30">
      <div className="h-full px-4 sm:px-6 lg:px-10 flex items-center gap-3 max-w-[1400px] w-full mx-auto">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenu}>
          <Menu className="h-5 w-5" />
        </Button>
        <div className="lg:hidden flex-1"><Logo showText={false} /></div>
        <div className="hidden lg:flex items-center gap-2 flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              placeholder="Search wallets, transactions, markets…"
              className="w-full h-10 pl-9 pr-3 rounded-xl bg-surface/60 border border-border text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
        </div>
        <div className="flex-1 lg:flex-none" />
        <button className="h-10 w-10 rounded-xl glass flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors relative">
          <Bell className="h-[18px] w-[18px]" />
          <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-primary" />
        </button>
        <Link to="/profile" className="h-10 px-2 rounded-xl glass flex items-center gap-2 hover:bg-surface-2 transition-colors">
          <div className="h-7 w-7 rounded-lg gradient-primary flex items-center justify-center text-xs font-semibold text-primary-foreground">
            {initial}
          </div>
        </Link>
      </div>
    </header>
  );
}

function BottomNav() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 px-3 pb-3 pt-2">
      <div className="glass-card rounded-2xl flex items-center justify-around px-2 py-1.5">
        {MOBILE_NAV.map((item) => {
          const active = path === item.to || path.startsWith(item.to + "/");
          if (item.primary) {
            return (
              <Link key={item.to} to={item.to} className="-mt-7">
                <div className={cn(
                  "h-14 w-14 rounded-2xl gradient-primary glow-primary flex items-center justify-center text-primary-foreground"
                )}>
                  <item.icon className="h-6 w-6" />
                </div>
              </Link>
            );
          }
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl text-[11px] transition-colors",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
