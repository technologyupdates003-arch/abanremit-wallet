// Paystack webhook — public, no JWT. Verifies HMAC signature.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, okResponse } from "../_shared/cors.ts";
import { adminClient } from "../_shared/auth.ts";
import { depositConfirmMsg, sendSms } from "../_shared/talksasa.ts";
import { createHmac } from "node:crypto";

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const secret = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (!secret) return new Response("Misconfigured", { status: 500, headers: corsHeaders });

  const admin = adminClient();
  const signature = req.headers.get("x-paystack-signature") ?? "";
  const body = await req.text();
  const expected = createHmac("sha512", secret).update(body).digest("hex");
  if (!timingSafeEqualHex(signature, expected)) {
    return new Response("Invalid signature", { status: 401, headers: corsHeaders });
  }

  let payload: any;
  try { payload = JSON.parse(body); } catch { return new Response("Invalid JSON", { status: 400, headers: corsHeaders }); }

  const idemKey = `paystack:${payload.event}:${payload.data?.id}:${payload.data?.reference}`;
  const { error: idemErr } = await admin.from("idempotency_keys").insert({ key: idemKey, scope: "paystack_webhook" });
  if (idemErr) return okResponse();

  if (payload.event === "charge.success") {
    const ref = payload.data.reference;
    const { data: pay } = await admin.from("payment_transactions")
      .select("id, user_id, status, amount, currency, wallet_id, reference").eq("reference", ref).maybeSingle();
    if (!pay) return okResponse();

    if (pay.status !== "completed") {
      const auth = payload.data.authorization;
      await admin.rpc("credit_wallet_from_payment", {
        _payment_id: pay.id, _gateway_reference: ref,
        _authorization: auth ? {
          authorization_code: auth.authorization_code,
          customer_code: payload.data.customer?.customer_code,
          last4: auth.last4, brand: auth.brand,
        } : null,
      });

      try {
        const [{ data: profile }, { data: wallet }] = await Promise.all([
          admin.from("profiles").select("phone").eq("id", pay.user_id).maybeSingle(),
          pay.wallet_id ? admin.from("wallets").select("wallet_number, balance").eq("id", pay.wallet_id).maybeSingle() : Promise.resolve({ data: null }),
        ]);
        if (profile?.phone) {
          await sendSms(profile.phone, depositConfirmMsg({
            reference: String(pay.reference ?? ref).slice(-10).toUpperCase(),
            amount: Number(pay.amount),
            walletNumber: wallet?.wallet_number ?? null,
            newBalance: wallet?.balance != null ? Number(wallet.balance) : null,
          }));
        }
      } catch (e) { console.error("card deposit sms failed", e); }

      if (auth?.reusable && payload.data.customer?.customer_code) {
        await admin.from("saved_cards").upsert({
          user_id: pay.user_id, authorization_code: auth.authorization_code,
          customer_code: payload.data.customer.customer_code, signature: auth.signature ?? null,
          last4: auth.last4, brand: auth.brand, bank: auth.bank ?? null,
          country_code: auth.country_code ?? null, exp_month: auth.exp_month ?? null,
          exp_year: auth.exp_year ?? null, reusable: true,
        }, { onConflict: "user_id,authorization_code" });
      }
    }
  } else if (payload.event === "charge.failed") {
    await admin.from("payment_transactions").update({
      status: "failed", failure_reason: payload.data.gateway_response ?? "charge_failed",
    }).eq("reference", payload.data.reference);
  } else if (payload.event === "transfer.success" || payload.event === "transfer.failed" || payload.event === "transfer.reversed") {
    await admin.from("withdrawal_webhooks").insert({ event: payload.event, payload, signature, processed: false });
    const ref = payload.data.reference;
    const { data: wd } = await admin.from("withdrawals").select("id, status").eq("reference", ref).maybeSingle();
    if (wd) {
      if (payload.event === "transfer.success") {
        await admin.rpc("finalize_withdrawal", { _withdrawal_id: wd.id, _gateway_reference: String(payload.data.id ?? ref) });
      } else {
        await admin.rpc("reverse_withdrawal", { _withdrawal_id: wd.id, _reason: payload.data.gateway_response ?? payload.event });
      }
      await admin.from("withdrawal_webhooks").update({ processed: true, processed_at: new Date().toISOString() })
        .eq("event", payload.event).eq("payload->>reference", ref);
    }
  }

  return okResponse();
});
