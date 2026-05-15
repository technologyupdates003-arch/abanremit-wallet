import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/Logo";
import { Shield, TrendingUp, Zap, Globe } from "lucide-react";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen w-full grid lg:grid-cols-[1.05fr_1fr] bg-background relative overflow-hidden">
      {/* Left: brand stage */}
      <div className="hidden lg:flex relative overflow-hidden border-r border-border/40">
        <div className="absolute inset-0 grid-pattern opacity-40" />
        <div className="absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full bg-primary/30 blur-[120px]" />
        <div className="absolute -bottom-40 -right-20 h-[420px] w-[420px] rounded-full bg-primary/20 blur-[140px]" />

        <div className="relative z-10 flex flex-col justify-between w-full p-12 xl:p-16">
          <Logo />

          <div className="space-y-8">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full glass px-3 py-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                Borderless finance
              </div>
              <h1 className="mt-5 font-display text-5xl xl:text-6xl font-bold leading-[1.05] tracking-tight">
                Move money like
                <br />
                <span className="text-gradient-primary">it's 2050.</span>
              </h1>
              <p className="mt-5 max-w-md text-base text-muted-foreground leading-relaxed">
                Multi-currency wallets, instant transfers, M-Pesa, card payments, crypto and live markets — engineered for the new global generation.
              </p>
            </div>

            {/* Floating stat cards */}
            <div className="grid grid-cols-2 gap-4 max-w-md">
              <FloatingCard delay={0.15}>
                <div className="text-xs text-muted-foreground">Total volume</div>
                <div className="font-display text-2xl font-bold mt-1">$2.4B+</div>
                <div className="text-[11px] text-success mt-1">↑ 18.2% this quarter</div>
              </FloatingCard>
              <FloatingCard delay={0.3}>
                <div className="text-xs text-muted-foreground">Aban Coin</div>
                <div className="font-display text-2xl font-bold mt-1">$0.8421</div>
                <div className="text-[11px] text-success mt-1">↑ 4.16% 24h</div>
              </FloatingCard>
            </div>

            <div className="grid grid-cols-2 gap-3 max-w-md">
              {[
                { icon: Shield, label: "Bank-grade security" },
                { icon: Zap, label: "Instant settlement" },
                { icon: Globe, label: "30+ corridors" },
                { icon: TrendingUp, label: "Live markets" },
              ].map((f, i) => (
                <motion.div
                  key={f.label}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 + i * 0.06 }}
                  className="flex items-center gap-2.5 text-sm text-muted-foreground"
                >
                  <div className="h-8 w-8 rounded-lg glass flex items-center justify-center">
                    <f.icon className="h-4 w-4 text-primary" />
                  </div>
                  {f.label}
                </motion.div>
              ))}
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} AbanRemit. Regulated where required.
          </div>
        </div>
      </div>

      {/* Right: form */}
      <div className="relative flex items-center justify-center p-6 sm:p-10">
        <div className="lg:hidden absolute top-6 left-6"><Logo /></div>
        <div className="absolute inset-0 lg:hidden">
          <div className="absolute -top-32 -right-32 h-80 w-80 rounded-full bg-primary/20 blur-[100px]" />
        </div>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="relative w-full max-w-md mt-16 lg:mt-0"
        >
          {children}
        </motion.div>
      </div>
    </div>
  );
}

function FloatingCard({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="glass-card rounded-2xl p-4"
    >
      {children}
    </motion.div>
  );
}

export function AuthFooter({ children }: { children: ReactNode }) {
  return <div className="text-center text-sm text-muted-foreground mt-6">{children}</div>;
}

export function AuthLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="text-primary hover:text-primary-glow font-medium transition-colors">
      {children}
    </Link>
  );
}
