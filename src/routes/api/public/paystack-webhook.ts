import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { depositConfirmMsg, sendSms } from "@/lib/talksasa.server";

type PaystackEvent = {
  event: string;
  data: {
    id: number;
    reference: string;
    amount: number;
    currency: string;
    status: string;
    gateway_response?: string;
    paid_at?: string | null;
    channel?: string;
    ip_address?: string;
    authorization?: {
      authorization_code: string;
      last4: string;
      brand: string;
      bank?: string;
      country_code?: string;
      exp_month?: string;
      exp_year?: string;
      reusable?: boolean;
      signature?: string;
    };
    customer?: { customer_code: string; email: string };
  };
};

export const Route = createFileRoute("/api/public/paystack-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.PAYSTACK_SECRET_KEY;
        if (!secret) return new Response("Misconfigured", { status: 500 });

        const signature = request.headers.get("x-paystack-signature") ?? "";
        const body = await request.text();
        const expected = createHmac("sha512", secret).update(body).digest("hex");

        const sigBuf = Buffer.from(signature, "hex");
        const expBuf = Buffer.from(expected, "hex");
        if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
          return new Response("Invalid signature", { status: 401 });
        }

        let payload: PaystackEvent;
        try {
          payload = JSON.parse(body);
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        // Idempotency: dedupe by event id + reference
        const idemKey = `paystack:${payload.event}:${payload.data?.id}:${payload.data?.reference}`;
        const { error: idemErr } = await supabaseAdmin
          .from("idempotency_keys")
          .insert({ key: idemKey, scope: "paystack_webhook" });
        if (idemErr) {
          // Duplicate — already processed
          return new Response("ok", { status: 200 });
        }

        if (payload.event === "charge.success") {
          const ref = payload.data.reference;
          const { data: pay } = await supabaseAdmin
            .from("payment_transactions")
            .select("id, user_id, status, amount, currency, wallet_id, reference")
            .eq("reference", ref)
            .maybeSingle();

          if (!pay) {
            // Not ours — ack to stop retries
            return new Response("ok", { status: 200 });
          }

          if (pay.status !== "completed") {
            const auth = payload.data.authorization;
            await supabaseAdmin.rpc("credit_wallet_from_payment", {
              _payment_id: pay.id,
              _gateway_reference: ref,
              _authorization: auth
                ? {
                    authorization_code: auth.authorization_code,
                    customer_code: payload.data.customer?.customer_code,
                    last4: auth.last4,
                    brand: auth.brand,
                  }
                : null,
            });

            try {
              const [{ data: profile }, { data: wallet }] = await Promise.all([
                supabaseAdmin.from("profiles").select("phone").eq("id", pay.user_id).maybeSingle(),
                pay.wallet_id
                  ? supabaseAdmin.from("wallets").select("wallet_number, balance").eq("id", pay.wallet_id).maybeSingle()
                  : Promise.resolve({ data: null } as any),
              ]);
              if (profile?.phone) {
                await sendSms(profile.phone, depositConfirmMsg({
                  reference: String(pay.reference ?? ref).slice(-10).toUpperCase(),
                  amount: Number(pay.amount),
                  walletNumber: wallet?.wallet_number ?? null,
                  newBalance: wallet?.balance != null ? Number(wallet.balance) : null,
                }));
              }
            } catch (e) {
              console.error("card deposit sms failed", e);
            }

            if (auth?.reusable && payload.data.customer?.customer_code) {
              await supabaseAdmin.from("saved_cards").upsert(
                {
                  user_id: pay.user_id,
                  authorization_code: auth.authorization_code,
                  customer_code: payload.data.customer.customer_code,
                  signature: auth.signature ?? null,
                  last4: auth.last4,
                  brand: auth.brand,
                  bank: auth.bank ?? null,
                  country_code: auth.country_code ?? null,
                  exp_month: auth.exp_month ?? null,
                  exp_year: auth.exp_year ?? null,
                  reusable: true,
                },
                { onConflict: "user_id,authorization_code" },
              );
            }
          }
        } else if (payload.event === "charge.failed") {
          await supabaseAdmin
            .from("payment_transactions")
            .update({
              status: "failed",
              failure_reason: payload.data.gateway_response ?? "charge_failed",
            })
            .eq("reference", payload.data.reference);
        } else if (
          payload.event === "transfer.success" ||
          payload.event === "transfer.failed" ||
          payload.event === "transfer.reversed"
        ) {
          // Audit log
          await supabaseAdmin.from("withdrawal_webhooks").insert({
            event: payload.event,
            payload: payload as never,
            signature,
            processed: false,
          });

          const ref = payload.data.reference;
          const { data: wd } = await supabaseAdmin
            .from("withdrawals")
            .select("id, status")
            .eq("reference", ref)
            .maybeSingle();

          if (wd) {
            if (payload.event === "transfer.success") {
              await supabaseAdmin.rpc("finalize_withdrawal" as never, {
                _withdrawal_id: wd.id,
                _gateway_reference: String(payload.data.id ?? ref),
              } as never);
            } else {
              await supabaseAdmin.rpc("reverse_withdrawal" as never, {
                _withdrawal_id: wd.id,
                _reason: payload.data.gateway_response ?? payload.event,
              } as never);
            }
            await supabaseAdmin
              .from("withdrawal_webhooks")
              .update({ processed: true, processed_at: new Date().toISOString() })
              .eq("event", payload.event)
              .eq("payload->>reference", ref);
          }
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
