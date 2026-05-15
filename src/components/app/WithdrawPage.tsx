import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wallet, Building2, Smartphone, ChevronRight, ChevronLeft,
  ShieldCheck, Plus, Trash2, Star, Loader2, CheckCircle2, XCircle,
  Clock, Lock, Receipt,
} from "lucide-react";
import { GlassCard, PageHeader } from "./shared";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  listBanks, resolveAccount, addLinkedBank, setDefaultBank, deleteLinkedBank,
  setTransactionPin, hasTransactionPin, initiateWithdrawal,
} from "@/lib/transfers.functions";

type WalletRow = { id: string; currency: "KES" | "USD" | "EUR" | "GBP" | "ABAN"; balance: number; wallet_number: string; is_primary: boolean };
type LinkedBank = {
  id: string; user_id: string; bank_name: string; bank_code: string | null;
  account_number: string; account_name: string;
  currency: WalletRow["currency"] | null; is_default: boolean; recipient_code: string | null;
};

const STEPS = ["method", "beneficiary", "amount", "review"] as const;
type Step = typeof STEPS[number];

export function WithdrawPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [step, setStep] = useState<Step>("method");
  const [method, setMethod] = useState<"bank" | "wallet" | "mpesa">("bank");
  const [walletId, setWalletId] = useState<string>("");
  const [bankId, setBankId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [narration, setNarration] = useState("");
  const [pin, setPin] = useState("");
  const [showAddBank, setShowAddBank] = useState(false);
  const [showSetPin, setShowSetPin] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resultId, setResultId] = useState<string | null>(null);

  const initFn = useServerFn(initiateWithdrawal);
  const hasPinFn = useServerFn(hasTransactionPin);

  const { data: wallets } = useQuery({
    queryKey: ["wallets", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("wallets").select("*").eq("user_id", user!.id).order("is_primary", { ascending: false });
      return (data ?? []) as WalletRow[];
    },
  });

  const { data: banks, refetch: refetchBanks } = useQuery({
    queryKey: ["linked-banks", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("linked_banks").select("*").eq("user_id", user!.id).order("is_default", { ascending: false });
      return (data ?? []) as unknown as LinkedBank[];
    },
  });

  const { data: pinInfo } = useQuery({
    queryKey: ["has-pin", user?.id],
    enabled: !!user,
    queryFn: () => hasPinFn({}),
  });

  const wallet = useMemo(() => wallets?.find((w) => w.id === walletId) ?? wallets?.[0], [wallets, walletId]);
  const bank = useMemo(() => banks?.find((b) => b.id === bankId) ?? banks?.find((b) => b.is_default) ?? banks?.[0], [banks, bankId]);
  useEffect(() => { if (!walletId && wallet) setWalletId(wallet.id); }, [wallet, walletId]);
  useEffect(() => { if (!bankId && bank) setBankId(bank.id); }, [bank, bankId]);

  const fee = Number(amount || 0) * 0.015;
  const receive = Math.max(0, Number(amount || 0));
  const total = Number(amount || 0) + fee;
  const insufficient = wallet ? total > Number(wallet.balance) : false;

  // Realtime: subscribe to current withdrawal row
  useEffect(() => {
    if (!resultId || !user) return;
    const ch = supabase
      .channel(`wd-${resultId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "withdrawals", filter: `id=eq.${resultId}` }, () => {
        qc.invalidateQueries({ queryKey: ["withdrawal", resultId] });
        qc.invalidateQueries({ queryKey: ["wallets", user.id] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [resultId, user, qc]);

  const { data: result } = useQuery({
    queryKey: ["withdrawal", resultId],
    enabled: !!resultId,
    refetchInterval: (q) => {
      const status = (q.state.data as { status?: string } | undefined)?.status;
      return status === "completed" || status === "failed" || status === "reversed" || status === "cancelled" ? false : 2000;
    },
    queryFn: async () => {
      const { data } = await supabase.from("withdrawals").select("*").eq("id", resultId!).maybeSingle();
      return data;
    },
  });

  function reset() {
    setResultId(null); setStep("method"); setAmount(""); setPin(""); setNarration("");
  }

  async function submit() {
    if (!wallet || !bank || !amount || pin.length < 4) return;
    if (!pinInfo?.hasPin) { setShowSetPin(true); return; }
    setSubmitting(true);
    try {
      const idem = crypto.randomUUID();
      const r = await initFn({ data: {
        walletId: wallet.id, bankId: bank.id, amount: Number(amount),
        pin, narration: narration || undefined, idempotencyKey: idem,
      }});
      setResultId(r.withdrawalId);
      qc.invalidateQueries({ queryKey: ["wallets", user?.id] });
      toast.success("Withdrawal submitted");
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setSubmitting(false); setPin(""); }
  }

  const stepIndex = STEPS.indexOf(step);

  // Result view
  if (resultId) {
    const status = result?.status as string | undefined;
    const isDone = status === "completed";
    const isFail = status === "failed" || status === "reversed" || status === "cancelled";
    return (
      <div className="space-y-6">
        <PageHeader title="Withdrawal" subtitle="Live status from the payment network." />
        <GlassCard className="text-center py-12 max-w-xl mx-auto">
          <AnimatePresence mode="wait">
            {!status || status === "pending" || status === "queued" || status === "processing" ? (
              <motion.div key="proc" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <div className="mx-auto h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <Loader2 className="h-8 w-8 text-primary animate-spin" />
                </div>
                <div className="font-display text-2xl font-bold">Processing transfer</div>
                <p className="text-sm text-muted-foreground mt-2">Settling with the bank rail. This usually takes seconds.</p>
                <Badge variant="secondary" className="mt-4"><Clock className="h-3 w-3 mr-1" /> {status ?? "pending"}</Badge>
              </motion.div>
            ) : isDone ? (
              <motion.div key="ok" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                <div className="mx-auto h-16 w-16 rounded-full bg-success/10 flex items-center justify-center mb-4">
                  <CheckCircle2 className="h-8 w-8 text-success" />
                </div>
                <div className="font-display text-2xl font-bold">Transfer complete</div>
                <p className="text-sm text-muted-foreground mt-2">Funds sent to {(result?.destination as { account_name?: string })?.account_name}.</p>
                <div className="mt-5 inline-flex items-center gap-2 text-xs font-mono px-3 py-1.5 rounded-full bg-surface-2/60">
                  <Receipt className="h-3 w-3" /> {result?.reference}
                </div>
              </motion.div>
            ) : isFail ? (
              <motion.div key="fail" initial={{ x: -8 }} animate={{ x: [0, -8, 8, -4, 4, 0] }}>
                <div className="mx-auto h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
                  <XCircle className="h-8 w-8 text-destructive" />
                </div>
                <div className="font-display text-2xl font-bold">Transfer failed</div>
                <p className="text-sm text-muted-foreground mt-2">{result?.failure_reason ?? "The bank rejected this transfer."} Funds were returned to your wallet.</p>
              </motion.div>
            ) : null}
          </AnimatePresence>
          <Button onClick={reset} className="mt-8 h-11 px-8 gradient-primary glow-primary text-primary-foreground">New withdrawal</Button>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Withdraw"
        subtitle="Send money to your bank, instantly and securely."
        action={
          <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-success" />
            <span>Bank-grade encryption · Paystack rails</span>
          </div>
        }
      />

      {/* Stepper */}
      <div className="flex items-center gap-2 text-xs">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2 flex-1">
            <div className={`h-7 w-7 rounded-full flex items-center justify-center font-semibold ${i <= stepIndex ? "gradient-primary text-primary-foreground glow-primary" : "bg-surface-2 text-muted-foreground"}`}>{i + 1}</div>
            <span className={`capitalize hidden sm:inline ${i === stepIndex ? "font-medium" : "text-muted-foreground"}`}>{s}</span>
            {i < STEPS.length - 1 && <div className="flex-1 h-px bg-surface-2" />}
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {step === "method" && (
          <motion.div key="m" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <div className="grid lg:grid-cols-[1fr_1.2fr] gap-4">
              <GlassCard>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Method</div>
                <div className="space-y-2">
                  {[
                    { id: "bank", label: "To Bank Account", icon: Building2, fee: "1.5%", time: "Minutes", enabled: true },
                    { id: "mpesa", label: "To M-Pesa", icon: Smartphone, fee: "1%", time: "Instant", enabled: false },
                    { id: "wallet", label: "To AbanRemit Wallet", icon: Wallet, fee: "0%", time: "Instant", enabled: false },
                  ].map((m) => (
                    <button key={m.id} disabled={!m.enabled} onClick={() => setMethod(m.id as typeof method)}
                      className={`w-full text-left flex items-center gap-3 p-3 rounded-xl transition ${method === m.id ? "bg-primary/10 ring-1 ring-primary/40" : "hover:bg-surface-2/60"} ${!m.enabled ? "opacity-50 cursor-not-allowed" : ""}`}>
                      <div className="h-10 w-10 rounded-xl bg-surface-2 flex items-center justify-center"><m.icon className="h-5 w-5 text-primary" /></div>
                      <div className="flex-1">
                        <div className="text-sm font-medium flex items-center gap-2">{m.label}{!m.enabled && <Badge variant="outline" className="text-[10px]">Soon</Badge>}</div>
                        <div className="text-xs text-muted-foreground">Fee {m.fee} · {m.time}</div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              </GlassCard>
              <GlassCard>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">From wallet</div>
                <div className="space-y-2">
                  {wallets?.filter((w) => w.currency !== "ABAN").map((w) => (
                    <button key={w.id} onClick={() => setWalletId(w.id)}
                      className={`w-full text-left flex items-center justify-between p-4 rounded-xl ${walletId === w.id ? "bg-primary/10 ring-1 ring-primary/40" : "hover:bg-surface-2/60"}`}>
                      <div>
                        <div className="text-sm font-medium">{w.currency} Wallet {w.is_primary && <Badge variant="secondary" className="ml-2 text-[10px]">Primary</Badge>}</div>
                        <div className="text-xs text-muted-foreground font-mono">{w.wallet_number}</div>
                      </div>
                      <div className="font-display text-lg font-bold">{Number(w.balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    </button>
                  ))}
                </div>
                <div className="flex justify-end mt-4">
                  <Button onClick={() => setStep("beneficiary")} disabled={!walletId} className="gradient-primary glow-primary text-primary-foreground">Continue <ChevronRight className="h-4 w-4 ml-1" /></Button>
                </div>
              </GlassCard>
            </div>
          </motion.div>
        )}

        {step === "beneficiary" && (
          <motion.div key="b" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <GlassCard>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="font-display text-lg font-semibold">Beneficiary bank</div>
                  <div className="text-xs text-muted-foreground">Choose a saved bank or add a new one.</div>
                </div>
                <Button variant="outline" size="sm" onClick={() => setShowAddBank(true)}><Plus className="h-4 w-4 mr-1" /> Add bank</Button>
              </div>
              <div className="space-y-2">
                {(banks ?? []).length === 0 && (
                  <div className="text-center py-8 text-sm text-muted-foreground">No saved banks yet. Add one to continue.</div>
                )}
                {banks?.map((b) => (
                  <div key={b.id} className={`flex items-center gap-3 p-3 rounded-xl ${bankId === b.id ? "bg-primary/10 ring-1 ring-primary/40" : "hover:bg-surface-2/60"}`}>
                    <button onClick={() => setBankId(b.id)} className="flex-1 text-left flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-surface-2 flex items-center justify-center text-xs font-semibold">{b.bank_name.slice(0, 2).toUpperCase()}</div>
                      <div className="flex-1">
                        <div className="text-sm font-medium flex items-center gap-2">{b.account_name} {b.is_default && <Star className="h-3 w-3 fill-primary text-primary" />}</div>
                        <div className="text-xs text-muted-foreground font-mono">{b.bank_name} · ••••{b.account_number.slice(-4)}</div>
                      </div>
                    </button>
                    {!b.is_default && (
                      <Button variant="ghost" size="icon" onClick={async () => { await setDefaultBank({ data: { id: b.id }}); refetchBanks(); }}><Star className="h-4 w-4" /></Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={async () => { if (confirm("Remove this bank?")) { await deleteLinkedBank({ data: { id: b.id }}); refetchBanks(); }}}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                ))}
              </div>
              <div className="flex justify-between mt-6">
                <Button variant="ghost" onClick={() => setStep("method")}><ChevronLeft className="h-4 w-4 mr-1" /> Back</Button>
                <Button onClick={() => setStep("amount")} disabled={!bankId} className="gradient-primary glow-primary text-primary-foreground">Continue <ChevronRight className="h-4 w-4 ml-1" /></Button>
              </div>
            </GlassCard>
          </motion.div>
        )}

        {step === "amount" && (
          <motion.div key="a" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <div className="grid lg:grid-cols-[1.2fr_1fr] gap-4">
              <GlassCard>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Amount</div>
                <div className="flex items-baseline gap-2 mb-4">
                  <span className="text-3xl font-display font-bold text-muted-foreground">{wallet?.currency}</span>
                  <Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00"
                    className="border-0 bg-transparent text-5xl font-display font-bold p-0 h-auto focus-visible:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                </div>
                <div className="flex gap-2 mb-4">
                  {[1000, 5000, 10000, 50000].map((q) => (
                    <Button key={q} variant="outline" size="sm" onClick={() => setAmount(String(q))}>{q.toLocaleString()}</Button>
                  ))}
                  <Button variant="outline" size="sm" onClick={() => setAmount(String(Number(wallet?.balance ?? 0)))}>Max</Button>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Narration (optional)</Label>
                  <Input value={narration} onChange={(e) => setNarration(e.target.value.slice(0, 120))} placeholder="What's this for?" />
                </div>
              </GlassCard>
              <GlassCard>
                <div className="font-display text-lg font-semibold mb-4">Summary</div>
                <Row label="Available" value={`${wallet?.currency} ${Number(wallet?.balance ?? 0).toLocaleString(undefined, {minimumFractionDigits:2})}`} />
                <Row label="You send" value={`${wallet?.currency} ${Number(amount || 0).toLocaleString(undefined, {minimumFractionDigits:2})}`} />
                <Row label="Fee (1.5%)" value={`${wallet?.currency} ${fee.toLocaleString(undefined, {minimumFractionDigits:2})}`} />
                <div className="my-2 border-t border-border/40" />
                <Row label="Total debit" value={`${wallet?.currency} ${total.toLocaleString(undefined, {minimumFractionDigits:2})}`} bold />
                <Row label="Recipient gets" value={`${wallet?.currency} ${receive.toLocaleString(undefined, {minimumFractionDigits:2})}`} />
                <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" /> Estimated arrival: 1-3 minutes
                </div>
                {insufficient && <div className="mt-3 text-xs text-destructive">Insufficient balance for amount + fee.</div>}
                <div className="flex justify-between mt-6">
                  <Button variant="ghost" onClick={() => setStep("beneficiary")}><ChevronLeft className="h-4 w-4 mr-1" /> Back</Button>
                  <Button onClick={() => setStep("review")} disabled={!amount || Number(amount) <= 0 || insufficient} className="gradient-primary glow-primary text-primary-foreground">Review <ChevronRight className="h-4 w-4 ml-1" /></Button>
                </div>
              </GlassCard>
            </div>
          </motion.div>
        )}

        {step === "review" && (
          <motion.div key="r" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <GlassCard className="max-w-xl mx-auto">
              <div className="font-display text-lg font-semibold mb-4">Confirm withdrawal</div>
              <div className="rounded-2xl bg-surface-2/40 p-4 space-y-2 mb-4">
                <Row label="To" value={bank?.account_name ?? ""} />
                <Row label="Bank" value={bank?.bank_name ?? ""} />
                <Row label="Account" value={`••••${bank?.account_number.slice(-4) ?? ""}`} />
                <div className="my-2 border-t border-border/40" />
                <Row label="Amount" value={`${wallet?.currency} ${Number(amount).toLocaleString(undefined, {minimumFractionDigits:2})}`} bold />
                <Row label="Fee" value={`${wallet?.currency} ${fee.toLocaleString(undefined, {minimumFractionDigits:2})}`} />
                <Row label="Total" value={`${wallet?.currency} ${total.toLocaleString(undefined, {minimumFractionDigits:2})}`} bold />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><Lock className="h-3 w-3" /> Transaction PIN</Label>
                <InputOTP maxLength={4} value={pin} onChange={setPin}>
                  <InputOTPGroup>
                    {[0,1,2,3].map((i) => <InputOTPSlot key={i} index={i} className="h-12 w-12 text-lg" />)}
                  </InputOTPGroup>
                </InputOTP>
                {!pinInfo?.hasPin && (
                  <button onClick={() => setShowSetPin(true)} className="text-xs text-primary hover:underline">Set transaction PIN first →</button>
                )}
              </div>
              <div className="flex justify-between mt-6">
                <Button variant="ghost" onClick={() => setStep("amount")} disabled={submitting}><ChevronLeft className="h-4 w-4 mr-1" /> Back</Button>
                <Button onClick={submit} disabled={submitting || pin.length < 4} className="gradient-primary glow-primary text-primary-foreground min-w-[160px]">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Confirm <ShieldCheck className="h-4 w-4 ml-1.5" /></>}
                </Button>
              </div>
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>

      <AddBankDialog open={showAddBank} onOpenChange={setShowAddBank} currency={wallet?.currency ?? "KES"} onAdded={() => { refetchBanks(); setShowAddBank(false); }} />
      <SetPinDialog open={showSetPin} onOpenChange={setShowSetPin} onSet={() => { qc.invalidateQueries({ queryKey: ["has-pin"] }); setShowSetPin(false); }} />
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-sm ${bold ? "font-semibold" : ""}`}>{value}</span>
    </div>
  );
}

