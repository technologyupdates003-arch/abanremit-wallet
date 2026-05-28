import { invokeFn } from "./invoke-fn";

export const lookupWallet = async (opts: { data: { walletNumber: string } }) =>
  invokeFn<
    | { found: false }
    | {
        found: true;
        walletId: string;
        userId: string;
        currency: string;
        fullName: string;
        phone: string | null;
        status: string;
      }
  >("wallet-ops", { action: "lookup", ...opts.data });

export const transferToWallet = async (opts: {
  data: {
    fromWalletId: string;
    toWalletNumber: string;
    amount: number;
    narration?: string;
    pin: string;
    idempotencyKey: string;
  };
}) => invokeFn<{
  transaction_id: string;
  status: string;
  reference: string;
  replay: boolean;
  exchange_rate?: number;
  destination_amount?: number;
  destination_currency?: string;
  source_currency?: string;
}>("wallet-ops", { action: "transfer", ...opts.data });

export const convertCurrency = async (opts: {
  data: {
    fromWalletId: string;
    toWalletId: string;
    amount: number;
    pin: string;
    idempotencyKey: string;
  };
}) => invokeFn<{
  transaction_id: string;
  status: string;
  reference: string;
  rate: number;
  destination_amount: number;
  replay: boolean;
}>("wallet-ops", { action: "convert", ...opts.data });

export const getExchangeRate = async (opts: {
  data: { from: string; to: string };
}) =>
  invokeFn<{ available: false } | { available: true; rate: number }>(
    "wallet-ops",
    { action: "get_rate", ...opts.data },
  );
