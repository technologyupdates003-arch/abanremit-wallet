import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/integrations/supabase/admin-middleware";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";

function ip() { try { return getRequestIP({ xForwardedFor: true }) ?? null; } catch { return null; } }
function ua() { try { return getRequestHeader("user-agent") ?? null; } catch { return null; } }

// =============== ADMIN CONTEXT ===============
export const getAdminContext = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async ({ context }) => {
    const { data: roles } = await context.supabase
      .from("admin_roles" as never)
      .select("role")
      .eq("user_id", context.userId);
    return {
      userId: context.userId,
      roles: ((roles as unknown as Array<{ role: string }> | null) ?? []).map(r => r.role),
    };
  });

// =============== DASHBOARD ===============
export const adminDashboardStats = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("admin_dashboard_stats" as never);
    if (error) throw new Error(error.message);
    return data as any;
  });

export const adminRecentTransactions = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("transactions" as never)
      .select("id, reference, type, status, amount, source_currency, destination_currency, created_at, user_id")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return data as unknown as any[];
  });

// =============== USERS ===============
const ListUsersInput = z.object({
  search: z.string().max(100).optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
  kycStatus: z.string().optional(),
});
export const adminListUsers = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: z.input<typeof ListUsersInput>) => ListUsersInput.parse(d))
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("profiles").select("id, full_name, username, email, phone, country, kyc_status, kyc_tier, created_at", { count: "exact" });
    if (data.search) {
      const s = `%${data.search}%`;
      q = q.or(`full_name.ilike.${s},email.ilike.${s},username.ilike.${s},phone.ilike.${s}`);
    }
    if (data.kycStatus) q = q.eq("kyc_status", data.kycStatus as never);
    const { data: rows, count, error } = await q.order("created_at", { ascending: false }).range(data.offset, data.offset + data.limit - 1);
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as unknown as any[], total: count ?? 0 };
  });

const GetUserInput = z.object({ userId: z.string().uuid() });
export const adminGetUser = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: z.input<typeof GetUserInput>) => GetUserInput.parse(d))
  .handler(async ({ data, context }) => {
    const [profile, wallets, txs, kyc, pin, audits, banks] = await Promise.all([
      context.supabase.from("profiles").select("*").eq("id", data.userId).maybeSingle(),
      context.supabase.from("wallets").select("*").eq("user_id", data.userId).order("is_primary", { ascending: false }),
      context.supabase.from("transactions" as never).select("id, reference, type, status, amount, source_currency, created_at").eq("user_id", data.userId).order("created_at", { ascending: false }).limit(20),
      context.supabase.from("kyc_documents").select("*").eq("user_id", data.userId).order("created_at", { ascending: false }),
      context.supabase.from("pin_attempts" as never).select("*").eq("user_id", data.userId).maybeSingle(),
      context.supabase.from("admin_audit_logs" as never).select("*").eq("entity_id", data.userId).order("created_at", { ascending: false }).limit(20),
      context.supabase.from("linked_banks").select("*").eq("user_id", data.userId),
    ]);
    return {
      profile: profile.data,
      wallets: wallets.data ?? [],
      transactions: txs.data ?? [],
      kyc: kyc.data ?? [],
      pinAttempts: pin.data,
      audits: audits.data ?? [],
      banks: banks.data ?? [],
    };
  });

// =============== WALLET OPS ===============
const WalletStatusInput = z.object({
  walletId: z.string().uuid(),
  status: z.enum(["active", "frozen", "closed"]),
  reason: z.string().min(5).max(500),
});
export const adminSetWalletStatus = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: z.input<typeof WalletStatusInput>) => WalletStatusInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("admin_set_wallet_status" as never, {
      _wallet_id: data.walletId, _status: data.status, _reason: data.reason, _ip: ip(), _ua: ua(),
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const AdjustInput = z.object({
  walletId: z.string().uuid(),
  amount: z.number().positive().max(10_000_000),
  direction: z.enum(["credit", "debit"]),
  reason: z.string().min(5).max(500),
});
export const adminAdjustBalance = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: z.input<typeof AdjustInput>) => AdjustInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("tx_admin_adjust" as never, {
      _wallet_id: data.walletId, _amount: data.amount, _direction: data.direction,
      _reason: data.reason, _ip: ip(), _user_agent: ua(),
    } as never);
    if (error) throw new Error(error.message);
    return res as { reference: string; transaction_id: string; balance_after: number };
  });