function AddBankDialog({ open, onOpenChange, currency, onAdded }: { open: boolean; onOpenChange: (v: boolean) => void; currency: string; onAdded: () => void }) {
  const [bankCode, setBankCode] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [resolved, setResolved] = useState<{ name: string } | null>(null);
  const [resolving, setResolving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [setDefault, setSetDefault] = useState(false);

  const psCurrency = currency === "USD" ? "USD" : currency === "KES" ? "KES" : "NGN";
  const { data: banks, isLoading } = useQuery({
    queryKey: ["paystack-banks", psCurrency, open],
    enabled: open,
    queryFn: () => listBanks({ data: { currency: psCurrency as "NGN" | "GHS" | "ZAR" | "KES" | "USD" } }),
  });

  // Live resolve account name
  useEffect(() => {
    if (!bankCode || accountNumber.length < 10) { setResolved(null); return; }
    const t = setTimeout(async () => {
      setResolving(true);
      try {
        const r = await resolveAccount({ data: { accountNumber, bankCode }});
        setResolved({ name: r.accountName });
      } catch { setResolved(null); }
      finally { setResolving(false); }
    }, 600);
    return () => clearTimeout(t);
  }, [bankCode, accountNumber]);

  async function submit() {
    if (!bankCode || !accountNumber || !bankName) return;
    setSubmitting(true);
    try {
      await addLinkedBank({ data: {
        bankCode, bankName, accountNumber,
        currency: currency as "KES" | "USD" | "EUR" | "GBP",
        setDefault,
      }});
      toast.success("Bank added & verified");
      setBankCode(""); setBankName(""); setAccountNumber(""); setResolved(null);
      onAdded();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSubmitting(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add bank account</DialogTitle>
          <DialogDescription>We verify the account in real-time before saving.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Bank</Label>
            <Select value={bankCode} onValueChange={(v) => { setBankCode(v); setBankName(banks?.find((b) => b.code === v)?.name ?? ""); }}>
              <SelectTrigger><SelectValue placeholder={isLoading ? "Loading…" : "Select bank"} /></SelectTrigger>
              <SelectContent className="max-h-72">
                {banks?.map((b) => <SelectItem key={b.code} value={b.code}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Account number</Label>
            <Input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 20))} placeholder="0123456789" />
          </div>
          <AnimatePresence>
            {(resolving || resolved) && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="rounded-xl bg-surface-2/60 p-3 flex items-center gap-2">
                {resolving ? <><Loader2 className="h-4 w-4 animate-spin text-primary" /><span className="text-sm text-muted-foreground">Verifying account…</span></> :
                  <><CheckCircle2 className="h-4 w-4 text-success" /><span className="text-sm font-medium">{resolved?.name}</span></>}
              </motion.div>
            )}
          </AnimatePresence>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={setDefault} onChange={(e) => setSetDefault(e.target.checked)} className="rounded border-border" />
            Set as default
          </label>
          <Button onClick={submit} disabled={!resolved || submitting} className="w-full h-11 gradient-primary glow-primary text-primary-foreground">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save bank account"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SetPinDialog({ open, onOpenChange, onSet }: { open: boolean; onOpenChange: (v: boolean) => void; onSet: () => void }) {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  async function submit() {
    if (pin !== confirm) { toast.error("PINs do not match"); return; }
    if (!/^[0-9]{4}$/.test(pin)) { toast.error("PIN must be 4 digits"); return; }
    setSubmitting(true);
    try { await setTransactionPin({ data: { pin }}); toast.success("Transaction PIN set"); onSet(); setPin(""); setConfirm(""); }
    catch (e) { toast.error((e as Error).message); }
    finally { setSubmitting(false); }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Set transaction PIN</DialogTitle><DialogDescription>You'll use this to authorise withdrawals.</DialogDescription></DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-2"><Label className="text-xs uppercase tracking-wider text-muted-foreground">New PIN</Label>
            <InputOTP maxLength={4} value={pin} onChange={setPin}>
              <InputOTPGroup>{[0,1,2,3].map((i) => <InputOTPSlot key={i} index={i} className="h-12 w-12 text-lg" />)}</InputOTPGroup>
            </InputOTP>
          </div>
          <div className="space-y-2"><Label className="text-xs uppercase tracking-wider text-muted-foreground">Confirm PIN</Label>
            <InputOTP maxLength={4} value={confirm} onChange={setConfirm}>
              <InputOTPGroup>{[0,1,2,3].map((i) => <InputOTPSlot key={i} index={i} className="h-12 w-12 text-lg" />)}</InputOTPGroup>
            </InputOTP>
          </div>
          <Button onClick={submit} disabled={submitting || pin.length < 4 || confirm.length < 4} className="w-full h-11 gradient-primary glow-primary text-primary-foreground">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Set PIN"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
