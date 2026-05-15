import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Loader2, ShieldCheck, CreditCard, Check, X, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";
import { useServerFn } from "@tanstack/react-start";
import {
  initializePayment,
  verifyPayment,
  chargeSavedCard,
  deleteSavedCard,
} from "@/lib/paystack.functions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { GlassCard } from "./shared";

type Brand = "visa" | "mastercard" | "amex" | "verve" | "discover" | "unknown";
const BRAND_GRADIENT: Record<Brand, string> = {
  visa: "from-[#1a1f71] via-[#0e1a52] to-[#0a0f30]",
  mastercard: "from-[#eb001b] via-[#7a0c14] to-[#0a0a0a]",
  amex: "from-[#0077a6] via-[#003e6b] to-[#001a2e]",
  verve: "from-[#0a0a0a] via-[#1a1a1a] to-[#dc2626]",
  discover: "from-[#ff6000] via-[#a13d00] to-[#0a0a0a]",
  unknown: "from-[#1a1a1a] via-[#0a0a0a] to-[#3a0a0a]",
};

function detectBrand(num: string): Brand {
  const n = num.replace(/\s/g, "");
  if (/^4/.test(n)) return "visa";
  if (/^5[1-5]/.test(n) || /^2[2-7]/.test(n)) return "mastercard";
  if (/^3[47]/.test(n)) return "amex";
  if (/^(506[0-9]|5061|650[0-9])/.test(n)) return "verve";
  if (/^6(011|5)/.test(n)) return "discover";
  return "unknown";
}

function formatCardNumber(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 19);
  return d.replace(/(.{4})/g, "$1 ").trim();
}

