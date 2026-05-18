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
    const secret = process.env.INTASEND_SECRET_KEY?.trim();
    const pub = (process.env.INTASEND_PUBLISHABLE_KEY ?? process.env.INTASEND_PUBLIC_KEY)?.trim();
    const testMode = (process.env.INTASEND_TEST_MODE ?? "false").toLowerCase() === "true";
    if (!secret || !pub) throw new Error("IntaSend credentials not configured");

    // Validate key format to catch swapped/mismatched keys early
    const secretIsLive = secret.startsWith("ISSecretKey_live_");
    const secretIsTest = secret.startsWith("ISSecretKey_test_");
    const pubIsLive = pub.startsWith("ISPubKey_live_");
    const pubIsTest = pub.startsWith("ISPubKey_test_");
    if (!secretIsLive && !secretIsTest) {
      throw new Error("INTASEND_SECRET_KEY must start with ISSecretKey_live_ or ISSecretKey_test_. Check you set the SECRET key (not the publishable key).");
    }
    if (!pubIsLive && !pubIsTest) {
      throw new Error("INTASEND_PUBLISHABLE_KEY must start with ISPubKey_live_ or ISPubKey_test_.");
    }
    if (secretIsLive !== pubIsLive) {
      throw new Error("IntaSend key mismatch: secret and publishable keys must both be LIVE or both be TEST.");
    }
    const useTest = testMode || secretIsTest;
    const base = process.env.INTASEND_BASE_URL ?? (useTest ? "https://sandbox.intasend.com" : "https://payment.intasend.com");
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

    const res = await fetch(`${base.replace(/\/$/, "")}/api/v1/payment/mpesa-stk-push/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${secret}`,
        "INTASEND_PUBLIC_API_KEY": pub,
      },
      body: JSON.stringify({
        public_key: pub,
        phone_number: phone,
        amount: data.amount.toFixed(2),
        api_ref: apiRef,
        currency: "KES",
        host: process.env.APP_URL ?? "https://aban-nova-nexus.lovable.app",
      }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      await context.supabase
        .from("deposits")
        .update({ status: "failed" as never, metadata: { error: json, phone, gateway: "intasend" } as never })
        .eq("id", dep.id);
      const gatewayMessage =
        json?.detail ||
        json?.message ||
        json?.errors?.[0]?.detail ||
        json?.errors?.[0]?.message ||
        (typeof json?.errors === "object" ? Object.values(json.errors).flat().join(" ") : null);
      console.error("IntaSend STK push failed", { status: res.status, apiRef, phone, response: json });
      return {
        ok: false,
        depositId: dep.id,
        apiRef,
        message: gatewayMessage ? `IntaSend: ${gatewayMessage}` : `IntaSend STK push failed (${res.status})`,
      };
    }

    return {
      ok: true,
      depositId: dep.id,
      invoiceId: json?.invoice?.invoice_id ?? null,
      apiRef,
      message: "STK push sent — check your phone and enter your M-Pesa PIN.",
    };
  });
