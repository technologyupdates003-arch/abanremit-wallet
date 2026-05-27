// Wallet operations: lookup, transfer (with SMS), convert, get rate, set PIN, has PIN.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { requireAuth, AuthCtx } from "../_shared/auth.ts";
import { sendSms, walletTransferReceivedMsg, walletTransferSentMsg } from "../_shared/talksasa.ts";

async function lookup(b: any, ctx: AuthCtx) {
  const { data: row, error } = await ctx.supabase.rpc("lookup_wallet_by_number", { _wallet_number: b.walletNumber });
  if (error) throw new Error(error.message);
  const arr = row as any[] | null;
  if (!arr || arr.length === 0) return { found: false };
  const r = arr[0];
  return { found: true, walletId: r.wallet_id, userId: r.wallet_user_id, currency: r.currency, fullName: r.full_name, phone: r.phone, status: r.status };
}

async function transfer(b: any, ctx: AuthCtx, req: Request) {
  const ip = req.headers.get("x-forwarded-for") ?? null;
  const ua = req.headers.get("user-agent") ?? null;

  const { data: recipientRows } = await ctx.supabase.rpc("lookup_wallet_by_number", { _wallet_number: b.toWalletNumber });
  const recipient = (recipientRows as any[] | null)?.[0];

  const { data: res, error } = await ctx.supabase.rpc("tx_execute_transfer", {
    _idempotency_key: b.idempotencyKey, _from_wallet_id: b.fromWalletId,
    _to_wallet_number: b.toWalletNumber, _amount: b.amount,
    _narration: b.narration ?? null, _pin: b.pin, _ip: ip, _user_agent: ua,
  });
  if (error) {
    const m = error.message;
    if (m.includes("invalid_pin")) throw new Error("Incorrect PIN");
    if (m.includes("pin_locked_until")) throw new Error("PIN locked. Try again later.");
    if (m.includes("pin_not_set")) throw new Error("Transaction PIN not set");
    if (m.includes("insufficient_balance")) throw new Error("Insufficient balance");
    if (m.includes("recipient_not_found")) throw new Error("Recipient wallet not found");
    if (m.includes("rate_unavailable")) throw new Error("Exchange rate unavailable for this wallet pair");
    if (m.includes("cannot_send_to_self")) throw new Error("You cannot send to yourself");
    if (m.includes("velocity_limit")) throw new Error("Too many transfers — please wait a moment");
    throw new Error(m);
  }
  const result = res as any;

  // SMS — best effort, non-blocking on failure
  try {
    const [{ data: senderProfile }, { data: senderWallet }, { data: recipientProfile }, { data: recipientWallet }] = await Promise.all([
      ctx.admin.from("profiles").select("full_name, phone").eq("id", ctx.userId).maybeSingle(),
      ctx.admin.from("wallets").select("balance, currency").eq("id", b.fromWalletId).maybeSingle(),
      recipient?.wallet_user_id ? ctx.admin.from("profiles").select("phone, full_name").eq("id", recipient.wallet_user_id).maybeSingle() : Promise.resolve({ data: null }),
      recipient?.wallet_id ? ctx.admin.from("wallets").select("balance, currency").eq("id", recipient.wallet_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    await Promise.all([
      senderProfile?.phone ? sendSms(senderProfile.phone, walletTransferSentMsg({
        reference: result.reference, amount: b.amount,
        currency: result.source_currency ?? senderWallet?.currency ?? "KES",
        recipientName: recipient?.full_name, recipientWallet: b.toWalletNumber,
        destinationAmount: result.destination_amount ?? null,
        destinationCurrency: result.destination_currency ?? recipient?.currency ?? null,
        newBalance: senderWallet?.balance != null ? Number(senderWallet.balance) : null,
      })) : Promise.resolve(),
      recipientProfile?.phone ? sendSms(recipientProfile.phone, walletTransferReceivedMsg({
        reference: result.reference, amount: result.destination_amount ?? b.amount,
        currency: result.destination_currency ?? recipientWallet?.currency ?? recipient?.currency ?? "KES",
        senderName: senderProfile?.full_name,
        newBalance: recipientWallet?.balance != null ? Number(recipientWallet.balance) : null,
      })) : Promise.resolve(),
    ]);
  } catch (e) { console.error("wallet transfer sms failed", e); }

  return result;
}

async function convert(b: any, ctx: AuthCtx, req: Request) {
  const ip = req.headers.get("x-forwarded-for") ?? null;
  const ua = req.headers.get("user-agent") ?? null;
  const { data: res, error } = await ctx.supabase.rpc("tx_convert_currency", {
    _idempotency_key: b.idempotencyKey, _from_wallet_id: b.fromWalletId,
    _to_wallet_id: b.toWalletId, _amount: b.amount, _pin: b.pin, _ip: ip, _user_agent: ua,
  });
  if (error) {
    const m = error.message;
    if (m.includes("invalid_pin")) throw new Error("Incorrect PIN");
    if (m.includes("pin_locked_until")) throw new Error("PIN locked. Try again later.");
    if (m.includes("insufficient_balance")) throw new Error("Insufficient balance");
    if (m.includes("rate_unavailable")) throw new Error("Conversion rate unavailable for this pair");
    if (m.includes("same_currency")) throw new Error("Wallets share the same currency");
    throw new Error(m);
  }
  return res;
}

async function getRate(b: any, ctx: AuthCtx) {
  const { data: rate } = await ctx.supabase.from("exchange_rates")
    .select("rate, spread").eq("from_currency", b.from).eq("to_currency", b.to).maybeSingle();
  if (!rate) return { available: false };
  const effective = Number(rate.rate) * (1 - Number(rate.spread));
  return { available: true, rate: effective };
}

async function setPin(b: any, ctx: AuthCtx) {
  const { error } = await ctx.supabase.rpc("set_transaction_pin", { _pin: b.pin });
  if (error) throw new Error(error.message);
  return { ok: true };
}

async function hasPin(ctx: AuthCtx) {
  const { data } = await ctx.supabase.from("profiles")
    .select("transaction_pin_hash").eq("id", ctx.userId).maybeSingle();
  return { hasPin: !!data?.transaction_pin_hash };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const ctx = await requireAuth(req);
    const body = await req.json();
    switch (body.action) {
      case "lookup": return jsonResponse(await lookup(body, ctx));
      case "transfer": return jsonResponse(await transfer(body, ctx, req));
      case "convert": return jsonResponse(await convert(body, ctx, req));
      case "get_rate": return jsonResponse(await getRate(body, ctx));
      case "set_pin": return jsonResponse(await setPin(body, ctx));
      case "has_pin": return jsonResponse(await hasPin(ctx));
      default: return jsonResponse({ error: "unknown action" }, { status: 400 });
    }
  } catch (e) {
    const msg = (e as Error).message ?? "error";
    const status = msg === "Unauthorized" ? 401 : 400;
    return jsonResponse({ error: msg }, { status });
  }
});
