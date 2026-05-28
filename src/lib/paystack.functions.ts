import { invokeFn } from "./invoke-fn";

export const initializePayment = async (opts: {
  data: {
    amount: number;
    currency: "KES" | "USD" | "EUR" | "GBP";
    email: string;
    saveCard?: boolean;
    walletId?: string;
  };
}) =>
  invokeFn<{
    reference: string;
    publicKey: string;
    amountSubunits: number;
    currency: string;
    email: string;
  }>("paystack", { action: "init", ...opts.data });

export const verifyPayment = async (opts: { data: { reference: string } }) =>
  invokeFn<{
    status: string;
    reference: string;
    amount: number;
    currency: string;
    paidAt: string | null;
    channel: string;
    gatewayResponse: string;
  }>("paystack", { action: "verify", ...opts.data });

export const chargeCard = async (opts: {
  data: {
    reference: string;
    email: string;
    amount: number;
    currency: "KES" | "USD" | "EUR" | "GBP";
    number: string;
    cvv: string;
    expiry_month: string;
    expiry_year: string;
    pin?: string;
    otp?: string;
  };
}) =>
  invokeFn<{
    status: string;
    reference: string;
    displayText?: string;
    message?: string;
  }>("paystack", { action: "charge_card", ...opts.data });

export const chargeSavedCard = async (opts: {
  data: {
    authorizationCode: string;
    amount: number;
    currency: "KES" | "USD" | "EUR" | "GBP";
    email: string;
    walletId?: string;
  };
}) =>
  invokeFn<{ reference: string; status: string; message?: string }>("paystack", {
    action: "charge_saved_card",
    ...opts.data,
  });

export const deleteSavedCard = async (opts: { data: { id: string } }) =>
  invokeFn<{ ok: boolean }>("paystack", { action: "delete_saved_card", ...opts.data });
