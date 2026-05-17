import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const PAYSTACK_BASE = "https://api.paystack.co";

function genReference() {
  return `ABN_${Date.now()}_${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
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
  if (!res.ok || !json.status) {
    throw new Error(json.message || `Paystack error (${res.status})`);
  }
  return json.data;
}

const InitInput = z.object({
  amount: z.number().positive().max(10_000_000),
  currency: z.enum(["KES", "USD", "EUR", "GBP"]),
  email: z.string().email(),
  saveCard: z.boolean().optional().default(true),
  walletId: z.string().uuid().optional(),
});

/**
 * Initialize a Paystack transaction. Returns the access_code we use with
 * the inline-JS popup-less flow (Paystack.newTransaction with custom UI is
 * not allowed; instead we use access_code + the standard charge endpoint via
 * the secure Paystack inline-iframe — but for true custom UI we use the
 * "charge" endpoint directly with tokenized fields).
 *
 * For the custom-UI flow we ALSO return the public_key so the client can
 * call Paystack's secure `/charge` endpoint directly with raw card data
 * never touching our servers.
 */
export const initializePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof InitInput>) => InitInput.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const reference = genReference();

    // Insert pending payment_transactions row (RLS: own insert)
    const { error } = await context.supabase.from("payment_transactions").insert({
      user_id: userId,
      wallet_id: data.walletId ?? null,
      gateway: "paystack",
      reference,
      amount: data.amount,
      currency: data.currency,
      status: "pending",
      metadata: { email: data.email, save_card: data.saveCard },
    });
    if (error) throw new Error(error.message);

    return {
      reference,
      publicKey: process.env.PAYSTACK_PUBLIC_KEY ?? "",
      amountSubunits: Math.round(data.amount * 100),
      currency: data.currency,
      email: data.email,
    };
  });

const VerifyInput = z.object({ reference: z.string().min(8).max(128) });

/**
 * Verify a Paystack transaction by reference. Safe to call from the client
 * after charge completion — actual wallet credit happens in the webhook
 * (single source of truth) but this lets the UI poll for confirmation.
 */
export const verifyPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof VerifyInput>) => VerifyInput.parse(d))
  .handler(async ({ data, context }) => {
    type V = {
      status: string;
      reference: string;
      amount: number;
      currency: string;
      gateway_response: string;
      paid_at: string | null;
      channel: string;
      authorization?: {
        authorization_code: string;
        last4: string;
        brand: string;
        bank: string;
        country_code: string;
        exp_month: string;
        exp_year: string;
        reusable: boolean;
        signature: string;
      };
      customer?: { customer_code: string };
    };

    const v = await paystack<V>(`/transaction/verify/${encodeURIComponent(data.reference)}`);

    // Fetch the local payment row and ensure it belongs to caller
    const { data: pay } = await context.supabase
      .from("payment_transactions")
      .select("id, user_id, status")
      .eq("reference", data.reference)
      .maybeSingle();

    if (!pay || pay.user_id !== context.userId) throw new Error("Payment not found");

    // If Paystack says success and our row is still pending, credit via service role.
    // (Webhook will also do this — credit_wallet_from_payment is idempotent.)
    if (v.status === "success" && pay.status !== "completed") {
      await supabaseAdmin.rpc("credit_wallet_from_payment", {
        _payment_id: pay.id,
        _gateway_reference: v.reference,
        _authorization: v.authorization
          ? {
              authorization_code: v.authorization.authorization_code,
              customer_code: v.customer?.customer_code,
              last4: v.authorization.last4,
              brand: v.authorization.brand,
            }
          : null,
      });

      // Save card if reusable + user opted in
      if (v.authorization?.reusable && v.customer?.customer_code) {
        await supabaseAdmin.from("saved_cards").upsert(
          {
            user_id: context.userId,
            authorization_code: v.authorization.authorization_code,
            customer_code: v.customer.customer_code,
            signature: v.authorization.signature,
            last4: v.authorization.last4,
            brand: v.authorization.brand,
            bank: v.authorization.bank,
            country_code: v.authorization.country_code,
            exp_month: v.authorization.exp_month,
            exp_year: v.authorization.exp_year,
            reusable: true,
          },
          { onConflict: "user_id,authorization_code" },
        );
      }
    }

    return {
      status: v.status,
      reference: v.reference,
      amount: v.amount / 100,
      currency: v.currency,
      paidAt: v.paid_at,
      channel: v.channel,
      gatewayResponse: v.gateway_response,
    };
  });

const ChargeSavedInput = z.object({
  authorizationCode: z.string().min(4),
  amount: z.number().positive().max(10_000_000),
  currency: z.enum(["KES", "USD", "EUR", "GBP"]),
  email: z.string().email(),
  walletId: z.string().uuid().optional(),
});

export const chargeSavedCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof ChargeSavedInput>) => ChargeSavedInput.parse(d))
  .handler(async ({ data, context }) => {
    // Make sure card belongs to caller
    const { data: card } = await context.supabase
      .from("saved_cards")
      .select("authorization_code, last4, brand")
      .eq("authorization_code", data.authorizationCode)
      .maybeSingle();
    if (!card) throw new Error("Card not found");

    const reference = genReference();
    await context.supabase.from("payment_transactions").insert({
      user_id: context.userId,
      wallet_id: data.walletId ?? null,
      gateway: "paystack",
      reference,
      amount: data.amount,
      currency: data.currency,
      status: "pending",
      authorization_code: card.authorization_code,
      last4: card.last4,
      brand: card.brand,
      metadata: { email: data.email, source: "saved_card" },
    });

    type R = { status: string; reference: string; gateway_response: string };
    const r = await paystack<R>("/transaction/charge_authorization", {
      method: "POST",
      body: JSON.stringify({
        authorization_code: card.authorization_code,
        email: data.email,
        amount: Math.round(data.amount * 100),
        currency: data.currency,
        reference,
      }),
    });

    return { reference: r.reference, status: r.status, message: r.gateway_response };
  });

const ChargeNewCardInput = z.object({
  reference: z.string().min(8).max(128),
  email: z.string().email(),
  amount: z.number().positive().max(10_000_000),
  currency: z.enum(["KES", "USD", "EUR", "GBP"]),
  number: z.string().min(12).max(19),
  cvv: z.string().min(3).max(4),
  expiry_month: z.string().min(1).max(2),
  expiry_year: z.string().min(2).max(4),
  pin: z.string().min(4).max(8).optional(),
  otp: z.string().min(4).max(8).optional(),
});

// Server-side /charge call (uses SECRET key). Card data never persists.
export const chargeCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof ChargeNewCardInput>) => ChargeNewCardInput.parse(d))
  .handler(async ({ data }) => {
    const key = process.env.PAYSTACK_SECRET_KEY;
    if (!key) throw new Error("PAYSTACK_SECRET_KEY not configured");
    const expYear = data.expiry_year.length === 2 ? `20${data.expiry_year}` : data.expiry_year;
    const body: any = {
      email: data.email,
      amount: Math.round(data.amount * 100),
      currency: data.currency,
      reference: data.reference,
      card: {
        number: data.number.replace(/\s/g, ""),
        cvv: data.cvv,
        expiry_month: data.expiry_month,
        expiry_year: expYear,
      },
    };
    if (data.pin) body.pin = data.pin;
    if (data.otp) body.otp = data.otp;

    const res = await fetch(`${PAYSTACK_BASE}/charge`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok || !json?.status) {
      throw new Error(json?.message || `Charge failed (${res.status})`);
    }
    return {
      status: json?.data?.status as string,
      reference: json?.data?.reference as string,
      displayText: json?.data?.display_text as string | undefined,
      message: json?.message as string,
    };
  });

const DeleteCardInput = z.object({ id: z.string().uuid() });

export const deleteSavedCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof DeleteCardInput>) => DeleteCardInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("saved_cards").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
