// Daraja M-Pesa STK push (C2B) callback — public, no JWT.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, okResponse } from "../_shared/cors.ts";
import { adminClient } from "../_shared/auth.ts";
import { depositConfirmMsg, sendSms } from "../_shared/talksasa.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method === "GET") return okResponse();
  const admin = adminClient();
  const body = await req.text();
  let payload: any = {};
  try { payload = JSON.parse(body); } catch { /* ignore */ }

  const stk = payload?.Body?.stkCallback ?? {};
  const checkoutId: string | undefined = stk.CheckoutRequestID;
  const merchantId: string | undefined = stk.MerchantRequestID;
  const resultCode = stk.ResultCode;
  const resultDesc: string | undefined = stk.ResultDesc;

  await admin.from("withdrawal_webhooks").insert({
    event: `daraja_stk.${resultCode === 0 ? "success" : "failed"}`,
    payload, processed: false,
  });

  if (!checkoutId) return okResponse();

  const { data: deps } = await admin.from("deposits")
    .select("*").eq("method", "mpesa").order("created_at", { ascending: false }).limit(50);
  const dep = (deps ?? []).find((d: any) =>
    (d.metadata as any)?.CheckoutRequestID === checkoutId ||
    (d.metadata as any)?.MerchantRequestID === merchantId,
  );
  if (!dep) return okResponse();
  if (dep.status === "completed" || dep.status === "failed") return okResponse();

  const items: any[] = stk?.CallbackMetadata?.Item ?? [];
  const meta: Record<string, any> = {};
  for (const it of items) meta[it.Name] = it.Value;

  if (resultCode === 0) {
    const { data: wallet } = await admin.from("wallets")
      .select("id, balance, wallet_number")
      .eq("user_id", dep.user_id).eq("currency", "KES")
      .order("is_primary", { ascending: false }).limit(1).maybeSingle();

    if (wallet) {
      const amount = Number(meta.Amount ?? dep.amount);
      const newBalance = Number(wallet.balance ?? 0) + amount;
      await admin.from("wallets").update({ balance: newBalance }).eq("id", wallet.id);
      await admin.from("deposits").update({
        status: "completed", wallet_id: wallet.id,
        provider_reference: meta.MpesaReceiptNumber ?? dep.provider_reference,
        metadata: { ...(dep.metadata as any), gateway: "daraja_stk",
          receipt: meta.MpesaReceiptNumber, transactionDate: meta.TransactionDate,
          phone: meta.PhoneNumber ?? (dep.metadata as any)?.phone },
      }).eq("id", dep.id);

      await admin.from("wallet_transactions").insert({
        user_id: dep.user_id, wallet_id: wallet.id, type: "deposit", status: "completed",
        amount, currency: "KES", fee: 0,
        reference: meta.MpesaReceiptNumber ?? dep.provider_reference,
        description: "M-Pesa STK deposit",
        metadata: { gateway: "daraja_stk", checkoutId },
      });
      await admin.from("notifications").insert({
        user_id: dep.user_id, title: "Wallet funded",
        body: `KES ${amount.toLocaleString()} received via M-Pesa. New balance KES ${newBalance.toLocaleString()}.`,
      });

      try {
        const { data: profile } = await admin.from("profiles").select("phone").eq("id", dep.user_id).maybeSingle();
        if (profile?.phone) {
          const reference = String(meta.MpesaReceiptNumber ?? dep.provider_reference ?? "").slice(-10).toUpperCase();
          await sendSms(profile.phone, depositConfirmMsg({
            reference, amount,
            fromPhone: meta.PhoneNumber ? String(meta.PhoneNumber) : (dep.metadata as any)?.phone,
            walletNumber: wallet.wallet_number, newBalance,
          }));
        }
      } catch (e) { console.error("deposit sms failed", e); }
    }
  } else {
    await admin.from("deposits").update({
      status: "failed",
      metadata: { ...(dep.metadata as any), gateway: "daraja_stk", error: resultDesc, resultCode },
    }).eq("id", dep.id);
  }

  return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: "ok" }), {
    status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
  });
});
