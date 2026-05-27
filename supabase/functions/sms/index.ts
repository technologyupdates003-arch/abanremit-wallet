// SMS edge function — send transactional messages via TalkSasa.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";
import { sendSms, welcomeMsg } from "../_shared/talksasa.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    await requireAuth(req);
    const body = await req.json();
    if (body.action === "welcome") {
      const res = await sendSms(body.phone, welcomeMsg(body.fullName));
      return jsonResponse(res);
    }
    if (body.action === "custom") {
      const res = await sendSms(body.phone, body.message);
      return jsonResponse(res);
    }
    return jsonResponse({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    const msg = (e as Error).message ?? "error";
    return jsonResponse({ error: msg }, { status: msg === "Unauthorized" ? 401 : 400 });
  }
});
