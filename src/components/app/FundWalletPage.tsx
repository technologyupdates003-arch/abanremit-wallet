import { GlassCard, PageHeader } from "./shared";
import { CreditCard, Smartphone, Bitcoin, Building2, ArrowRight } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";

const METHODS = [
  { id: "card", label: "Card Payment", icon: CreditCard, body: "Visa, Mastercard, Amex via Stripe" },
  { id: "mpesa", label: "M-Pesa STK Push", icon: Smartphone, body: "IntaSend instant mobile money" },
  { id: "btc", label: "Bitcoin", icon: Bitcoin, body: "On-chain BTC deposit" },
  { id: "bank", label: "Bank Transfer", icon: Building2, body: "Local & international rails" },
] as const;

type MethodId = typeof METHODS[number]["id"];

export function FundWalletPage() {
  const [method, setMethod] = useState<MethodId>("mpesa");
  return (
    <div className="space-y-6">
      <PageHeader title="Fund wallet" subtitle="Top up in seconds via your favorite rail." />
      <div className="grid lg:grid-cols-[1fr_1.2fr] gap-4">
        <GlassCard>
          <div className="space-y-2">
            {METHODS.map((m) => (
              <button key={m.id} onClick={() => setMethod(m.id)} className={`w-full text-left flex items-center gap-3 p-3 rounded-xl transition-all ${method === m.id ? "bg-primary/10 ring-1 ring-primary/40" : "hover:bg-surface-2/60"}`}>
                <div className="h-10 w-10 rounded-xl bg-surface-2 flex items-center justify-center"><m.icon className="h-5 w-5 text-primary" /></div>
                <div className="flex-1">
                  <div className="text-sm font-medium">{m.label}</div>
                  <div className="text-xs text-muted-foreground">{m.body}</div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        </GlassCard>
        <div>
          {method === "card" && <CardForm />}
          {method === "mpesa" && <MpesaForm />}
          {method === "btc" && <BtcDeposit />}
          {method === "bank" && <BankInstructions />}
        </div>
      </div>
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function useDeposit() {
  const { user } = useAuth();
  return async (method: string, amount: number, currency: string, metadata: Record<string, unknown> = {}) => {
    if (!user) return;
    const { error } = await supabase.from("deposits").insert({
      user_id: user.id, method, amount, currency: currency as never, status: "pending", metadata: metadata as never,
    });
    if (error) toast.error(error.message);
    else toast.success("Deposit initiated — awaiting confirmation");
  };
}

function CardForm() {
  const deposit = useDeposit();
  const [amount, setAmount] = useState("100");
  return (
    <GlassCard>
      <div className="font-display text-lg font-semibold mb-4">Card payment</div>
      <div className="space-y-3">
        <FieldRow label="Amount (USD)"><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></FieldRow>
        <FieldRow label="Card number"><Input placeholder="4242 4242 4242 4242" /></FieldRow>
        <div className="grid grid-cols-2 gap-3">
          <FieldRow label="Expiry"><Input placeholder="MM/YY" /></FieldRow>
          <FieldRow label="CVC"><Input placeholder="123" /></FieldRow>
        </div>
      </div>
      <Button onClick={() => deposit("card", Number(amount), "USD")} className="w-full mt-5 h-11 gradient-primary glow-primary text-primary-foreground">
        Pay ${amount}
      </Button>
      <div className="text-[11px] text-muted-foreground mt-3">Hosted by Stripe. PCI-DSS compliant. Cards are tokenized server-side before any wallet credit.</div>
    </GlassCard>
  );
}

function MpesaForm() {
  const deposit = useDeposit();
  const [phone, setPhone] = useState("+254 ");
  const [amount, setAmount] = useState("1000");
  return (
    <GlassCard>
      <div className="font-display text-lg font-semibold mb-4">M-Pesa STK Push</div>
      <div className="space-y-3">
        <FieldRow label="Phone number"><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></FieldRow>
        <FieldRow label="Amount (KES)"><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></FieldRow>
      </div>
      <Button onClick={() => deposit("mpesa", Number(amount), "KES", { phone })} className="w-full mt-5 h-11 gradient-primary glow-primary text-primary-foreground">
        Send STK push
      </Button>
      <div className="text-[11px] text-muted-foreground mt-3">Powered by IntaSend. You'll receive a prompt on your phone — enter your M-Pesa PIN to complete.</div>
    </GlassCard>
  );
}

function BtcDeposit() {
  const { user } = useAuth();
  const { data: wallet } = useQuery({
    queryKey: ["btc-wallet", user?.id],
    queryFn: async () => (await supabase.from("wallets").select("*").eq("currency", "BTC").maybeSingle()).data,
    enabled: !!user,
  });
  const address = wallet?.wallet_number ?? "bc1qaban...wallet";
  return (
    <GlassCard>
      <div className="font-display text-lg font-semibold mb-4">Bitcoin deposit</div>
      <div className="flex flex-col items-center gap-4 py-2">
        <div className="p-4 bg-white rounded-2xl"><QRCodeSVG value={address} size={180} /></div>
        <div className="font-mono text-xs text-center break-all max-w-xs">{address}</div>
        <div className="text-[11px] text-muted-foreground text-center max-w-xs">
          Send only BTC on the Bitcoin network. Deposits credit after 2 confirmations (~20 min).
        </div>
      </div>
    </GlassCard>
  );
}

function BankInstructions() {
  return (
    <GlassCard>
      <div className="font-display text-lg font-semibold mb-4">Bank transfer</div>
      <div className="space-y-3 text-sm">
        {[
          ["Bank", "AbanRemit Trust Bank"],
          ["Account name", "AbanRemit Wallet Ltd"],
          ["Account number", "0123 4567 8901"],
          ["SWIFT / BIC", "ABANKEXX"],
          ["Reference", "Your wallet number"],
        ].map(([k, v]) => (
          <div key={k} className="flex items-center justify-between p-3 rounded-xl bg-surface-2/60">
            <div className="text-muted-foreground text-xs uppercase tracking-wider">{k}</div>
            <div className="font-mono">{v}</div>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}
