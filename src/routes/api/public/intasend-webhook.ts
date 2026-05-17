import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendSms, depositConfirmMsg, ref as genRef } from "@/lib/talksasa.server";

// IntaSend webhook receiver. Configure URL in IntaSend dashboard:
//   {origin}/api/public/intasend-webhook
// Optional shared challenge: set INTASEND_WEBHOOK_CHALLENGE; IntaSend echoes
// it in the `challenge` field of every payload — we reject mismatches.
export const Route = createFileRoute("/api/public/intasend-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.text();
        let payload: any = {};
        try { payload = JSON.parse(body); } catch {}

        const expectedChallenge = process.env.INTASEND_WEBHOOK_CHALLENGE;
        if (expectedChallenge && payload?.challenge !== expectedChallenge) {
          return new Response("invalid challenge", { status: 401 });
        }

        // Persist raw event (best-effort)
        await supabaseAdmin.from("withdrawal_webhooks").insert({
          event: `intasend.${payload?.state ?? payload?.event ?? "unknown"}`,
          payload: payload as never,
          processed: false,
        });

        const apiRef: string | undefined = payload?.api_ref ?? payload?.invoice?.api_ref;
        const state: string | undefined = payload?.state ?? payload?.invoice?.state;
        const invoiceId: string | undefined = payload?.invoice_id ?? payload?.invoice?.invoice_id;

        if (!apiRef) {
          return new Response("ok", { status: 200 });
        }

        const { data: dep } = await supabaseAdmin
          .from("deposits")
          .select("*")
          .eq("provider_reference", apiRef)
          .maybeSingle();

        if (!dep) return new Response("ok", { status: 200 });
        if (dep.status === "completed" || dep.status === "failed") {
          return new Response("ok", { status: 200 });
        }

        const success = ["COMPLETE", "COMPLETED", "PAID", "SUCCESS"].includes(String(state ?? "").toUpperCase());
        const failed = ["FAILED", "RETRY", "CANCELLED", "REVERSED"].includes(String(state ?? "").toUpperCase());

        if (success) {
          // Find user's KES wallet
          const { data: wallet } = await supabaseAdmin
            .from("wallets")
            .select("id, balance, wallet_number")
            .eq("user_id", dep.user_id)
            .eq("currency", "KES" as never)
            .order("is_primary", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (wallet) {
            const newBalance = Number(wallet.balance ?? 0) + Number(dep.amount);
            await supabaseAdmin
              .from("wallets")
              .update({ balance: newBalance } as never)
              .eq("id", wallet.id);

            await supabaseAdmin
              .from("deposits")
              .update({
                status: "completed" as never,
                wallet_id: wallet.id,
                metadata: { ...(dep.metadata as any), invoice_id: invoiceId, gateway_state: state } as never,
              })
              .eq("id", dep.id);

            // SMS notification
            const { data: profile } = await supabaseAdmin
              .from("profiles")
              .select("phone")
              .eq("id", dep.user_id)
              .maybeSingle();
            if (profile?.phone) {
              const reference = (dep.provider_reference ?? genRef()).slice(-10).toUpperCase();
              await sendSms(
                profile.phone,
                depositConfirmMsg({
                  reference,
                  amount: Number(dep.amount),
                  fromPhone: (dep.metadata as any)?.phone,
                  walletNumber: wallet.wallet_number,
                  newBalance,
                }),
              );
            }
          }
        } else if (failed) {
          await supabaseAdmin
            .from("deposits")
            .update({
              status: "failed" as never,
              metadata: { ...(dep.metadata as any), gateway_state: state, invoice_id: invoiceId } as never,
            })
            .eq("id", dep.id);
        }

        await supabaseAdmin
          .from("withdrawal_webhooks")
          .update({ processed: true, processed_at: new Date().toISOString() })
          .eq("event", `intasend.${state ?? "unknown"}`)
          .eq("payload->>api_ref", apiRef);

        return new Response("ok", { status: 200 });
      },
      GET: async () => new Response("ok", { status: 200 }),
    },
  },
});
