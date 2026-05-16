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
  const { user } = useAuth();
  const qc = useQueryClient();
  const lookup = useServerFn(lookupWallet);
  const transfer = useServerFn(transferToWallet);

  const { data: wallets = [] } = useQuery({
    queryKey: ["wallets", user?.id],
    queryFn: async () => (await supabase.from("wallets").select("*").order("is_primary", { ascending: false })).data ?? [],
    enabled: !!user,
  });

  const [fromId, setFromId] = useState("");
  const [walletNum, setWalletNum] = useState("");
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");
  const [step, setStep] = useState<"form" | "pin" | "done">("form");
  const [recipient, setRecipient] = useState<{ fullName: string; currency: string; walletId: string } | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ reference: string } | null>(null);

  useEffect(() => { if (!fromId && wallets[0]) setFromId(wallets[0].id); }, [wallets, fromId]);
  const fromWallet = wallets.find((w) => w.id === fromId);

  useEffect(() => {
    if (walletNum.length < 6) { setRecipient(null); return; }
    let cancelled = false;
    setLookingUp(true);
    const t = setTimeout(async () => {
      try {
        const r = await lookup({ data: { walletNumber: walletNum.trim() } });
        if (!cancelled) setRecipient(r.found ? { fullName: r.fullName, currency: r.currency, walletId: r.walletId } : null);
      } catch { if (!cancelled) setRecipient(null); }
      finally { if (!cancelled) setLookingUp(false); }
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [walletNum, lookup]);

  if (step === "done" && result) {
    return (
      <div className="text-center space-y-4 py-6">
        <CheckCircle2 className="h-14 w-14 text-success mx-auto" />
        <div>
          <div className="text-lg font-semibold">Transfer complete</div>
          <div className="text-xs text-muted-foreground font-mono mt-1">{result.reference}</div>
        </div>
        <Button onClick={() => { setStep("form"); setWalletNum(""); setAmount(""); setDesc(""); setRecipient(null); setResult(null); }} className="w-full h-11 gradient-primary text-primary-foreground">Done</Button>
      </div>
    );
  }

  if (step === "pin") {
    const onConfirm = async (pin: string) => {
      setSubmitting(true);
      try {
        const r = await transfer({ data: {
          fromWalletId: fromId, toWalletNumber: walletNum.trim(),
          amount: Number(amount), narration: desc || undefined,
          pin, idempotencyKey: crypto.randomUUID(),
        }});
        setResult({ reference: r.reference });
        setStep("done");
        qc.invalidateQueries();
        toast.success("Transfer settled");
      } catch (e) { toast.error((e as Error).message); }
      finally { setSubmitting(false); }
    };
    return <PinPad onConfirm={onConfirm} loading={submitting} />;
  }

  const currencyMismatch = recipient && fromWallet && recipient.currency !== fromWallet.currency;
  const canContinue = !!fromWallet && !!recipient && !currencyMismatch && Number(amount) > 0 && Number(amount) <= Number(fromWallet?.balance ?? 0);

  return (
    <div className="space-y-3">
      <FieldRow label="From wallet">
        <select value={fromId} onChange={(e) => setFromId(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-input/50 px-3 text-sm">
          {wallets.map((w) => <option key={w.id} value={w.id}>{w.currency} · {Number(w.balance).toLocaleString()} · {w.wallet_number}</option>)}
        </select>
      </FieldRow>
      <FieldRow label="Recipient wallet number">
        <Input value={walletNum} onChange={(e) => setWalletNum(e.target.value.toUpperCase())} placeholder="ABN-USD-123456" />
      </FieldRow>
      {lookingUp && <div className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /> Verifying recipient…</div>}
      {recipient && (
        <div className={`text-xs rounded-md px-3 py-2 ${currencyMismatch ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success"}`}>
          {currencyMismatch ? `Currency mismatch — recipient holds ${recipient.currency}` : `Sending to ${recipient.fullName} (${recipient.currency})`}
        </div>
      )}
      {walletNum.length >= 6 && !lookingUp && !recipient && (
        <div className="text-xs rounded-md px-3 py-2 bg-destructive/10 text-destructive">Recipient not found</div>
      )}
      <FieldRow label={`Amount${fromWallet ? ` (${fromWallet.currency})` : ""}`}>
        <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </FieldRow>
      <FieldRow label="Description (optional)"><Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Rent, gift, payment…" /></FieldRow>
      <Button disabled={!canContinue} onClick={() => setStep("pin")} className="w-full h-11 gradient-primary glow-primary text-primary-foreground">Continue</Button>
    </div>
  );
}

function SendToPhone() {
  const b2c = useServerFn(darajaB2CSend);
  const [phone, setPhone] = useState("+254 ");
  const [amount, setAmount] = useState("");
  const [narration, setNarration] = useState("");
  const [step, setStep] = useState<"form" | "pin">("form");
  const [submitting, setSubmitting] = useState(false);

  async function onConfirm(pin: string) {
    setSubmitting(true);
    try {
      const res = await b2c({ data: {
        phone, amount: Math.round(Number(amount)), pin,
        narration: narration || undefined,
      }});
      toast.success(res.message);
      setStep("form"); setPhone("+254 "); setAmount(""); setNarration("");
    } catch (e) { toast.error((e as Error).message); }
    finally { setSubmitting(false); }
  }

  if (step === "pin") return <PinPad onConfirm={onConfirm} loading={submitting} />;
  return (
    <div className="space-y-3">
      <FieldRow label="Recipient phone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+254 7XX XXX XXX" /></FieldRow>
      <FieldRow label="Amount (KES)"><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></FieldRow>
      <FieldRow label="Note (optional)"><Input value={narration} onChange={(e) => setNarration(e.target.value)} /></FieldRow>
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
