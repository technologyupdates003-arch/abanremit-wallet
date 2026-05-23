import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendSms, depositConfirmMsg } from "@/lib/talksasa.server";

// Daraja Lipa Na M-Pesa Online (STK push) callback.
// Configured via DARAJA_STK_CALLBACK_URL or defaulted to
//   {origin}/api/public/daraja-stk-callback
export const Route = createFileRoute("/api/public/daraja-stk-callback")({
  server: {
    handlers: {
      GET: async () => new Response("ok", { status: 200 }),
      POST: async ({ request }) => {
        const body = await request.text();
        let payload: any = {};
        try { payload = JSON.parse(body); } catch {}

        const stk = payload?.Body?.stkCallback ?? {};
        const checkoutId: string | undefined = stk.CheckoutRequestID;
        const merchantId: string | undefined = stk.MerchantRequestID;
        const resultCode = stk.ResultCode;
        const resultDesc: string | undefined = stk.ResultDesc;

        // Persist raw event
        await supabaseAdmin.from("withdrawal_webhooks").insert({
          event: `daraja_stk.${resultCode === 0 ? "success" : "failed"}`,
          payload: payload as never,
          processed: false,
        });

        if (!checkoutId) return new Response("ok", { status: 200 });

        // Locate the matching pending deposit by CheckoutRequestID in metadata
        const { data: deps } = await supabaseAdmin
          .from("deposits")
          .select("*")
          .eq("method", "mpesa")
          .order("created_at", { ascending: false })
          .limit(50);
        const dep = (deps ?? []).find(
          (d: any) => (d.metadata as any)?.CheckoutRequestID === checkoutId
            || (d.metadata as any)?.MerchantRequestID === merchantId,
        );
        if (!dep) return new Response("ok", { status: 200 });
        if (dep.status === "completed" || dep.status === "failed") {
          return new Response("ok", { status: 200 });
        }

        // Parse callback metadata
        const items: any[] = stk?.CallbackMetadata?.Item ?? [];
        const meta: Record<string, any> = {};
        for (const it of items) meta[it.Name] = it.Value;

        if (resultCode === 0) {
          const { data: wallet } = await supabaseAdmin
            .from("wallets")
            .select("id, balance, wallet_number")
            .eq("user_id", dep.user_id)
            .eq("currency", "KES" as never)
            .order("is_primary", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (wallet) {
            const amount = Number(meta.Amount ?? dep.amount);
            const newBalance = Number(wallet.balance ?? 0) + amount;
            await supabaseAdmin
              .from("wallets")
              .update({ balance: newBalance } as never)
              .eq("id", wallet.id);

            await supabaseAdmin
              .from("deposits")
              .update({
                status: "completed" as never,
                wallet_id: wallet.id,
                provider_reference: meta.MpesaReceiptNumber ?? dep.provider_reference,
                metadata: {
                  ...(dep.metadata as any),
                  gateway: "daraja_stk",
                  receipt: meta.MpesaReceiptNumber,
                  transactionDate: meta.TransactionDate,
                  phone: meta.PhoneNumber ?? (dep.metadata as any)?.phone,
                } as never,
              })
              .eq("id", dep.id);

            await supabaseAdmin.from("wallet_transactions").insert({
              user_id: dep.user_id,
              wallet_id: wallet.id,
              type: "deposit" as never,
              status: "completed" as never,
              amount,
              currency: "KES" as never,
              fee: 0,
              reference: meta.MpesaReceiptNumber ?? dep.provider_reference,
              description: "M-Pesa STK deposit",
              metadata: { gateway: "daraja_stk", checkoutId } as never,
            } as never);

            await supabaseAdmin.from("notifications").insert({
              user_id: dep.user_id,
              title: "Wallet funded",
              body: `KES ${amount.toLocaleString()} received via M-Pesa. New balance KES ${newBalance.toLocaleString()}.`,
            } as never);

            // SMS
            try {
              const { data: profile } = await supabaseAdmin
                .from("profiles").select("phone").eq("id", dep.user_id).maybeSingle();
              if (profile?.phone) {
                const reference = String(meta.MpesaReceiptNumber ?? dep.provider_reference ?? "").slice(-10).toUpperCase();
                await sendSms(
                  profile.phone,
                  depositConfirmMsg({
                    reference,
                    amount,
                    fromPhone: meta.PhoneNumber ? String(meta.PhoneNumber) : (dep.metadata as any)?.phone,
                    walletNumber: wallet.wallet_number,
                    newBalance,
                  }),
                );
              }
            } catch (e) { console.error("deposit sms failed", e); }
          }
        } else {
          await supabaseAdmin
            .from("deposits")
            .update({
              status: "failed" as never,
              metadata: { ...(dep.metadata as any), gateway: "daraja_stk", error: resultDesc, resultCode } as never,
            })
            .eq("id", dep.id);
        }

        return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: "ok" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
