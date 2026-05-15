import { cn } from "@/lib/utils";

export function Logo({ className, showText = true }: { className?: string; showText?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="relative">
        <div className="absolute inset-0 blur-xl gradient-primary opacity-60 rounded-xl" />
        <div className="relative h-9 w-9 rounded-xl gradient-primary flex items-center justify-center shadow-lg">
          <svg viewBox="0 0 24 24" className="h-5 w-5 text-primary-foreground" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2 L20 7 L20 17 L12 22 L4 17 L4 7 Z" />
            <path d="M8 10 L12 7 L16 10 L16 15 L12 18 L8 15 Z" fill="currentColor" stroke="none" opacity="0.4" />
          </svg>
        </div>
      </div>
      {showText && (
        <div className="leading-none">
          <div className="font-display font-bold text-[15px] tracking-tight">
            AbanRemit
          </div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mt-0.5">
            Wallet
          </div>
        </div>
      )}
    </div>
  );
}