function luhn(num: string) {
  const d = num.replace(/\D/g, "");
  if (d.length < 12) return false;
  let sum = 0;
  let alt = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = parseInt(d[i], 10);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

export function PaystackCardForm({
  amount,
  currency,
  walletId,
}: {
  amount: number;
  currency: "KES" | "USD" | "EUR" | "GBP";
  walletId?: string;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const init = useServerFn(initializePayment);
  const verify = useServerFn(verifyPayment);
  const chargeSaved = useServerFn(chargeSavedCard);
  const removeCard = useServerFn(deleteSavedCard);

  const [holder, setHolder] = useState("");
  const [number, setNumber] = useState("");
  const [exp, setExp] = useState("");
  const [cvv, setCvv] = useState("");
  const [saveCard, setSaveCard] = useState(true);
  const [phase, setPhase] = useState<"idle" | "tokenizing" | "verifying" | "success" | "error">(
    "idle",
  );
  const [errorMsg, setErrorMsg] = useState("");

  const brand = detectBrand(number);

  const { data: savedCards = [] } = useQuery({
    queryKey: ["saved-cards", user?.id],
    queryFn: async () =>
      (await supabase.from("saved_cards").select("*").order("created_at", { ascending: false }))
        .data ?? [],
    enabled: !!user,
  });

  const valid = useMemo(() => {
    const digits = number.replace(/\s/g, "");
    const [mm, yy] = exp.split("/");
    return (
      holder.trim().length >= 2 &&
      luhn(digits) &&
      mm &&
      yy &&
      Number(mm) >= 1 &&
      Number(mm) <= 12 &&
      yy.length === 2 &&
      cvv.length >= 3 &&
      amount > 0
    );
  }, [holder, number, exp, cvv, amount]);

  // Realtime: when our payment_transactions row flips to completed, celebrate
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`pt-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "payment_transactions",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as { status: string };
          if (row.status === "completed") {
            qc.invalidateQueries({ queryKey: ["wallets"] });
            qc.invalidateQueries({ queryKey: ["txs"] });
            qc.invalidateQueries({ queryKey: ["saved-cards"] });
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, qc]);

  async function pay() {
    if (!user || !valid) return;
    setPhase("tokenizing");
    setErrorMsg("");
    try {
      const initRes = await init({
        data: {
          amount,
          currency,
          email: user.email!,
          saveCard,
          walletId,
        },
      });

      // Tokenize + charge directly against Paystack /charge — raw card data
      // never touches our backend. PCI scope stays with Paystack.
      const [mm, yy] = exp.split("/");
      const chargeRes = await fetch("https://api.paystack.co/charge", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${initRes.publicKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: initRes.email,
          amount: initRes.amountSubunits,
          currency: initRes.currency,
          reference: initRes.reference,
          card: {
            number: number.replace(/\s/g, ""),
            cvv,
            expiry_month: mm,
            expiry_year: `20${yy}`,
          },
        }),
      });
      const chargeJson = (await chargeRes.json()) as {
        status: boolean;
        message: string;
        data?: { status: string; reference: string; display_text?: string };
      };
      if (!chargeJson.status) throw new Error(chargeJson.message || "Card declined");

      // Wipe sensitive state immediately
      setNumber("");
      setCvv("");
      setExp("");

      setPhase("verifying");
      // Poll verify (webhook is source of truth, but verify is fast feedback)
      let ok = false;
      for (let i = 0; i < 8 && !ok; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        try {
          const v = await verify({ data: { reference: initRes.reference } });
          if (v.status === "success") ok = true;
        } catch {
          /* keep polling */
        }
      }
      if (!ok) throw new Error("Awaiting confirmation — check transactions in a moment.");

      setPhase("success");
      toast.success(`Wallet credited with ${currency} ${amount}`);
      qc.invalidateQueries({ queryKey: ["wallets"] });
      qc.invalidateQueries({ queryKey: ["txs"] });
      qc.invalidateQueries({ queryKey: ["saved-cards"] });
      setTimeout(() => setPhase("idle"), 2200);
    } catch (e) {
      setPhase("error");
      const msg = e instanceof Error ? e.message : "Payment failed";
      setErrorMsg(msg);
      toast.error(msg);
      setTimeout(() => setPhase("idle"), 2500);
    }
  }

  async function payWithSaved(authCode: string) {
    if (!user) return;
    setPhase("verifying");
    try {
      const r = await chargeSaved({
        data: {
          authorizationCode: authCode,
          amount,
          currency,
          email: user.email!,
          walletId,
        },
      });
      // Webhook will credit; show optimistic success when Paystack returns success
      if (r.status === "success") {
        setPhase("success");
        toast.success("Charged saved card — wallet crediting…");
      } else {
        setPhase("idle");
        toast(r.message || "Charge submitted");
      }
      setTimeout(() => setPhase("idle"), 2000);
    } catch (e) {
      setPhase("error");
      toast.error(e instanceof Error ? e.message : "Charge failed");
      setTimeout(() => setPhase("idle"), 2200);
    }
  }

  return (
    <div className="space-y-4">
      {/* Live card preview */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className={`relative aspect-[1.586/1] max-w-md rounded-3xl p-6 text-white shadow-2xl bg-gradient-to-br ${BRAND_GRADIENT[brand]} overflow-hidden`}
      >
        <div className="absolute -top-20 -right-20 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute top-6 right-6 text-xs uppercase tracking-[0.2em] opacity-80">
          {brand === "unknown" ? "Card" : brand}
        </div>
        <div className="mt-10 font-mono text-xl tracking-[0.25em]">
          {number ? formatCardNumber(number).padEnd(19, "•") : "•••• •••• •••• ••••"}
        </div>
        <div className="mt-8 flex items-end justify-between text-xs">
          <div>
            <div className="opacity-60 uppercase tracking-wider">Cardholder</div>
            <div className="font-medium text-sm uppercase">{holder || "YOUR NAME"}</div>
          </div>
          <div>
            <div className="opacity-60 uppercase tracking-wider">Expires</div>
            <div className="font-mono text-sm">{exp || "MM/YY"}</div>
          </div>
        </div>
      </motion.div>

      {/* Saved cards */}
      {savedCards.length > 0 && (
        <GlassCard>
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
            Saved cards
          </div>
          <div className="space-y-2">
            {savedCards.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-3 p-3 rounded-xl bg-surface-2/60 border border-border/40"
              >
                <CreditCard className="h-4 w-4 text-primary" />
                <div className="flex-1">
                  <div className="text-sm font-medium capitalize">
                    {c.brand} •••• {c.last4}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Exp {c.exp_month}/{c.exp_year}
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => payWithSaved(c.authorization_code)}
                  disabled={!amount || phase !== "idle"}
                  className="h-8 gradient-primary text-primary-foreground"
                >
                  Pay
                </Button>
                <button
                  onClick={async () => {
                    await removeCard({ data: { id: c.id } });
                    qc.invalidateQueries({ queryKey: ["saved-cards"] });
                    toast.success("Card removed");
                  }}
                  className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                  aria-label="Remove card"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {/* Card form */}
      <GlassCard>
        <div className="flex items-center justify-between mb-4">
          <div className="font-display text-lg font-semibold">Pay with new card</div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-success" />
            PCI-DSS via Paystack
          </div>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Cardholder name
            </Label>
            <Input
              value={holder}
              onChange={(e) => setHolder(e.target.value.toUpperCase())}
              placeholder="JANE DOE"
              autoComplete="cc-name"
              maxLength={50}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Card number
            </Label>
            <div className="relative">
              <Input
                value={formatCardNumber(number)}
                onChange={(e) => setNumber(e.target.value)}
                placeholder="1234 5678 9012 3456"
                inputMode="numeric"
                autoComplete="cc-number"
                className="pr-10 font-mono"
              />
              <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Expiry
              </Label>
              <Input
                value={exp}
                onChange={(e) => {
                  const d = e.target.value.replace(/\D/g, "").slice(0, 4);
                  setExp(d.length >= 3 ? `${d.slice(0, 2)}/${d.slice(2)}` : d);
                }}
                placeholder="MM/YY"
                inputMode="numeric"
                autoComplete="cc-exp"
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                CVV
              </Label>
              <Input
                type="password"
                value={cvv}
                onChange={(e) => setCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="•••"
                inputMode="numeric"
                autoComplete="cc-csc"
                className="font-mono"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm pt-1 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={saveCard}
              onChange={(e) => setSaveCard(e.target.checked)}
              className="h-4 w-4 rounded accent-primary"
            />
            <span className="text-muted-foreground">
              Save this card securely for next time
            </span>
          </label>
        </div>

        <Button
          onClick={pay}
          disabled={!valid || phase !== "idle" || !user}
          className="w-full mt-5 h-12 gradient-primary glow-primary text-primary-foreground font-semibold relative overflow-hidden"
        >
          <AnimatePresence mode="wait">
            {phase === "idle" && (
              <motion.span
                key="idle"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2"
              >
                <Lock className="h-4 w-4" />
                Pay {currency} {amount.toLocaleString()}
              </motion.span>
            )}
            {phase === "tokenizing" && (
              <motion.span
                key="tok"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2"
              >
                <Loader2 className="h-4 w-4 animate-spin" />
                Tokenizing card…
              </motion.span>
            )}
            {phase === "verifying" && (
              <motion.span
                key="ver"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2"
              >
                <Loader2 className="h-4 w-4 animate-spin" />
                Verifying with bank…
              </motion.span>
            )}
            {phase === "success" && (
              <motion.span
                key="ok"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2"
              >
                <Check className="h-5 w-5" />
                Payment confirmed
              </motion.span>
            )}
            {phase === "error" && (
              <motion.span
                key="err"
                initial={{ x: -8, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2"
              >
                <X className="h-5 w-5" />
                {errorMsg.slice(0, 40) || "Failed"}
              </motion.span>
            )}
          </AnimatePresence>
        </Button>

        <div className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
          Your card is tokenized directly by Paystack (PCI-DSS Level 1). AbanRemit
          never sees your full card number, CVV, or expiry. Wallet credit is
          released only after Paystack's signed webhook confirms the charge.
        </div>
      </GlassCard>
    </div>
  );
}