// =============== KYC ===============
const KycActionInput = z.object({
  documentId: z.string().uuid(),
  action: z.enum(["approve", "reject", "request_resubmission"]),
  reason: z.string().max(500).optional(),
  tier: z.number().int().min(0).max(3).optional(),
});
export const adminReviewKyc = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: z.input<typeof KycActionInput>) => KycActionInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: doc, error: e1 } = await context.supabase
      .from("kyc_documents").select("*").eq("id", data.documentId).maybeSingle();
    if (e1 || !doc) throw new Error("KYC document not found");
    const newStatus = data.action === "approve" ? "approved" : data.action === "reject" ? "rejected" : "pending";
    const { error: e2 } = await context.supabase
      .from("kyc_documents")
      .update({ status: newStatus as never, rejection_reason: data.reason ?? null })
      .eq("id", data.documentId);
    if (e2) throw new Error(e2.message);
    if (data.action === "approve") {
      await context.supabase.from("profiles")
        .update({ kyc_status: "approved" as never, kyc_tier: data.tier ?? 1 })
        .eq("id", doc.user_id);
      await context.supabase.from("notifications").insert({
        user_id: doc.user_id, title: "KYC approved", body: "Your identity verification was approved.",
      });
    } else if (data.action === "reject") {
      await context.supabase.from("profiles").update({ kyc_status: "rejected" as never }).eq("id", doc.user_id);
      await context.supabase.from("notifications").insert({
        user_id: doc.user_id, title: "KYC rejected",
        body: data.reason ? `Your verification was rejected: ${data.reason}` : "Your verification was rejected.",
      });
    } else {
      await context.supabase.from("notifications").insert({
        user_id: doc.user_id, title: "KYC resubmission required",
        body: data.reason ?? "Please resubmit your documents.",
      });
    }
    await context.supabase.rpc("admin_log" as never, {
      _admin: context.userId, _action: `kyc_${data.action}`, _entity: "kyc_document",
      _entity_id: data.documentId, _meta: { reason: data.reason, tier: data.tier } as never,
      _ip: ip(), _ua: ua(),
    } as never);
    return { ok: true };
  });

const KycSignedUrlInput = z.object({ path: z.string() });
export const adminKycSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: z.input<typeof KycSignedUrlInput>) => KycSignedUrlInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: signed, error } = await context.supabase.storage.from("kyc").createSignedUrl(data.path, 300);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });

export const adminKycQueue = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("kyc_documents")
      .select("*")
      .eq("status", "pending" as never)
      .order("created_at", { ascending: true })
      .limit(50);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as any[];
    const userIds = Array.from(new Set(rows.map(r => r.user_id))).filter(Boolean);
    let profilesMap: Record<string, any> = {};
    if (userIds.length) {
      const { data: profs } = await context.supabase
        .from("profiles")
        .select("id, full_name, email, phone")
        .in("id", userIds);
      for (const p of (profs ?? []) as any[]) profilesMap[p.id] = p;
    }
    return rows.map(r => ({ ...r, profiles: profilesMap[r.user_id] ?? null }));
  });

// =============== TRANSACTIONS ===============
const TxFilterInput = z.object({
  type: z.string().optional(),
  status: z.string().optional(),
  currency: z.string().optional(),
  search: z.string().max(100).optional(),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
});
export const adminListTransactions = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: z.input<typeof TxFilterInput>) => TxFilterInput.parse(d))
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("transactions" as never).select("*", { count: "exact" });
    if (data.type) q = q.eq("type", data.type as never);
    if (data.status) q = q.eq("status", data.status as never);
    if (data.currency) q = q.eq("source_currency", data.currency as never);
    if (data.search) q = q.or(`reference.ilike.%${data.search}%,user_id.eq.${data.search}`);
    const { data: rows, count, error } = await q.order("created_at", { ascending: false }).range(data.offset, data.offset + data.limit - 1);
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as unknown as any[], total: count ?? 0 };
  });

