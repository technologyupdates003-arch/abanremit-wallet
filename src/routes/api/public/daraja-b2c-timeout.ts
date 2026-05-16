import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/daraja-b2c-timeout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.text();
        let payload: any = {};
        try { payload = JSON.parse(body); } catch {}
        const originator = payload?.OriginatorConversationID ?? payload?.Result?.OriginatorConversationID;
        if (originator) {
          const { data: wd } = await supabaseAdmin
            .from("withdrawals")
            .select("*")
            .eq("reference", originator)
            .maybeSingle();
          if (wd && wd.status !== "completed" && wd.status !== "reversed" && wd.status !== "failed") {
            await supabaseAdmin.rpc("reverse_withdrawal" as never, {
              _withdrawal_id: wd.id,
              _reason: "daraja_timeout",
            } as never);
          }
        }
        await supabaseAdmin.from("withdrawal_webhooks").insert({
          event: "b2c.timeout",
          payload: payload as never,
          processed: true,
          processed_at: new Date().toISOString(),
        });
        return new Response("ok", { status: 200 });
      },
    },
  },
});
