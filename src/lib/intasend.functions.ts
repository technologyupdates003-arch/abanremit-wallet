import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const StkInput = z.object({
  phone: z.string().min(9).max(15),
  amount: z.number().positive().max(300_000),
});

function normalizePhone(p: string): string {
  const digits = p.replace(/\D/g, "");
  if (digits.startsWith("254")) return digits;
  if (digits.startsWith("0")) return "254" + digits.slice(1);
  if (digits.startsWith("7") || digits.startsWith("1")) return "254" + digits;
  return digits;
}

export const intasendStkPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof StkInput>) => StkInput.parse(d))
  .handler(async ({ data, context }) => {
    const secret = process.env.INTASEND_SECRET_KEY;
    const pub = process.env.INTASEND_PUBLIC_KEY ?? process.env.INTASEND_PUBLISHABLE_KEY;
    const testMode = (process.env.INTASEND_TEST_MODE ?? "false").toLowerCase() === "true";
    if (!secret || !pub) throw new Error("IntaSend credentials not configured");

    const base = testMode ? "https://sandbox.intasend.com" : "https://payment.intasend.com";
    const phone = normalizePhone(data.phone);

    // Create a pending deposit row for reconciliation
    const apiRef = `ABN-FUND-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const { data: dep, error: depErr } = await context.supabase
      .from("deposits")
      .insert({
        user_id: context.userId,
        method: "mpesa",
        amount: data.amount,
        currency: "KES" as never,
        status: "pending" as never,
        provider_reference: apiRef,
        metadata: { phone, gateway: "intasend" } as never,
      })
      .select()
      .single();
    if (depErr) throw new Error(depErr.message);

    const res = await fetch(`${base}/api/v1/payment/mpesa-stk-push/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${secret}`,
      },
      body: JSON.stringify({
        public_key: pub,
        phone_number: phone,
        amount: data.amount,
        api_ref: apiRef,
        currency: "KES",
      }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      await context.supabase
        .from("deposits")
        .update({ status: "failed" as never, metadata: { error: json, phone, gateway: "intasend" } as never })
        .eq("id", dep.id);
      throw new Error(json?.detail || json?.errors?.[0]?.detail || "IntaSend STK push failed");
    }

    return {
      ok: true,
      depositId: dep.id,
      invoiceId: json?.invoice?.invoice_id ?? null,
      apiRef,
      message: "STK push sent — check your phone and enter your M-Pesa PIN.",
    };
  });
