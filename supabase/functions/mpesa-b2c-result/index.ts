// Daraja B2C result callback — public, no JWT.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, okResponse } from "../_shared/cors.ts";
import { adminClient } from "../_shared/auth.ts";
import { sendSms, withdrawalConfirmMsg } from "../_shared/talksasa.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const admin = adminClient();
  const body = await req.text();
  let payload: any = {};
  try { payload = JSON.parse(body); } catch { /* ignore */ }
  const result = payload?.Result ?? {};
  const originator = result.OriginatorConversationID as string | undefined;
  const conversation = result.ConversationID as string | undefined;
  const code = result.ResultCode;
  const desc = result.ResultDesc as string | undefined;

  if (!originator && !conversation) return okResponse();

  let wd: any = null;
  if (originator) {
    const { data } = await admin.from("withdrawals").select("*").eq("reference", originator).maybeSingle();
    wd = data;
  }
  if (!wd && conversation) {
    const { data } = await admin.from("withdrawals").select("*").eq("gateway_reference", conversation).maybeSingle();
    wd = data;
  }
  if (!wd) return okResponse();
  if (wd.status === "completed" || wd.status === "failed" || wd.status === "reversed") return okResponse();

  const params = result?.ResultParameters?.ResultParameter ?? [];
  const meta: Record<string, any> = {};
  if (Array.isArray(params)) for (const p of params) meta[p.Key] = p.Value;

  if (code === 0) {
    await admin.rpc("finalize_withdrawal", {
      _withdrawal_id: wd.id,
      _gateway_reference: meta.TransactionReceipt ?? conversation ?? null,
    });
    try {
      const [{ data: profile }, { data: wallet }] = await Promise.all([
        admin.from("profiles").select("phone").eq("id", wd.user_id).maybeSingle(),
        wd.wallet_id ? admin.from("wallets").select("balance, wallet_number").eq("id", wd.wallet_id).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      const toPhone = (wd.destination as any)?.phone ?? "";
      if (profile?.phone && toPhone) {
        const reference = (meta.TransactionReceipt ?? wd.reference ?? "").toString().slice(-10).toUpperCase();
        await sendSms(profile.phone, withdrawalConfirmMsg({
          reference: reference || "ABNWITHDR", amount: Number(wd.amount), toPhone,
          walletNumber: wallet?.wallet_number ?? null,
          newBalance: wallet?.balance != null ? Number(wallet.balance) : null,
          dailyLimitRemaining: 500_000,
        }));
      }
    } catch (e) { console.error("withdrawal sms failed", e); }
  } else {
    await admin.rpc("reverse_withdrawal", { _withdrawal_id: wd.id, _reason: desc ?? `daraja_failure_${code}` });
  }

  await admin.from("withdrawal_webhooks").insert({
    event: code === 0 ? "b2c.success" : "b2c.failed",
    payload, processed: true, processed_at: new Date().toISOString(),
  });

  return okResponse();
});
