// M-Pesa edge function: STK push (C2B) + B2C withdrawal.
// Action routed by body { action: "stk_push" | "b2c_send" }.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";
import { b64, darajaBase, darajaTimestamp, getAccessToken, normalizePhone } from "../_shared/daraja.ts";

const APP_ORIGIN = Deno.env.get("APP_URL") ?? "https://aban-nova-nexus.lovable.app";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SB_FN_BASE = `${SUPABASE_URL}/functions/v1`;

async function stkPush(body: { phone: string; amount: number }, ctx: Awaited<ReturnType<typeof requireAuth>>) {
  const shortcode = (Deno.env.get("DARAJA_STK_SHORTCODE") ?? Deno.env.get("DARAJA_B2C_SHORTCODE"))?.trim();
  const passkey = Deno.env.get("DARAJA_PASS_KEY")?.trim();
  if (!shortcode || !passkey) return { ok: false, message: "Daraja STK not configured" };

  const phone = normalizePhone(body.phone);
  if (!/^254(7|1)\d{8}$/.test(phone)) {
    return { ok: false, message: "Enter a valid Safaricom number (e.g. 07XX XXX XXX)" };
  }

  const apiRef = `ABNFUND${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const timestamp = darajaTimestamp();
  const password = b64(`${shortcode}${passkey}${timestamp}`);
  const callbackUrl = Deno.env.get("DARAJA_STK_CALLBACK_URL") ?? `${SB_FN_BASE}/mpesa-stk-callback`;
  const txType = (Deno.env.get("DARAJA_STK_TX_TYPE") ?? "CustomerPayBillOnline").trim();

  const { data: dep, error: depErr } = await ctx.supabase
    .from("deposits")
    .insert({
      user_id: ctx.userId, method: "mpesa", amount: body.amount, currency: "KES",
      status: "pending", provider_reference: apiRef,
      metadata: { phone, gateway: "daraja_stk", timestamp },
    })
    .select().single();
  if (depErr) return { ok: false, message: depErr.message };

  try {
    const token = await getAccessToken();
    const res = await fetch(`${darajaBase()}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        BusinessShortCode: shortcode, Password: password, Timestamp: timestamp,
        TransactionType: txType, Amount: body.amount, PartyA: phone, PartyB: shortcode,
        PhoneNumber: phone, CallBackURL: callbackUrl,
        AccountReference: apiRef.slice(0, 12), TransactionDesc: "AbanRemit wallet top-up",
      }),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok || json?.ResponseCode !== "0") {
      const reason = json?.errorMessage || json?.ResponseDescription || json?.CustomerMessage || `HTTP ${res.status}`;
      await ctx.supabase.from("deposits").update({
        status: "failed", metadata: { phone, gateway: "daraja_stk", error: reason },
      }).eq("id", dep.id);
      return { ok: false, depositId: dep.id, apiRef, message: `M-Pesa: ${reason}` };
    }
    await ctx.supabase.from("deposits").update({
      metadata: { phone, gateway: "daraja_stk", timestamp,
        MerchantRequestID: json.MerchantRequestID, CheckoutRequestID: json.CheckoutRequestID },
    }).eq("id", dep.id);
    return {
      ok: true, depositId: dep.id, apiRef,
      checkoutRequestId: json.CheckoutRequestID,
      message: json.CustomerMessage ?? "Check your phone and enter your M-Pesa PIN to complete the deposit.",
    };
  } catch (e) {
    const msg = (e as Error).message ?? "STK push failed";
    await ctx.supabase.from("deposits").update({
      status: "failed", metadata: { phone, gateway: "daraja_stk", error: msg },
    }).eq("id", dep.id);
    return { ok: false, depositId: dep.id, apiRef, message: msg };
  }
}

