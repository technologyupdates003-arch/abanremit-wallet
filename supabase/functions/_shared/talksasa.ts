export function normalizeMsisdn(p: string): string {
  const d = (p ?? "").replace(/\D/g, "");
  if (d.startsWith("254")) return d;
  if (d.startsWith("0")) return "254" + d.slice(1);
  if (d.startsWith("7") || d.startsWith("1")) return "254" + d;
  return d;
}

function fmtMoney(n: number, ccy = "KES") {
  return `${ccy} ${Number(n).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtKes(n: number) { return fmtMoney(n, "KES"); }
function shortDateTime(d = new Date()) {
  const pad = (x: number) => String(x).padStart(2, "0");
  let h = d.getHours();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)} at ${h}:${pad(d.getMinutes())} ${ampm}`;
}

export async function sendSms(toRaw: string, message: string): Promise<{ ok: boolean; error?: string }> {
  const token = Deno.env.get("TALKSASA_API_TOKEN");
  const base = (Deno.env.get("TALKSASA_API_URL") ?? "https://bulksms.talksasa.com/api/v3").replace(/\/+$/, "");
  const sender = Deno.env.get("TALKSASA_SENDER_ID") ?? "AbanRemit";
  if (!token) return { ok: false, error: "TALKSASA_API_TOKEN not configured" };
  const to = normalizeMsisdn(toRaw);
  if (!to || to.length < 10) return { ok: false, error: "invalid recipient" };
  try {
    const res = await fetch(`${base}/sms/send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ recipient: to, sender_id: sender, type: "plain", message }),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok || json?.status === "error") return { ok: false, error: json?.message ?? `HTTP ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "sms send failed" };
  }
}

export function welcomeMsg(name?: string | null) {
  const who = name?.split(" ")[0] ?? "there";
  return `Karibu ${who}! Your AbanRemit wallet is ready. Fund via M-Pesa, send money home, and trade Aban Coin — all in one app. Need help? Reply HELP. STOP to opt out.`;
}

export function withdrawalConfirmMsg(o: { reference: string; amount: number; toPhone: string; walletNumber?: string | null; newBalance?: number | null; dailyLimitRemaining?: number | null }) {
  const when = shortDateTime();
  const wallet = o.walletNumber ? ` Wallet ${o.walletNumber}.` : "";
  const bal = o.newBalance != null ? ` New AbanRemit balance is ${fmtKes(o.newBalance)}.` : "";
  const lim = o.dailyLimitRemaining != null ? ` Amount you can transact within the day is ${fmtKes(o.dailyLimitRemaining)}.` : "";
  return `${o.reference} Confirmed. ${fmtKes(o.amount)} withdrawn from your AbanRemit wallet to ${normalizeMsisdn(o.toPhone)} on ${when}.${wallet}${bal}${lim} STOP *456*9*5#`;
}

export function depositConfirmMsg(o: { reference: string; amount: number; fromPhone?: string | null; walletNumber?: string | null; newBalance?: number | null }) {
  const when = shortDateTime();
  const from = o.fromPhone ? ` from ${normalizeMsisdn(o.fromPhone)}` : "";
  const wallet = o.walletNumber ? ` Wallet ${o.walletNumber}.` : "";
  const bal = o.newBalance != null ? ` New AbanRemit balance is ${fmtKes(o.newBalance)}.` : "";
  return `${o.reference} Confirmed. You have received ${fmtKes(o.amount)}${from} on ${when}.${wallet}${bal} Thank you for using AbanRemit.`;
}

export function walletTransferSentMsg(o: { reference: string; amount: number; currency: string; recipientName?: string | null; recipientWallet?: string | null; destinationAmount?: number | null; destinationCurrency?: string | null; newBalance?: number | null }) {
  const when = shortDateTime();
  const who = o.recipientName || o.recipientWallet || "wallet";
  const converted = o.destinationCurrency && o.destinationAmount != null && o.destinationCurrency !== o.currency
    ? ` Recipient gets ${fmtMoney(o.destinationAmount, o.destinationCurrency)}.` : "";
  const bal = o.newBalance != null ? ` New balance is ${fmtMoney(o.newBalance, o.currency)}.` : "";
  return `${o.reference} Confirmed. ${fmtMoney(o.amount, o.currency)} sent to ${who} on ${when}.${converted}${bal} Thank you for using AbanRemit.`;
}

export function walletTransferReceivedMsg(o: { reference: string; amount: number; currency: string; senderName?: string | null; newBalance?: number | null }) {
  const when = shortDateTime();
  const from = o.senderName ? ` from ${o.senderName}` : "";
  const bal = o.newBalance != null ? ` New balance is ${fmtMoney(o.newBalance, o.currency)}.` : "";
  return `${o.reference} Confirmed. You have received ${fmtMoney(o.amount, o.currency)}${from} on ${when}.${bal} Thank you for using AbanRemit.`;
}
