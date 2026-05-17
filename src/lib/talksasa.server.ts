// Talksasa SMS helper (server-only). Pattern based on Talksasa REST API:
// POST {TALKSASA_API_URL}/sms/send  with Authorization: Bearer {token}
// Common payload: { recipient, sender_id, type:"plain", message }

export function normalizeMsisdn(p: string): string {
  const d = (p ?? "").replace(/\D/g, "");
  if (d.startsWith("254")) return d;
  if (d.startsWith("0")) return "254" + d.slice(1);
  if (d.startsWith("7") || d.startsWith("1")) return "254" + d;
  return d;
}

function fmtKes(n: number) {
  return `KES ${Number(n).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function shortDateTime(d = new Date()) {
  const pad = (x: number) => String(x).padStart(2, "0");
  const day = pad(d.getDate());
  const mo = pad(d.getMonth() + 1);
  const yr = String(d.getFullYear()).slice(2);
  let h = d.getHours();
  const m = pad(d.getMinutes());
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12; if (h === 0) h = 12;
  return `${day}/${mo}/${yr} at ${h}:${m} ${ampm}`;
}

export function ref(prefix = "ABN") {
  // 10-char alphanumeric MPesa-ish ref
  let s = "";
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
  for (let i = 0; i < 10; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return prefix === "" ? s : s;
}

export async function sendSms(toRaw: string, message: string): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.TALKSASA_API_TOKEN;
  const baseRaw = process.env.TALKSASA_API_URL ?? "https://bulksms.talksasa.com/api/v3";
  const sender = process.env.TALKSASA_SENDER_ID ?? "AbanRemit";
  if (!token) return { ok: false, error: "TALKSASA_API_TOKEN not configured" };
  const base = baseRaw.replace(/\/+$/, "");
  const to = normalizeMsisdn(toRaw);
  if (!to || to.length < 10) return { ok: false, error: "invalid recipient" };

  try {
    const res = await fetch(`${base}/sms/send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        recipient: to,
        sender_id: sender,
        type: "plain",
        message,
      }),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok || json?.status === "error") {
      return { ok: false, error: json?.message ?? `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "sms send failed" };
  }
}

export function welcomeMsg(name?: string | null) {
  const who = name?.split(" ")[0] ?? "there";
  return `Karibu ${who}! Your AbanRemit wallet is ready. Fund via M-Pesa, send money home, and trade Aban Coin — all in one app. Need help? Reply HELP. STOP to opt out.`;
}

export function withdrawalConfirmMsg(opts: {
  reference: string;
  amount: number;
  toPhone: string;
  walletNumber?: string | null;
  newBalance?: number | null;
  dailyLimitRemaining?: number | null;
}) {
  const when = shortDateTime();
  const wallet = opts.walletNumber ? ` Wallet ${opts.walletNumber}.` : "";
  const bal = opts.newBalance != null ? ` New AbanRemit balance is ${fmtKes(opts.newBalance)}.` : "";
  const lim = opts.dailyLimitRemaining != null ? ` Amount you can transact within the day is ${fmtKes(opts.dailyLimitRemaining)}.` : "";
  return `${opts.reference} Confirmed. ${fmtKes(opts.amount)} withdrawn from your AbanRemit wallet to ${normalizeMsisdn(opts.toPhone)} on ${when}.${wallet}${bal}${lim} STOP *456*9*5#`;
}

export function depositConfirmMsg(opts: {
  reference: string;
  amount: number;
  fromPhone?: string | null;
  walletNumber?: string | null;
  newBalance?: number | null;
}) {
  const when = shortDateTime();
  const from = opts.fromPhone ? ` from ${normalizeMsisdn(opts.fromPhone)}` : "";
  const wallet = opts.walletNumber ? ` Wallet ${opts.walletNumber}.` : "";
  const bal = opts.newBalance != null ? ` New AbanRemit balance is ${fmtKes(opts.newBalance)}.` : "";
  return `${opts.reference} Confirmed. You have received ${fmtKes(opts.amount)}${from} on ${when}.${wallet}${bal} Thank you for using AbanRemit.`;
}

export function sendReceiveTransferMsg(opts: {
  reference: string;
  amount: number;
  toPhone: string;
  newBalance?: number | null;
}) {
  const when = shortDateTime();
  const bal = opts.newBalance != null ? ` New AbanRemit balance is ${fmtKes(opts.newBalance)}.` : "";
  return `${opts.reference} Confirmed. ${fmtKes(opts.amount)} sent to ${normalizeMsisdn(opts.toPhone)} on ${when}.${bal}`;
}
