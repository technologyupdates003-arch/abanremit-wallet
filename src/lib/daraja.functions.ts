import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function normalizePhone(p: string): string {
  const digits = p.replace(/\D/g, "");
  if (digits.startsWith("254")) return digits;
  if (digits.startsWith("0")) return "254" + digits.slice(1);
  if (digits.startsWith("7") || digits.startsWith("1")) return "254" + digits;
  return digits;
}

function darajaBase(): string {
  const env = (process.env.DARAJA_ENV ?? "production").toLowerCase();
  return env === "sandbox"
    ? "https://sandbox.safaricom.co.ke"
    : "https://api.safaricom.co.ke";
}

async function getAccessToken(): Promise<string> {
  const key = process.env.DARAJA_CONSUMER_KEY;
  const secret = process.env.DARAJA_CONSUMER_SECRET;
  if (!key || !secret) throw new Error("Daraja credentials not configured");
  const auth = Buffer.from(`${key}:${secret}`).toString("base64");
  const res = await fetch(
    `${darajaBase()}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${auth}` } },
  );
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    throw new Error(`Daraja auth failed: ${json?.errorMessage ?? res.status}`);
  }
  return json.access_token as string;
}

const B2CInput = z.object({
  phone: z.string().min(9).max(15),
  amount: z.number().int().positive().max(150_000),
  walletId: z.string().uuid().optional(),
  pin: z.string().regex(/^\d{4,6}$/),
  narration: z.string().max(100).optional(),
  commandID: z.enum(["BusinessPayment", "SalaryPayment", "PromotionPayment"]).default("BusinessPayment"),
});

export const darajaB2CSend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof B2CInput>) => B2CInput.parse(d))
  .handler(async ({ data, context }) => {
    const shortcode = process.env.DARAJA_B2C_SHORTCODE;
    const initiator = process.env.DARAJA_B2C_INITIATOR_NAME;
    const credential = process.env.DARAJA_B2C_SECURITY_CREDENTIAL;
    const resultUrl = process.env.DARAJA_B2C_RESULT_URL;
    const timeoutUrl = process.env.DARAJA_B2C_TIMEOUT_URL;
    if (!shortcode || !initiator || !credential || !resultUrl || !timeoutUrl) {
      throw new Error("Daraja B2C configuration incomplete");
    }

    // Verify PIN
    const { error: pinErr } = await context.supabase.rpc(
      "verify_transaction_pin" as never,
      { _pin: data.pin } as never,
    );
    if (pinErr) throw new Error(pinErr.message);

    // Resolve KES wallet
    let walletId = data.walletId;
    if (!walletId) {
      const { data: w } = await context.supabase
        .from("wallets")
        .select("id")
        .eq("user_id", context.userId)
        .eq("currency", "KES" as never)
        .order("is_primary", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!w) throw new Error("KES wallet not found");
      walletId = w.id;
    }

    const phone = normalizePhone(data.phone);
    const reference = `MPB2C-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const fee = Math.round(data.amount * 0.01); // 1%

    // Create pending withdrawal
    const { data: wd, error: wdErr } = await context.supabase
      .from("withdrawals")
      .insert({
        user_id: context.userId,
        method: "mpesa",
        amount: data.amount,
        currency: "KES" as never,
        status: "pending" as never,
        fee,
        reference,
        narration: data.narration ?? `M-Pesa to ${phone}`,
        destination: { phone, channel: "daraja_b2c", commandID: data.commandID } as never,
      })
      .select()
      .single();
    if (wdErr) throw new Error(wdErr.message);

    // Lock funds via RPC (debits wallet, sets withdrawal -> queued)
    const { error: lockErr } = await context.supabase.rpc(
      "lock_funds_for_withdrawal" as never,
      {
        _withdrawal_id: wd.id,
        _wallet_id: walletId,
        _amount: data.amount,
        _fee: fee,
      } as never,
    );
    if (lockErr) {
      await context.supabase
        .from("withdrawals")
        .update({ status: "failed" as never, failure_reason: lockErr.message })
        .eq("id", wd.id);
      throw new Error(lockErr.message);
    }

    // Call Daraja
    try {
      const token = await getAccessToken();
      const res = await fetch(`${darajaBase()}/mpesa/b2c/v3/paymentrequest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          OriginatorConversationID: reference,
          InitiatorName: initiator,
          SecurityCredential: credential,
          CommandID: data.commandID,
          Amount: data.amount,
          PartyA: shortcode,
          PartyB: phone,
          Remarks: data.narration ?? "AbanRemit payout",
          QueueTimeOutURL: timeoutUrl,
          ResultURL: resultUrl,
          Occasion: reference.slice(0, 20),
        }),
      });
      const json: any = await res.json().catch(() => ({}));
      if (!res.ok || json.ResponseCode !== "0") {
        const reason = json?.errorMessage || json?.ResponseDescription || `HTTP ${res.status}`;
        await context.supabase.rpc("reverse_withdrawal" as never, {
          _withdrawal_id: wd.id,
          _reason: reason,
        } as never);
        throw new Error(reason);
      }
      await context.supabase
        .from("withdrawals")
        .update({
          status: "processing" as never,
          gateway_reference: json.ConversationID ?? null,
        })
        .eq("id", wd.id);
      return {
        ok: true,
        withdrawalId: wd.id,
        reference,
        conversationId: json.ConversationID,
        message: "Payout dispatched. You'll be notified when M-Pesa confirms.",
      };
    } catch (e: any) {
      await context.supabase.rpc("reverse_withdrawal" as never, {
        _withdrawal_id: wd.id,
        _reason: e?.message ?? "daraja_request_failed",
      } as never).catch(() => {});
      throw e instanceof Error ? e : new Error(String(e));
    }
  });
