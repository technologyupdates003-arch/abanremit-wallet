import { GlassCard, PageHeader } from "./shared";
import { Wallet, Building2, Smartphone } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const METHODS = [
  { id: "wallet", label: "To Wallet", icon: Wallet, fee: "0%", time: "Instant" },
  { id: "bank", label: "To Bank", icon: Building2, fee: "1.5%", time: "1-2 hours" },
  { id: "mpesa", label: "To M-Pesa", icon: Smartphone, fee: "1%", time: "Instant" },
] as const;

export function WithdrawPage() {
  const { user } = useAuth();
  const [method, setMethod] = useState<typeof METHODS[number]["id"]>("mpesa");
  const [amount, setAmount] = useState("");
  const [destination, setDestination] = useState("");

  async function submit() {
    if (!user || !amount) return;
    const fee = method === "bank" ? Number(amount) * 0.015 : method === "mpesa" ? Number(amount) * 0.01 : 0;
    const { error } = await supabase.from("withdrawals").insert({
      user_id: user.id, method, amount: Number(amount), currency: "KES" as never, status: "pending",
      fee, destination: { destination } as never,
    });
    if (error) return toast.error(error.message);
    toast.success("Withdrawal initiated");
    setAmount(""); setDestination("");
  }

  const selected = METHODS.find((m) => m.id === method)!;

  return (
    <div className="space-y-6">
      <PageHeader title="Withdraw" subtitle="Cash out to your preferred channel." />
      <div className="grid lg:grid-cols-[1fr_1.2fr] gap-4">
        <GlassCard>
          <div className="space-y-2">
            {METHODS.map((m) => (
              <button key={m.id} onClick={() => setMethod(m.id)} className={`w-full text-left flex items-center gap-3 p-3 rounded-xl ${method === m.id ? "bg-primary/10 ring-1 ring-primary/40" : "hover:bg-surface-2/60"}`}>
                <div className="h-10 w-10 rounded-xl bg-surface-2 flex items-center justify-center"><m.icon className="h-5 w-5 text-primary" /></div>
                <div className="flex-1">
                  <div className="text-sm font-medium">{m.label}</div>
                  <div className="text-xs text-muted-foreground">Fee {m.fee} · {m.time}</div>
                </div>
              </button>
            ))}
          </div>
        </GlassCard>
        <GlassCard>
          <div className="font-display text-lg font-semibold mb-4">Withdraw {selected.label.toLowerCase()}</div>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Destination</Label>
              <Input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder={method === "wallet" ? "ABN-…" : method === "bank" ? "Account number" : "+254…"} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Amount</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="rounded-xl bg-surface-2/60 p-3 text-sm flex items-center justify-between">
              <span className="text-muted-foreground">You'll receive</span>
              <span className="font-mono font-semibold">{Math.max(0, Number(amount || 0) * (1 - (method === "bank" ? 0.015 : method === "mpesa" ? 0.01 : 0))).toFixed(2)}</span>
            </div>
            <Button onClick={submit} disabled={!amount || !destination} className="w-full h-11 gradient-primary glow-primary text-primary-foreground">Withdraw</Button>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
