import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";

function ip() { try { return getRequestIP({ xForwardedFor: true }) ?? null; } catch { return null; } }
function ua() { try { return getRequestHeader("user-agent") ?? null; } catch { return null; } }

// ========== LOOKUP RECIPIENT ==========
const LookupInput = z.object({ walletNumber: z.string().min(3).max(64) });
export const lookupWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof LookupInput>) => LookupInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .rpc("lookup_wallet_by_number" as never, { _wallet_number: data.walletNumber } as never);
    if (error) throw new Error(error.message);
    const arr = row as unknown as Array<{ wallet_id: string; wallet_user_id: string; currency: string; full_name: string; status: string }> | null;
    if (!arr || arr.length === 0) return { found: false as const };
    const r = arr[0];
    return { found: true as const, walletId: r.wallet_id, userId: r.wallet_user_id, currency: r.currency, fullName: r.full_name };
  });

// ========== TRANSFER ==========
const TransferInput = z.object({
  fromWalletId: z.string().uuid(),
  toWalletNumber: z.string().min(3).max(64),
  amount: z.number().positive().max(10_000_000),
  narration: z.string().max(140).optional(),
  pin: z.string().regex(/^[0-9]{4,6}$/),
  idempotencyKey: z.string().uuid(),
});

export const transferToWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof TransferInput>) => TransferInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("tx_execute_transfer" as never, {
      _idempotency_key: data.idempotencyKey,
      _from_wallet_id: data.fromWalletId,
      _to_wallet_number: data.toWalletNumber,
      _amount: data.amount,
      _narration: data.narration ?? null,
      _pin: data.pin,
      _ip: ip(),
      _user_agent: ua(),
    } as never);
    if (error) {
      const m = error.message;
      if (m.includes("invalid_pin")) throw new Error("Incorrect PIN");
      if (m.includes("pin_locked_until")) throw new Error("PIN locked. Try again later.");
      if (m.includes("pin_not_set")) throw new Error("Transaction PIN not set");
      if (m.includes("insufficient_balance")) throw new Error("Insufficient balance");
      if (m.includes("recipient_not_found")) throw new Error("Recipient wallet not found");
      if (m.includes("currency_mismatch")) throw new Error("Recipient currency mismatch");
      if (m.includes("cannot_send_to_self")) throw new Error("You cannot send to yourself");
      if (m.includes("velocity_limit")) throw new Error("Too many transfers — please wait a moment");
      throw new Error(m);
    }
    return res as { transaction_id: string; status: string; reference: string; replay: boolean };
  });

// ========== CONVERT ==========
const ConvertInput = z.object({
  fromWalletId: z.string().uuid(),
  toWalletId: z.string().uuid(),
  amount: z.number().positive().max(10_000_000),
  pin: z.string().regex(/^[0-9]{4,6}$/),
  idempotencyKey: z.string().uuid(),
});

export const convertCurrency = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof ConvertInput>) => ConvertInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("tx_convert_currency" as never, {
      _idempotency_key: data.idempotencyKey,
      _from_wallet_id: data.fromWalletId,
      _to_wallet_id: data.toWalletId,
      _amount: data.amount,
      _pin: data.pin,
      _ip: ip(),
      _user_agent: ua(),
    } as never);
    if (error) {
      const m = error.message;
      if (m.includes("invalid_pin")) throw new Error("Incorrect PIN");
      if (m.includes("pin_locked_until")) throw new Error("PIN locked. Try again later.");
      if (m.includes("insufficient_balance")) throw new Error("Insufficient balance");
      if (m.includes("rate_unavailable")) throw new Error("Conversion rate unavailable for this pair");
      if (m.includes("same_currency")) throw new Error("Wallets share the same currency");
      throw new Error(m);
    }
    return res as { transaction_id: string; status: string; reference: string; rate: number; destination_amount: number; replay: boolean };
  });

// ========== EXCHANGE RATE PREVIEW ==========
const RateInput = z.object({
  from: z.enum(["KES", "USD", "ABAN", "EUR", "GBP"]),
  to: z.enum(["KES", "USD", "ABAN", "EUR", "GBP"]),
});
export const getExchangeRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof RateInput>) => RateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rate } = await context.supabase
      .from("exchange_rates")
      .select("rate, spread")
      .eq("from_currency", data.from)
      .eq("to_currency", data.to)
      .maybeSingle();
    if (!rate) return { available: false as const };
    const effective = Number(rate.rate) * (1 - Number(rate.spread));
    return { available: true as const, rate: effective };
  });