const TxDetailInput = z.object({ transactionId: z.string().uuid() });
export const adminGetTransaction = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: z.input<typeof TxDetailInput>) => TxDetailInput.parse(d))
  .handler(async ({ data, context }) => {
    const [tx, ledger, history] = await Promise.all([
      context.supabase.from("transactions" as never).select("*").eq("id", data.transactionId).maybeSingle(),
      context.supabase.from("wallet_ledger").select("*").eq("transaction_id", data.transactionId).order("created_at"),
      context.supabase.from("transaction_status_history" as never).select("*").eq("transaction_id", data.transactionId).order("created_at"),
    ]);
    return { transaction: tx.data, ledger: ledger.data ?? [], history: history.data ?? [] };
  });

// =============== WITHDRAWALS ===============
export const adminListWithdrawals = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: { status?: string; limit?: number; offset?: number }) =>
    z.object({ status: z.string().optional(), limit: z.number().default(50), offset: z.number().default(0) }).parse(d))
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("withdrawals").select("*, profiles(full_name, email)", { count: "exact" });
    if (data.status) q = q.eq("status", data.status as never);
    const { data: rows, count, error } = await q.order("created_at", { ascending: false }).range(data.offset, data.offset + data.limit - 1);
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as unknown as any[], total: count ?? 0 };
  });

const WdActionInput = z.object({
  withdrawalId: z.string().uuid(),
  reason: z.string().max(500).optional(),
});
export const adminRejectWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: z.input<typeof WdActionInput>) => WdActionInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("reverse_withdrawal" as never, {
      _withdrawal_id: data.withdrawalId, _reason: data.reason ?? "admin_rejected",
    } as never);
    if (error) throw new Error(error.message);
    await context.supabase.rpc("admin_log" as never, {
      _admin: context.userId, _action: "withdrawal_reject", _entity: "withdrawal",
      _entity_id: data.withdrawalId, _meta: { reason: data.reason } as never, _ip: ip(), _ua: ua(),
    } as never);
    return { ok: true };
  });

// =============== EXCHANGE RATES ===============
export const adminListRates = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("exchange_rates").select("*").order("from_currency");
    return (data ?? []) as unknown as any[];
  });

const RateInput = z.object({
  from: z.enum(["KES", "USD", "ABAN", "EUR", "GBP"]),
  to: z.enum(["KES", "USD", "ABAN", "EUR", "GBP"]),
  rate: z.number().positive(),
  spread: z.number().min(0).max(0.5),
});
export const adminSetRate = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: z.input<typeof RateInput>) => RateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("admin_set_exchange_rate" as never, {
      _from: data.from, _to: data.to, _rate: data.rate, _spread: data.spread, _ip: ip(), _ua: ua(),
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// =============== AUDIT LOGS ===============
export const adminListAudits = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: { entity?: string; action?: string; limit?: number; offset?: number }) =>
    z.object({ entity: z.string().optional(), action: z.string().optional(),
               limit: z.number().default(100), offset: z.number().default(0) }).parse(d))
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("admin_audit_logs" as never).select("*", { count: "exact" });
    if (data.entity) q = q.eq("entity", data.entity as never);
    if (data.action) q = q.eq("action", data.action as never);
    const { data: rows, count, error } = await q.order("created_at", { ascending: false }).range(data.offset, data.offset + data.limit - 1);
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as unknown as any[], total: count ?? 0 };
  });

// =============== SECURITY ===============
export const adminSecurityOverview = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async ({ context }) => {
    const [locks, attempts, logs] = await Promise.all([
      context.supabase.from("pin_attempts" as never).select("*, profiles(full_name, email)").gt("failed_count", 0).order("last_failed_at", { ascending: false }).limit(50),
      context.supabase.from("withdrawal_webhooks" as never).select("*").eq("processed", false).order("created_at", { ascending: false }).limit(20),
      context.supabase.from("audit_logs" as never).select("*").order("created_at", { ascending: false }).limit(50),
    ]);
    return {
      pinAttempts: (locks.data ?? []) as unknown as any[],
      stuckWebhooks: (attempts.data ?? []) as unknown as any[],
      recentEvents: (logs.data ?? []) as unknown as any[],
    };
  });

const ReplayInput = z.object({ webhookId: z.string().uuid() });
export const adminReplayWebhook = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: z.input<typeof ReplayInput>) => ReplayInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("admin_replay_paystack_webhook" as never, { _id: data.webhookId } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
