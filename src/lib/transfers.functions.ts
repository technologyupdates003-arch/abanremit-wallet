import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";

const PAYSTACK_BASE = "https://api.paystack.co";

function genReference() {
  return `WD_${Date.now()}_${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
}

async function paystack<T = unknown>(
  path: string,
  init: RequestInit & { body?: string } = {},
): Promise<T> {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not configured");
  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const json = (await res.json()) as { status: boolean; message: string; data: T };
  if (!res.ok || !json.status) throw new Error(json.message || `Paystack error (${res.status})`);
  return json.data;
}

// ==================== BANKS ====================

const ListBanksInput = z.object({
  currency: z.enum(["NGN", "GHS", "ZAR", "KES", "USD"]).default("NGN"),
});

export const listBanks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof ListBanksInput>) => ListBanksInput.parse(d))
  .handler(async ({ data }) => {
    type B = { name: string; code: string; currency: string; type: string; active: boolean };
    const banks = await paystack<B[]>(
      `/bank?currency=${data.currency}&perPage=100`,
    );
    return banks
      .filter((b) => b.active)
      .map((b) => ({ name: b.name, code: b.code, currency: b.currency, type: b.type }));
  });

const ResolveAccountInput = z.object({
  accountNumber: z.string().regex(/^[0-9]{6,20}$/),
  bankCode: z.string().min(2).max(20),
});

export const resolveAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof ResolveAccountInput>) => ResolveAccountInput.parse(d))
  .handler(async ({ data }) => {
    type R = { account_number: string; account_name: string; bank_id: number };
    const r = await paystack<R>(
      `/bank/resolve?account_number=${data.accountNumber}&bank_code=${data.bankCode}`,
    );
    return { accountNumber: r.account_number, accountName: r.account_name };
  });

const AddBankInput = z.object({
  bankCode: z.string().min(2).max(20),
  bankName: z.string().min(1).max(120),
  accountNumber: z.string().regex(/^[0-9]{6,20}$/),
  currency: z.enum(["KES", "USD", "EUR", "GBP"]),
  setDefault: z.boolean().optional().default(false),
});

export const addLinkedBank = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof AddBankInput>) => AddBankInput.parse(d))
  .handler(async ({ data, context }) => {
    // Resolve to verify account name (Paystack supports NGN; for others fallback to user-provided name not allowed)
    type R = { account_number: string; account_name: string };
    let accountName: string;
    try {
      const r = await paystack<R>(
        `/bank/resolve?account_number=${data.accountNumber}&bank_code=${data.bankCode}`,
      );
      accountName = r.account_name;
    } catch (e) {
      throw new Error(`Account verification failed: ${(e as Error).message}`);
    }

    // Create Paystack transfer recipient
    type Rec = { recipient_code: string; type: string; details: { account_name: string } };
    const recipient = await paystack<Rec>("/transferrecipient", {
      method: "POST",
      body: JSON.stringify({
        type: "nuban",
        name: accountName,
        account_number: data.accountNumber,
        bank_code: data.bankCode,
        currency: data.currency === "KES" ? "KES" : data.currency,
      }),
    });

    if (data.setDefault) {
      await context.supabase
        .from("linked_banks")
        .update({ is_default: false })
        .eq("user_id", context.userId);
    }

    const { data: bank, error } = await context.supabase
      .from("linked_banks")
      .insert({
        user_id: context.userId,
        bank_name: data.bankName,
        bank_code: data.bankCode,
        account_number: data.accountNumber,
        account_name: accountName,
        currency: data.currency,
        recipient_code: recipient.recipient_code,
        is_default: data.setDefault,
        verified_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return bank;
  });

const SetDefaultInput = z.object({ id: z.string().uuid() });
export const setDefaultBank = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof SetDefaultInput>) => SetDefaultInput.parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase.from("linked_banks").update({ is_default: false }).eq("user_id", context.userId);
    const { error } = await context.supabase
      .from("linked_banks")
      .update({ is_default: true })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteLinkedBank = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof SetDefaultInput>) => SetDefaultInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("linked_banks")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ==================== PIN ====================

const PinInput = z.object({ pin: z.string().regex(/^[0-9]{4,6}$/) });

export const setTransactionPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof PinInput>) => PinInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("set_transaction_pin" as never, { _pin: data.pin } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const hasTransactionPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("profiles")
      .select("transaction_pin_hash")
      .eq("id", context.userId)
      .maybeSingle();
    return { hasPin: !!data?.transaction_pin_hash };
  });

// ==================== WITHDRAWAL ====================

const InitiateInput = z.object({
  walletId: z.string().uuid(),
  bankId: z.string().uuid(),
  amount: z.number().positive().max(10_000_000),
  pin: z.string().regex(/^[0-9]{4,6}$/),
  narration: z.string().max(120).optional(),
  idempotencyKey: z.string().uuid(),
});

export const initiateWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof InitiateInput>) => InitiateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;

    // Verify PIN (RLS-respecting; SECURITY DEFINER uses auth.uid())
    const { error: pinErr } = await supabase.rpc("verify_transaction_pin" as never, { _pin: data.pin } as never);
    if (pinErr) {
      if (pinErr.message.includes("pin_locked_until")) throw new Error("PIN locked. Try again later.");
      if (pinErr.message.includes("invalid_pin")) throw new Error("Incorrect PIN");
      if (pinErr.message.includes("pin_not_set")) throw new Error("Transaction PIN not set");
      throw new Error(pinErr.message);
    }

    // Fetch wallet (RLS scoped to user)
    const { data: wallet } = await supabase
      .from("wallets")
      .select("id, currency, balance, user_id")
      .eq("id", data.walletId)
      .maybeSingle();
    if (!wallet) throw new Error("Wallet not found");

    // Fetch bank
    const { data: bank } = await supabase
      .from("linked_banks")
      .select("id, recipient_code, currency, account_number, account_name, bank_name")
      .eq("id", data.bankId)
      .maybeSingle();
    if (!bank || !bank.recipient_code) throw new Error("Bank not found or unverified");
    if (bank.currency && bank.currency !== wallet.currency) throw new Error("Bank currency mismatch");

    // KYC check
    const { data: profile } = await supabase
      .from("profiles")
      .select("kyc_status")
      .eq("id", userId)
      .maybeSingle();
    if (!profile || profile.kyc_status !== "approved") throw new Error("KYC verification required");

    // Idempotency: check for existing
    const { data: existing } = await supabase
      .from("withdrawals")
      .select("id, status, reference")
      .eq("user_id", userId)
      .eq("idempotency_key", data.idempotencyKey)
      .maybeSingle();
    if (existing) return { withdrawalId: existing.id, status: existing.status, reference: existing.reference };

    const fee = Math.round(data.amount * 0.015 * 100) / 100; // 1.5% fee
    const reference = genReference();
    const ip = (() => { try { return getRequestIP({ xForwardedFor: true }) ?? null; } catch { return null; } })();
    const ua = (() => { try { return getRequestHeader("user-agent") ?? null; } catch { return null; } })();

    // Insert withdrawal row (RLS: own insert)
    const { data: wd, error: insErr } = await supabase
      .from("withdrawals")
      .insert({
        user_id: userId,
        wallet_id: wallet.id,
        bank_id: bank.id,
        amount: data.amount,
        fee,
        currency: wallet.currency,
        method: "bank",
        status: "pending",
        reference,
        recipient_code: bank.recipient_code,
        narration: data.narration ?? "AbanRemit Withdrawal",
        idempotency_key: data.idempotencyKey,
        ip_address: ip,
        user_agent: ua,
        destination: { bank_name: bank.bank_name, account_number: bank.account_number, account_name: bank.account_name },
      })
      .select()
      .single();
    if (insErr || !wd) throw new Error(insErr?.message ?? "Failed to create withdrawal");

    // Lock funds atomically (admin: SECURITY DEFINER)
    const { error: lockErr } = await supabaseAdmin.rpc("lock_funds_for_withdrawal" as never, {
      _withdrawal_id: wd.id,
      _wallet_id: wallet.id,
      _amount: data.amount,
      _fee: fee,
    } as never);
    if (lockErr) {
      // Mark cancelled
      await supabaseAdmin.from("withdrawals").update({ status: "cancelled", failure_reason: lockErr.message }).eq("id", wd.id);
      throw new Error(lockErr.message.includes("insufficient_balance") ? "Insufficient balance" : lockErr.message);
    }

    // Initiate Paystack transfer
    try {
      type T = { transfer_code: string; reference: string; status: string };
      const t = await paystack<T>("/transfer", {
        method: "POST",
        body: JSON.stringify({
          source: "balance",
          amount: Math.round(data.amount * 100),
          recipient: bank.recipient_code,
          reason: data.narration ?? "AbanRemit Withdrawal",
          reference,
          currency: wallet.currency,
        }),
      });
      await supabaseAdmin.from("withdrawals").update({
        status: "processing",
        gateway_reference: t.transfer_code,
      }).eq("id", wd.id);
      return { withdrawalId: wd.id, reference, status: "processing" };
    } catch (e) {
      // Reverse the lock
      await supabaseAdmin.rpc("reverse_withdrawal" as never, {
        _withdrawal_id: wd.id,
        _reason: (e as Error).message,
      } as never);
      throw new Error(`Transfer failed: ${(e as Error).message}`);
    }
  });
