import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendSms, withdrawalConfirmMsg } from "@/lib/talksasa.server";

export const Route = createFileRoute("/api/public/daraja-b2c-result")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.text();
        let payload: any = {};
        try { payload = JSON.parse(body); } catch {}
        const result = payload?.Result ?? {};
        const originator = result.OriginatorConversationID as string | undefined;
        const conversation = result.ConversationID as string | undefined;
        const code = result.ResultCode;
        const desc = result.ResultDesc as string | undefined;

        if (!originator && !conversation) {
          return new Response("ok", { status: 200 });
        }

        let wd: any = null;
        if (originator) {
          const { data } = await supabaseAdmin
            .from("withdrawals")
            .select("*")
            .eq("reference", originator)
            .maybeSingle();
          wd = data;
        }
        if (!wd && conversation) {
          const { data } = await supabaseAdmin
            .from("withdrawals")
            .select("*")
            .eq("gateway_reference", conversation)
            .maybeSingle();
          wd = data;
        }
        if (!wd) return new Response("ok", { status: 200 });

        // Idempotency
        if (wd.status === "completed" || wd.status === "failed" || wd.status === "reversed") {
          return new Response("ok", { status: 200 });
        }

        const params = result?.ResultParameters?.ResultParameter ?? [];
        const meta: Record<string, any> = {};
        if (Array.isArray(params)) {
          for (const p of params) meta[p.Key] = p.Value;
        }

        if (code === 0) {
          await supabaseAdmin.rpc("finalize_withdrawal" as never, {
            _withdrawal_id: wd.id,
            _gateway_reference: meta.TransactionReceipt ?? conversation ?? null,
          } as never);
        } else {
          await supabaseAdmin.rpc("reverse_withdrawal" as never, {
            _withdrawal_id: wd.id,
            _reason: desc ?? `daraja_failure_${code}`,
          } as never);
        }

        await supabaseAdmin.from("withdrawal_webhooks").insert({
          event: code === 0 ? "b2c.success" : "b2c.failed",
          payload: payload as never,
          processed: true,
          processed_at: new Date().toISOString(),
        });

        return new Response("ok", { status: 200 });
      },
    },
  },
});
