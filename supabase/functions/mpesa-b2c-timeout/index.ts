// Daraja B2C timeout callback — public, no JWT.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, okResponse } from "../_shared/cors.ts";
import { adminClient } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const admin = adminClient();
  const body = await req.text();
  let payload: any = {};
  try { payload = JSON.parse(body); } catch { /* ignore */ }
  const originator = payload?.OriginatorConversationID ?? payload?.Result?.OriginatorConversationID;
  if (originator) {
    const { data: wd } = await admin.from("withdrawals").select("*").eq("reference", originator).maybeSingle();
    if (wd && wd.status !== "completed" && wd.status !== "reversed" && wd.status !== "failed") {
      await admin.rpc("reverse_withdrawal", { _withdrawal_id: wd.id, _reason: "daraja_timeout" });
    }
  }
  await admin.from("withdrawal_webhooks").insert({
    event: "b2c.timeout", payload, processed: true, processed_at: new Date().toISOString(),
  });
  return okResponse();
});
