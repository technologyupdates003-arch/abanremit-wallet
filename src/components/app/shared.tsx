import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function GlassCard({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={cn("glass-card rounded-3xl p-5 sm:p-6", className)}
    >
      {children}
    </motion.div>
  );
}

export function StatPill({ label, value, delta, positive = true }: { label: string; value: string; delta?: string; positive?: boolean }) {
  return (
    <GlassCard className="!p-5">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-2 font-display text-2xl font-bold">{value}</div>
      {delta && (
        <div className={cn("text-xs mt-1", positive ? "text-success" : "text-destructive")}>
          {positive ? "↑" : "↓"} {delta}
        </div>
      )}
    </GlassCard>
  );
}

export function CountUp({ value, prefix = "", decimals = 2 }: { value: number; prefix?: string; decimals?: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const dur = 900;
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(value * eased);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span>{prefix}{display.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}</span>;
}

export function EmptyState({ icon: Icon, title, body, action }: { icon: React.ComponentType<{ className?: string }>; title: string; body?: string; action?: ReactNode }) {
  return (
    <GlassCard className="text-center py-12">
      <div className="mx-auto h-14 w-14 rounded-2xl glass flex items-center justify-center mb-4">
        <Icon className="h-6 w-6 text-primary" />
      </div>
      <div className="font-display text-lg font-semibold">{title}</div>
      {body && <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </GlassCard>
  );
}
