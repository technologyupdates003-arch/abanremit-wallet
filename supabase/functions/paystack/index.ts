// Paystack edge function: init, verify, charge new card, charge saved card,
// list banks, resolve account, add bank, set default bank, delete bank,
// delete saved card, initiate bank withdrawal.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { requireAuth, AuthCtx } from "../_shared/auth.ts";

const PAYSTACK_BASE = "https://api.paystack.co";

function genRef(prefix = "ABN") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
}

async function paystack<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const key = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not configured");
  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const json = await res.json() as { status: boolean; message: string; data: T };
  if (!res.ok || !json.status) throw new Error(json.message || `Paystack error (${res.status})`);
  return json.data;
}

async function initPayment(b: any, ctx: AuthCtx) {
  const reference = genRef();
  const { error } = await ctx.supabase.from("payment_transactions").insert({
    user_id: ctx.userId, wallet_id: b.walletId ?? null, gateway: "paystack",
    reference, amount: b.amount, currency: b.currency, status: "pending",
    metadata: { email: b.email, save_card: b.saveCard ?? true },
  });
  if (error) throw new Error(error.message);
  return {
    reference, publicKey: Deno.env.get("PAYSTACK_PUBLIC_KEY") ?? "",
    amountSubunits: Math.round(b.amount * 100), currency: b.currency, email: b.email,
  };
}

async function verifyPayment(b: any, ctx: AuthCtx) {
  type V = any;
  const v: V = await paystack(`/transaction/verify/${encodeURIComponent(b.reference)}`);
  const { data: pay } = await ctx.supabase
    .from("payment_transactions").select("id, user_id, status")
    .eq("reference", b.reference).maybeSingle();
  if (!pay || pay.user_id !== ctx.userId) throw new Error("Payment not found");
  if (v.status === "success" && pay.status !== "completed") {
    await ctx.admin.rpc("credit_wallet_from_payment", {
      _payment_id: pay.id, _gateway_reference: v.reference,
      _authorization: v.authorization ? {
        authorization_code: v.authorization.authorization_code,
        customer_code: v.customer?.customer_code,
        last4: v.authorization.last4, brand: v.authorization.brand,
      } : null,
    });
    if (v.authorization?.reusable && v.customer?.customer_code) {
      await ctx.admin.from("saved_cards").upsert({
        user_id: ctx.userId, authorization_code: v.authorization.authorization_code,
        customer_code: v.customer.customer_code, signature: v.authorization.signature,
        last4: v.authorization.last4, brand: v.authorization.brand,
        bank: v.authorization.bank, country_code: v.authorization.country_code,
        exp_month: v.authorization.exp_month, exp_year: v.authorization.exp_year, reusable: true,
      }, { onConflict: "user_id,authorization_code" });
    }
  }
  return {
    status: v.status, reference: v.reference, amount: v.amount / 100,
    currency: v.currency, paidAt: v.paid_at, channel: v.channel, gatewayResponse: v.gateway_response,
  };
}

async function chargeCard(b: any) {
  const expYear = String(b.expiry_year).length === 2 ? `20${b.expiry_year}` : String(b.expiry_year);
  const body: any = {
    email: b.email, amount: Math.round(b.amount * 100), currency: b.currency, reference: b.reference,
    card: { number: String(b.number).replace(/\s/g, ""), cvv: b.cvv, expiry_month: b.expiry_month, expiry_year: expYear },
  };
  if (b.pin) body.pin = b.pin;
  if (b.otp) body.otp = b.otp;
  const key = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (!key) throw new Error("PAYSTACK_SECRET_KEY not configured");
  const res = await fetch(`${PAYSTACK_BASE}/charge`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || !json?.status) throw new Error(json?.message || `Charge failed (${res.status})`);
  return {
    status: json?.data?.status as string, reference: json?.data?.reference as string,
    displayText: json?.data?.display_text, message: json?.message,
  };
}

