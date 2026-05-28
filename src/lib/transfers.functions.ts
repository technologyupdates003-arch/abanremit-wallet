import { invokeFn } from "./invoke-fn";

// ============== PIN ==============
export const setTransactionPin = async (opts: { data: { pin: string } }) =>
  invokeFn<{ ok: boolean }>("wallet-ops", { action: "set_pin", ...opts.data });

export const hasTransactionPin = async (_opts?: unknown) =>
  invokeFn<{ hasPin: boolean }>("wallet-ops", { action: "has_pin" });

// ============== BANKS ==============
export const listBanks = async (opts: {
  data: { currency: "NGN" | "GHS" | "ZAR" | "KES" | "USD" };
}) =>
  invokeFn<Array<{ name: string; code: string; currency: string; type: string }>>(
    "paystack",
    { action: "list_banks", ...opts.data },
  );

export const resolveAccount = async (opts: {
  data: { accountNumber: string; bankCode: string };
}) =>
  invokeFn<{ accountNumber: string; accountName: string }>("paystack", {
    action: "resolve_account",
    ...opts.data,
  });

export const addLinkedBank = async (opts: {
  data: {
    bankCode: string;
    bankName: string;
    accountNumber: string;
    currency: "KES" | "USD" | "EUR" | "GBP";
    setDefault?: boolean;
  };
}) => invokeFn<any>("paystack", { action: "add_bank", ...opts.data });

export const setDefaultBank = async (opts: { data: { id: string } }) =>
  invokeFn<{ ok: boolean }>("paystack", { action: "set_default_bank", ...opts.data });

export const deleteLinkedBank = async (opts: { data: { id: string } }) =>
  invokeFn<{ ok: boolean }>("paystack", { action: "delete_bank", ...opts.data });

// ============== WITHDRAWAL ==============
export const initiateWithdrawal = async (opts: {
  data: {
    walletId: string;
    bankId: string;
    amount: number;
    pin: string;
    narration?: string;
    idempotencyKey: string;
  };
}) =>
  invokeFn<{ withdrawalId: string; status: string; reference: string }>(
    "paystack",
    { action: "initiate_withdrawal", ...opts.data },
  );