async function b2cSend(body: { phone: string; amount: number; walletId?: string; pin: string; narration?: string; commandID?: string }, ctx: Awaited<ReturnType<typeof requireAuth>>) {
  const shortcode = Deno.env.get("DARAJA_B2C_SHORTCODE");
  const initiator = Deno.env.get("DARAJA_B2C_INITIATOR_NAME") ?? Deno.env.get("DARAJA_B2C_INTIATOR_NAME");
  const credential = Deno.env.get("DARAJA_B2C_SECURITY_CREDENTIAL");
  const resultUrl = Deno.env.get("DARAJA_B2C_RESULT_URL") ?? `${SB_FN_BASE}/mpesa-b2c-result`;
  const timeoutUrl = Deno.env.get("DARAJA_B2C_TIMEOUT_URL") ?? `${SB_FN_BASE}/mpesa-b2c-timeout`;
  if (!shortcode || !initiator || !credential) throw new Error("Daraja B2C configuration incomplete");

  const { error: pinErr } = await ctx.supabase.rpc("verify_transaction_pin", { _pin: body.pin });
  if (pinErr) throw new Error(pinErr.message);

  let walletId = body.walletId;
  let walletCurrency: string | null = null;
  if (!walletId) {
    const { data: w } = await ctx.supabase
      .from("wallets").select("id, currency")
      .eq("user_id", ctx.userId).eq("currency", "KES")
      .order("is_primary", { ascending: false }).limit(1).maybeSingle();
    if (!w) throw new Error("KES wallet not found");
    walletId = w.id; walletCurrency = w.currency;
  } else {
    const { data: w } = await ctx.supabase
      .from("wallets").select("id, currency")
      .eq("id", walletId).eq("user_id", ctx.userId).maybeSingle();
    if (!w) throw new Error("Wallet not found");
    walletCurrency = w.currency;
  }
  if (walletCurrency !== "KES") throw new Error("M-Pesa withdrawals must use a KES wallet");

  const phone = normalizePhone(body.phone);
  const reference = `MPB2C-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const fee = Math.round(body.amount * 0.01);
  const cmd = body.commandID ?? "BusinessPayment";

  const { data: wd, error: wdErr } = await ctx.supabase
    .from("withdrawals").insert({
      user_id: ctx.userId, wallet_id: walletId, method: "mpesa",
      amount: body.amount, currency: "KES", status: "pending", fee, reference,
      narration: body.narration ?? `M-Pesa to ${phone}`,
      destination: { phone, channel: "daraja_b2c", commandID: cmd },
    }).select().single();
  if (wdErr) throw new Error(wdErr.message);

  const { error: lockErr } = await ctx.supabase.rpc("lock_funds_for_withdrawal", {
    _withdrawal_id: wd.id, _wallet_id: walletId, _amount: body.amount, _fee: fee,
  });
  if (lockErr) {
    await ctx.supabase.from("withdrawals").update({ status: "failed", failure_reason: lockErr.message }).eq("id", wd.id);
    throw new Error(lockErr.message);
  }

  try {
    const token = await getAccessToken();
    const res = await fetch(`${darajaBase()}/mpesa/b2c/v3/paymentrequest`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        OriginatorConversationID: reference, InitiatorName: initiator,
        SecurityCredential: credential, CommandID: cmd, Amount: body.amount,
        PartyA: shortcode, PartyB: phone, Remarks: body.narration ?? "AbanRemit payout",
        QueueTimeOutURL: timeoutUrl, ResultURL: resultUrl, Occasion: reference.slice(0, 20),
      }),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok || json.ResponseCode !== "0") {
      const reason = json?.errorMessage || json?.ResponseDescription || `HTTP ${res.status}`;
      await ctx.supabase.rpc("reverse_withdrawal", { _withdrawal_id: wd.id, _reason: reason });
      throw new Error(reason);
    }
    await ctx.supabase.from("withdrawals").update({
      status: "processing", gateway_reference: json.ConversationID ?? null,
    }).eq("id", wd.id);
    return {
      ok: true, withdrawalId: wd.id, reference, conversationId: json.ConversationID,
      message: "Payout dispatched. You'll be notified when M-Pesa confirms.",
    };
  } catch (e) {
    try {
      await ctx.supabase.rpc("reverse_withdrawal", { _withdrawal_id: wd.id, _reason: (e as Error).message ?? "daraja_request_failed" });
    } catch { /* ignore */ }
    throw e;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const ctx = await requireAuth(req);
    const body = await req.json();
    const action = body.action as string;
    if (action === "stk_push") return jsonResponse(await stkPush(body, ctx));
    if (action === "b2c_send") return jsonResponse(await b2cSend(body, ctx));
    return jsonResponse({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    const msg = (e as Error).message ?? "error";
    const status = msg === "Unauthorized" ? 401 : 400;
    return jsonResponse({ error: msg }, { status });
  }
});
