import { invokeFn } from "./invoke-fn";

const adm = <T = any>(action: string, data: any = {}) =>
  invokeFn<T>("admin", { action, ...data });

// =============== CONTEXT / DASHBOARD ===============
export const getAdminContext = async (_opts?: unknown) =>
  adm<{ userId: string; roles: string[] }>("get_context");

export const adminDashboardStats = async (_opts?: unknown) =>
  adm<any>("dashboard_stats");

export const adminRecentTransactions = async (_opts?: unknown) =>
  adm<any[]>("recent_transactions");

// =============== USERS ===============
export const adminListUsers = async (opts: {
  data: { search?: string; limit?: number; offset?: number; kycStatus?: string };
}) => adm<{ rows: any[]; total: number }>("list_users", opts.data);

export const adminGetUser = async (opts: { data: { userId: string } }) =>
  adm<any>("get_user", opts.data);

// =============== WALLET OPS ===============
export const adminSetWalletStatus = async (opts: {
  data: { walletId: string; status: "active" | "frozen" | "closed"; reason: string };
}) => adm<{ ok: boolean }>("set_wallet_status", opts.data);

export const adminAdjustBalance = async (opts: {
  data: {
    walletId: string;
    amount: number;
    direction: "credit" | "debit";
    reason: string;
  };
}) =>
  adm<{ reference: string; transaction_id: string; balance_after: number }>(
    "adjust_balance",
    opts.data,
  );

// =============== KYC ===============
export const adminReviewKyc = async (opts: {
  data: {
    documentId: string;
    action: "approve" | "reject" | "request_resubmission";
    reason?: string;
    tier?: number;
  };
}) => adm<{ ok: boolean }>("review_kyc", opts.data);

export const adminKycSignedUrl = async (opts: { data: { path: string } }) =>
  adm<{ url: string }>("kyc_signed_url", opts.data);

export const adminKycQueue = async (_opts?: unknown) =>
  adm<any[]>("kyc_queue");

// =============== TRANSACTIONS ===============
export const adminListTransactions = async (opts: {
  data: {
    type?: string;
    status?: string;
    currency?: string;
    search?: string;
    limit?: number;
    offset?: number;
  };
}) => adm<{ rows: any[]; total: number }>("list_transactions", opts.data);

export const adminGetTransaction = async (opts: {
  data: { transactionId: string };
}) => adm<any>("get_transaction", opts.data);

// =============== WITHDRAWALS ===============
export const adminListWithdrawals = async (opts: {
  data: { status?: string; limit?: number; offset?: number };
}) => adm<{ rows: any[]; total: number }>("list_withdrawals", opts.data);

export const adminRejectWithdrawal = async (opts: {
  data: { withdrawalId: string; reason?: string };
}) => adm<{ ok: boolean }>("reject_withdrawal", opts.data);

// =============== RATES ===============
export const adminListRates = async (_opts?: unknown) =>
  adm<any[]>("list_rates");

export const adminSetRate = async (opts: {
  data: {
    from: "KES" | "USD" | "ABAN" | "EUR" | "GBP";
    to: "KES" | "USD" | "ABAN" | "EUR" | "GBP";
    rate: number;
    spread: number;
  };
}) => adm<{ ok: boolean }>("set_rate", opts.data);

// =============== AUDIT / SECURITY ===============
export const adminListAudits = async (opts: {
  data: { entity?: string; action?: string; limit?: number; offset?: number };
}) => adm<{ rows: any[]; total: number }>("list_audits", opts.data);

export const adminSecurityOverview = async (_opts?: unknown) =>
  adm<{ pinAttempts: any[]; stuckWebhooks: any[]; recentEvents: any[] }>(
    "security_overview",
  );

export const adminReplayWebhook = async (opts: { data: { webhookId: string } }) =>
  adm<{ ok: boolean }>("replay_webhook", opts.data);