async function chargeSavedCard(b: any, ctx: AuthCtx) {
  const { data: card } = await ctx.supabase.from("saved_cards")
    .select("authorization_code, last4, brand").eq("authorization_code", b.authorizationCode).maybeSingle();
  if (!card) throw new Error("Card not found");
  const reference = genRef();
  await ctx.supabase.from("payment_transactions").insert({
    user_id: ctx.userId, wallet_id: b.walletId ?? null, gateway: "paystack",
    reference, amount: b.amount, currency: b.currency, status: "pending",
    authorization_code: card.authorization_code, last4: card.last4, brand: card.brand,
    metadata: { email: b.email, source: "saved_card" },
  });
  const r: any = await paystack("/transaction/charge_authorization", {
    method: "POST",
    body: JSON.stringify({
      authorization_code: card.authorization_code, email: b.email,
      amount: Math.round(b.amount * 100), currency: b.currency, reference,
    }),
  });
  return { reference: r.reference, status: r.status, message: r.gateway_response };
}

async function listBanks(b: any) {
  const currency = b.currency ?? "NGN";
  const banks: any[] = await paystack(`/bank?currency=${currency}&perPage=100`);
  return banks.filter((x) => x.active).map((x) => ({ name: x.name, code: x.code, currency: x.currency, type: x.type }));
}

async function resolveAccount(b: any) {
  const r: any = await paystack(`/bank/resolve?account_number=${b.accountNumber}&bank_code=${b.bankCode}`);
  return { accountNumber: r.account_number, accountName: r.account_name };
}

async function addBank(b: any, ctx: AuthCtx) {
  const r: any = await paystack(`/bank/resolve?account_number=${b.accountNumber}&bank_code=${b.bankCode}`);
  const accountName = r.account_name;
  const recipient: any = await paystack("/transferrecipient", {
    method: "POST",
    body: JSON.stringify({
      type: "nuban", name: accountName, account_number: b.accountNumber,
      bank_code: b.bankCode, currency: b.currency,
    }),
  });
  if (b.setDefault) {
    await ctx.supabase.from("linked_banks").update({ is_default: false }).eq("user_id", ctx.userId);
  }
  const { data: bank, error } = await ctx.supabase.from("linked_banks").insert({
    user_id: ctx.userId, bank_name: b.bankName, bank_code: b.bankCode,
    account_number: b.accountNumber, account_name: accountName, currency: b.currency,
    recipient_code: recipient.recipient_code, is_default: !!b.setDefault,
    verified_at: new Date().toISOString(),
  }).select().single();
  if (error) throw new Error(error.message);
  return bank;
}

async function setDefaultBank(b: any, ctx: AuthCtx) {
  await ctx.supabase.from("linked_banks").update({ is_default: false }).eq("user_id", ctx.userId);
  const { error } = await ctx.supabase.from("linked_banks").update({ is_default: true })
    .eq("id", b.id).eq("user_id", ctx.userId);
  if (error) throw new Error(error.message);
  return { ok: true };
}

async function deleteBank(b: any, ctx: AuthCtx) {
  const { error } = await ctx.supabase.from("linked_banks").delete().eq("id", b.id).eq("user_id", ctx.userId);
  if (error) throw new Error(error.message);
  return { ok: true };
}

