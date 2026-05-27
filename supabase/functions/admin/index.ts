// Admin edge function: dashboard, users, wallet ops, KYC, transactions,
// withdrawals, exchange rates, audits, security, webhook replay.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { requireAdmin, AuthCtx } from "../_shared/auth.ts";

function ip(req: Request) { return req.headers.get("x-forwarded-for") ?? null; }
function ua(req: Request) { return req.headers.get("user-agent") ?? null; }

async function route(action: string, body: any, ctx: AuthCtx, req: Request) {
  switch (action) {
    case "get_context": {
      const { data: roles } = await ctx.supabase.from("admin_roles").select("role").eq("user_id", ctx.userId);
      return { userId: ctx.userId, roles: (roles ?? []).map((r: any) => r.role) };
    }
    case "dashboard_stats": {
      const { data, error } = await ctx.supabase.rpc("admin_dashboard_stats");
      if (error) throw new Error(error.message);
      return data;
    }
    case "recent_transactions": {
      const { data, error } = await ctx.supabase.from("transactions")
        .select("id, reference, type, status, amount, source_currency, destination_currency, created_at, user_id")
        .order("created_at", { ascending: false }).limit(20);
      if (error) throw new Error(error.message);
      return data ?? [];
    }
    case "list_users": {
      let q = ctx.supabase.from("profiles").select("id, full_name, username, email, phone, country, kyc_status, kyc_tier, created_at", { count: "exact" });
      if (body.search) {
        const s = `%${body.search}%`;
        q = q.or(`full_name.ilike.${s},email.ilike.${s},username.ilike.${s},phone.ilike.${s}`);
      }
      if (body.kycStatus) q = q.eq("kyc_status", body.kycStatus);
      const limit = body.limit ?? 50, offset = body.offset ?? 0;
      const { data: rows, count, error } = await q.order("created_at", { ascending: false }).range(offset, offset + limit - 1);
      if (error) throw new Error(error.message);
      return { rows: rows ?? [], total: count ?? 0 };
    }
    case "get_user": {
      const [profile, wallets, txs, kyc, pin, audits, banks] = await Promise.all([
        ctx.supabase.from("profiles").select("*").eq("id", body.userId).maybeSingle(),
        ctx.supabase.from("wallets").select("*").eq("user_id", body.userId).order("is_primary", { ascending: false }),
        ctx.supabase.from("transactions").select("id, reference, type, status, amount, source_currency, created_at").eq("user_id", body.userId).order("created_at", { ascending: false }).limit(20),
        ctx.supabase.from("kyc_documents").select("*").eq("user_id", body.userId).order("created_at", { ascending: false }),
        ctx.supabase.from("pin_attempts").select("*").eq("user_id", body.userId).maybeSingle(),
        ctx.supabase.from("admin_audit_logs").select("*").eq("entity_id", body.userId).order("created_at", { ascending: false }).limit(20),
        ctx.supabase.from("linked_banks").select("*").eq("user_id", body.userId),
      ]);
      return { profile: profile.data, wallets: wallets.data ?? [], transactions: txs.data ?? [], kyc: kyc.data ?? [], pinAttempts: pin.data, audits: audits.data ?? [], banks: banks.data ?? [] };
    }
    case "set_wallet_status": {
      const { error } = await ctx.supabase.rpc("admin_set_wallet_status", {
        _wallet_id: body.walletId, _status: body.status, _reason: body.reason, _ip: ip(req), _ua: ua(req),
      });
      if (error) throw new Error(error.message);
      return { ok: true };
    }
    case "adjust_balance": {
      const { data, error } = await ctx.supabase.rpc("tx_admin_adjust", {
        _wallet_id: body.walletId, _amount: body.amount, _direction: body.direction,
        _reason: body.reason, _ip: ip(req), _user_agent: ua(req),
      });
      if (error) throw new Error(error.message);
      return data;
    }
    case "review_kyc": {
      const { data: doc, error: e1 } = await ctx.supabase.from("kyc_documents").select("*").eq("id", body.documentId).maybeSingle();
      if (e1 || !doc) throw new Error("KYC document not found");
      const newStatus = body.action === "approve" ? "approved" : body.action === "reject" ? "rejected" : "pending";
      const { error: e2 } = await ctx.supabase.from("kyc_documents")
        .update({ status: newStatus, rejection_reason: body.reason ?? null }).eq("id", body.documentId);
      if (e2) throw new Error(e2.message);
      if (body.action === "approve") {
        await ctx.supabase.from("profiles").update({ kyc_status: "approved", kyc_tier: body.tier ?? 1 }).eq("id", doc.user_id);
        await ctx.supabase.from("notifications").insert({ user_id: doc.user_id, title: "KYC approved", body: "Your identity verification was approved." });
      } else if (body.action === "reject") {
        await ctx.supabase.from("profiles").update({ kyc_status: "rejected" }).eq("id", doc.user_id);
        await ctx.supabase.from("notifications").insert({ user_id: doc.user_id, title: "KYC rejected",
          body: body.reason ? `Your verification was rejected: ${body.reason}` : "Your verification was rejected." });
      } else {
        await ctx.supabase.from("notifications").insert({ user_id: doc.user_id, title: "KYC resubmission required", body: body.reason ?? "Please resubmit your documents." });
      }
      await ctx.supabase.rpc("admin_log", { _admin: ctx.userId, _action: `kyc_${body.action}`, _entity: "kyc_document", _entity_id: body.documentId, _meta: { reason: body.reason, tier: body.tier }, _ip: ip(req), _ua: ua(req) });
      return { ok: true };
    }
    case "kyc_signed_url": {
      const { data: signed, error } = await ctx.supabase.storage.from("kyc").createSignedUrl(body.path, 300);
      if (error) throw new Error(error.message);
      return { url: signed.signedUrl };
    }
    case "kyc_queue": {
      const { data, error } = await ctx.supabase.from("kyc_documents")
        .select("*").eq("status", "pending").order("created_at", { ascending: true }).limit(50);
      if (error) throw new Error(error.message);
      const rows = data ?? [];
      const userIds = Array.from(new Set(rows.map((r: any) => r.user_id))).filter(Boolean);
      const profilesMap: Record<string, any> = {};
      if (userIds.length) {
        const { data: profs } = await ctx.supabase.from("profiles").select("id, full_name, email, phone").in("id", userIds);
        for (const p of (profs ?? [])) profilesMap[(p as any).id] = p;
      }
      return rows.map((r: any) => ({ ...r, profiles: profilesMap[r.user_id] ?? null }));
    }
    case "list_transactions": {
      let q = ctx.supabase.from("transactions").select("*", { count: "exact" });
      if (body.type) q = q.eq("type", body.type);
      if (body.status) q = q.eq("status", body.status);
      if (body.currency) q = q.eq("source_currency", body.currency);
      if (body.search) q = q.or(`reference.ilike.%${body.search}%,user_id.eq.${body.search}`);
      const limit = body.limit ?? 50, offset = body.offset ?? 0;
      const { data: rows, count, error } = await q.order("created_at", { ascending: false }).range(offset, offset + limit - 1);
      if (error) throw new Error(error.message);
      return { rows: rows ?? [], total: count ?? 0 };
    }
    case "get_transaction": {
      const [tx, ledger, history] = await Promise.all([
        ctx.supabase.from("transactions").select("*").eq("id", body.transactionId).maybeSingle(),
        ctx.supabase.from("wallet_ledger").select("*").eq("transaction_id", body.transactionId).order("created_at"),
        ctx.supabase.from("transaction_status_history").select("*").eq("transaction_id", body.transactionId).order("created_at"),
      ]);
      return { transaction: tx.data, ledger: ledger.data ?? [], history: history.data ?? [] };
    }
    case "list_withdrawals": {
      let q = ctx.supabase.from("withdrawals").select("*, profiles(full_name, email)", { count: "exact" });
      if (body.status) q = q.eq("status", body.status);
      const limit = body.limit ?? 50, offset = body.offset ?? 0;
      const { data: rows, count, error } = await q.order("created_at", { ascending: false }).range(offset, offset + limit - 1);
      if (error) throw new Error(error.message);
      return { rows: rows ?? [], total: count ?? 0 };
    }
    case "reject_withdrawal": {
      const { error } = await ctx.supabase.rpc("reverse_withdrawal", { _withdrawal_id: body.withdrawalId, _reason: body.reason ?? "admin_rejected" });
      if (error) throw new Error(error.message);
      await ctx.supabase.rpc("admin_log", { _admin: ctx.userId, _action: "withdrawal_reject", _entity: "withdrawal", _entity_id: body.withdrawalId, _meta: { reason: body.reason }, _ip: ip(req), _ua: ua(req) });
      return { ok: true };
    }
    case "list_rates": {
      const { data } = await ctx.supabase.from("exchange_rates").select("*").order("from_currency");
      return data ?? [];
    }
    case "set_rate": {
      const { error } = await ctx.supabase.rpc("admin_set_exchange_rate", { _from: body.from, _to: body.to, _rate: body.rate, _spread: body.spread, _ip: ip(req), _ua: ua(req) });
      if (error) throw new Error(error.message);
      return { ok: true };
    }
    case "list_audits": {
      let q = ctx.supabase.from("admin_audit_logs").select("*", { count: "exact" });
      if (body.entity) q = q.eq("entity", body.entity);
      if (body.action) q = q.eq("action", body.action);
      const limit = body.limit ?? 100, offset = body.offset ?? 0;
      const { data: rows, count, error } = await q.order("created_at", { ascending: false }).range(offset, offset + limit - 1);
      if (error) throw new Error(error.message);
      return { rows: rows ?? [], total: count ?? 0 };
    }
    case "security_overview": {
      const [locks, attempts, logs] = await Promise.all([
        ctx.supabase.from("pin_attempts").select("*, profiles(full_name, email)").gt("failed_count", 0).order("last_failed_at", { ascending: false }).limit(50),
        ctx.supabase.from("withdrawal_webhooks").select("*").eq("processed", false).order("created_at", { ascending: false }).limit(20),
        ctx.supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(50),
      ]);
      return { pinAttempts: locks.data ?? [], stuckWebhooks: attempts.data ?? [], recentEvents: logs.data ?? [] };
    }
    case "replay_webhook": {
      const { error } = await ctx.supabase.rpc("admin_replay_paystack_webhook", { _id: body.webhookId });
      if (error) throw new Error(error.message);
      return { ok: true };
    }
    default: throw new Error("unknown action");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const ctx = await requireAdmin(req);
    const body = await req.json();
    const data = await route(body.action, body, ctx, req);
    return jsonResponse(data);
  } catch (e) {
    const msg = (e as Error).message ?? "error";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 400;
    return jsonResponse({ error: msg }, { status });
  }
});
