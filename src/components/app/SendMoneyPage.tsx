import { GlassCard, PageHeader } from "./shared";
import { Wallet, Smartphone, Building2, CheckCircle2, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { lookupWallet, transferToWallet } from "@/lib/transactions.functions";

export function SendMoneyPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Send money" subtitle="Move value to anyone, anywhere — instantly." />
      <GlassCard className="max-w-2xl">
        <Tabs defaultValue="wallet">
          <TabsList className="grid grid-cols-3 bg-surface-2 rounded-xl p-1 h-auto">
            <TabsTrigger value="wallet" className="data-[state=active]:bg-primary/15 data-[state=active]:text-primary rounded-lg py-2"><Wallet className="h-4 w-4 mr-2" />Wallet</TabsTrigger>
            <TabsTrigger value="phone" className="data-[state=active]:bg-primary/15 data-[state=active]:text-primary rounded-lg py-2"><Smartphone className="h-4 w-4 mr-2" />Phone</TabsTrigger>
            <TabsTrigger value="bank" className="data-[state=active]:bg-primary/15 data-[state=active]:text-primary rounded-lg py-2"><Building2 className="h-4 w-4 mr-2" />Bank</TabsTrigger>
          </TabsList>
          <TabsContent value="wallet" className="mt-5"><SendToWallet /></TabsContent>
          <TabsContent value="phone" className="mt-5"><SendToPhone /></TabsContent>
          <TabsContent value="bank" className="mt-5"><SendToBank /></TabsContent>
        </Tabs>
      </GlassCard>
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

function PinPad({ onConfirm, loading }: { onConfirm: (pin: string) => void; loading?: boolean }) {
  const [pin, setPin] = useState("");
  return (
    <div className="space-y-3">
      <FieldRow label="Transaction PIN">
        <InputOTP maxLength={4} value={pin} onChange={setPin}>
          <InputOTPGroup>
            {[0,1,2,3].map((i) => <InputOTPSlot key={i} index={i} className="bg-surface-2 border-border h-12 w-12" />)}
          </InputOTPGroup>
        </InputOTP>
      </FieldRow>
      <Button disabled={pin.length < 4 || loading} onClick={() => onConfirm(pin)} className="w-full h-11 gradient-primary glow-primary text-primary-foreground">
        Confirm transfer
      </Button>
    </div>
  );
}

function useSend() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return async (params: { type: "send"; amount: number; currency: string; description?: string; counterparty_wallet_id?: string; metadata?: object }) => {
    if (!user) return;
    const { error } = await supabase.from("wallet_transactions").insert({
      user_id: user.id,
      type: "send",
      status: "pending",
      amount: params.amount,
      currency: params.currency as never,
      description: params.description,
      counterparty_wallet_id: params.counterparty_wallet_id,
      metadata: params.metadata as never,
    });
    if (error) return toast.error(error.message);
    toast.success("Transfer queued — processing now");
    qc.invalidateQueries();
  };
}

function SendToWallet() {
  const send = useSend();
  const [walletNum, setWalletNum] = useState("");
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");
  const [step, setStep] = useState<"form" | "pin">("form");

  if (step === "pin") return <PinPad onConfirm={async () => { await send({ type: "send", amount: Number(amount), currency: "USD", description: desc, metadata: { recipient_wallet: walletNum } }); setStep("form"); setWalletNum(""); setAmount(""); }} />;

  return (
    <div className="space-y-3">
      <FieldRow label="Recipient wallet number"><Input value={walletNum} onChange={(e) => setWalletNum(e.target.value)} placeholder="ABN-USD-123456" /></FieldRow>
      <FieldRow label="Amount"><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></FieldRow>
      <FieldRow label="Description (optional)"><Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Rent, gift, payment…" /></FieldRow>
      <Button disabled={!walletNum || !amount} onClick={() => setStep("pin")} className="w-full h-11 gradient-primary glow-primary text-primary-foreground">Continue</Button>
    </div>
  );
}

function SendToPhone() {
  const send = useSend();
  const [phone, setPhone] = useState("+254 ");
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<"form" | "pin">("form");
  if (step === "pin") return <PinPad onConfirm={async () => { await send({ type: "send", amount: Number(amount), currency: "KES", metadata: { recipient_phone: phone } }); setStep("form"); }} />;
  return (
    <div className="space-y-3">
      <FieldRow label="Recipient phone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></FieldRow>
      <FieldRow label="Amount (KES)"><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></FieldRow>
      <Button disabled={!phone || !amount} onClick={() => setStep("pin")} className="w-full h-11 gradient-primary glow-primary text-primary-foreground">Continue</Button>
    </div>
  );
}

function SendToBank() {
  const { user } = useAuth();
  const send = useSend();
  const { data: banks = [] } = useQuery({
    queryKey: ["banks", user?.id],
    queryFn: async () => (await supabase.from("linked_banks").select("*")).data ?? [],
    enabled: !!user,
  });
  const [bankId, setBankId] = useState("");
  const [acct, setAcct] = useState("");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<"form" | "pin">("form");
  if (step === "pin") return <PinPad onConfirm={async () => { await send({ type: "send", amount: Number(amount), currency: "USD", metadata: { bank_id: bankId, account_number: acct, account_name: name } }); setStep("form"); }} />;
  return (
    <div className="space-y-3">
      <FieldRow label="Bank">
        <select value={bankId} onChange={(e) => setBankId(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-input/50 px-3 text-sm">
          <option value="">Select bank…</option>
          {banks.map((b) => <option key={b.id} value={b.id}>{b.bank_name}</option>)}
          <option value="other">Add new bank</option>
        </select>
      </FieldRow>
      <FieldRow label="Account number"><Input value={acct} onChange={(e) => setAcct(e.target.value)} /></FieldRow>
      <FieldRow label="Account name"><Input value={name} onChange={(e) => setName(e.target.value)} /></FieldRow>
      <FieldRow label="Amount (USD)"><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></FieldRow>
      <Button disabled={!acct || !amount} onClick={() => setStep("pin")} className="w-full h-11 gradient-primary glow-primary text-primary-foreground">Continue</Button>
    </div>
  );
}