async function deleteSavedCard(b: any, ctx: AuthCtx) {
  const { error } = await ctx.supabase.from("saved_cards").delete().eq("id", b.id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

async function initiateWithdrawal(b: any, ctx: AuthCtx) {
  const { error: pinErr } = await ctx.supabase.rpc("verify_transaction_pin", { _pin: b.pin });
  if (pinErr) {
    if (pinErr.message.includes("pin_locked_until")) throw new Error("PIN locked. Try again later.");
    if (pinErr.message.includes("invalid_pin")) throw new Error("Incorrect PIN");
    if (pinErr.message.includes("pin_not_set")) throw new Error("Transaction PIN not set");
    throw new Error(pinErr.message);
  }
  const { data: wallet } = await ctx.supabase.from("wallets")
    .select("id, currency, balance, user_id").eq("id", b.walletId).maybeSingle();
  if (!wallet) throw new Error("Wallet not found");
  const { data: bank } = await ctx.supabase.from("linked_banks")
    .select("id, recipient_code, currency, account_number, account_name, bank_name")
    .eq("id", b.bankId).maybeSingle();
  if (!bank || !bank.recipient_code) throw new Error("Bank not found or unverified");
  if (bank.currency && bank.currency !== wallet.currency) throw new Error("Bank currency mismatch");
  const { data: profile } = await ctx.supabase.from("profiles")
    .select("kyc_status").eq("id", ctx.userId).maybeSingle();
  if (!profile || profile.kyc_status !== "approved") throw new Error("KYC verification required");

  const { data: existing } = await ctx.supabase.from("withdrawals")
    .select("id, status, reference").eq("user_id", ctx.userId).eq("idempotency_key", b.idempotencyKey).maybeSingle();
  if (existing) return { withdrawalId: existing.id, status: existing.status, reference: existing.reference };

  const fee = Math.round(b.amount * 0.015 * 100) / 100;
  const reference = genRef("WD");

  const { data: wd, error: insErr } = await ctx.supabase.from("withdrawals").insert({
    user_id: ctx.userId, wallet_id: wallet.id, bank_id: bank.id,
    amount: b.amount, fee, currency: wallet.currency, method: "bank", status: "pending",
    reference, recipient_code: bank.recipient_code,
    narration: b.narration ?? "AbanRemit Withdrawal", idempotency_key: b.idempotencyKey,
    destination: { bank_name: bank.bank_name, account_number: bank.account_number, account_name: bank.account_name },
  }).select().single();
  if (insErr || !wd) throw new Error(insErr?.message ?? "Failed to create withdrawal");

  const { error: lockErr } = await ctx.admin.rpc("lock_funds_for_withdrawal", {
    _withdrawal_id: wd.id, _wallet_id: wallet.id, _amount: b.amount, _fee: fee,
  });
  if (lockErr) {
    await ctx.admin.from("withdrawals").update({ status: "cancelled", failure_reason: lockErr.message }).eq("id", wd.id);
    throw new Error(lockErr.message.includes("insufficient_balance") ? "Insufficient balance" : lockErr.message);
  }

  try {
    const t: any = await paystack("/transfer", {
      method: "POST",
      body: JSON.stringify({
        source: "balance", amount: Math.round(b.amount * 100),
        recipient: bank.recipient_code, reason: b.narration ?? "AbanRemit Withdrawal",
        reference, currency: wallet.currency,
      }),
    });
    await ctx.admin.from("withdrawals").update({
      status: "processing", gateway_reference: t.transfer_code,
    }).eq("id", wd.id);
    return { withdrawalId: wd.id, reference, status: "processing" };
  } catch (e) {
    await ctx.admin.rpc("reverse_withdrawal", { _withdrawal_id: wd.id, _reason: (e as Error).message });
    throw new Error(`Transfer failed: ${(e as Error).message}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const ctx = await requireAuth(req);
    const body = await req.json();
    const action = body.action as string;
    switch (action) {
      case "init": return jsonResponse(await initPayment(body, ctx));
      case "verify": return jsonResponse(await verifyPayment(body, ctx));
      case "charge_card": return jsonResponse(await chargeCard(body));
      case "charge_saved_card": return jsonResponse(await chargeSavedCard(body, ctx));
      case "list_banks": return jsonResponse(await listBanks(body));
      case "resolve_account": return jsonResponse(await resolveAccount(body));
      case "add_bank": return jsonResponse(await addBank(body, ctx));
      case "set_default_bank": return jsonResponse(await setDefaultBank(body, ctx));
      case "delete_bank": return jsonResponse(await deleteBank(body, ctx));
      case "delete_saved_card": return jsonResponse(await deleteSavedCard(body, ctx));
      case "initiate_withdrawal": return jsonResponse(await initiateWithdrawal(body, ctx));
      default: return jsonResponse({ error: "unknown action" }, { status: 400 });
    }
  } catch (e) {
    const msg = (e as Error).message ?? "error";
    const status = msg === "Unauthorized" ? 401 : 400;
    return jsonResponse({ error: msg }, { status });
  }
});
