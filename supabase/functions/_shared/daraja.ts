import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

export function normalizePhone(p: string): string {
  const d = (p ?? "").replace(/\D/g, "");
  if (d.startsWith("254")) return d;
  if (d.startsWith("0")) return "254" + d.slice(1);
  if (d.startsWith("7") || d.startsWith("1")) return "254" + d;
  return d;
}

export function darajaBase(): string {
  const env = (Deno.env.get("DARAJA_ENV") ?? "production").toLowerCase();
  return env === "sandbox" ? "https://sandbox.safaricom.co.ke" : "https://api.safaricom.co.ke";
}

export function darajaTimestamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    d.getFullYear().toString() +
    p(d.getMonth() + 1) + p(d.getDate()) +
    p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds())
  );
}

export async function getAccessToken(): Promise<string> {
  const key = Deno.env.get("DARAJA_CONSUMER_KEY")?.trim();
  const secret = Deno.env.get("DARAJA_CONSUMER_SECRET")?.trim();
  if (!key || !secret) throw new Error("Daraja credentials not configured");
  const auth = encodeBase64(new TextEncoder().encode(`${key}:${secret}`));
  const res = await fetch(`${darajaBase()}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    throw new Error(`Daraja auth failed: ${json?.errorMessage ?? res.status}`);
  }
  return json.access_token as string;
}

export function b64(text: string): string {
  return encodeBase64(new TextEncoder().encode(text));
}
