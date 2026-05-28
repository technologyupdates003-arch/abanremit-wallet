import { invokeFn } from "./invoke-fn";

export const darajaStkPush = async (opts: {
  data: { phone: string; amount: number };
}) => invokeFn<{
  ok: boolean;
  depositId?: string;
  apiRef?: string;
  checkoutRequestId?: string;
  message?: string;
}>("mpesa", { action: "stk_push", ...opts.data });

export const darajaB2CSend = async (opts: {
  data: {
    phone: string;
    amount: number;
    walletId?: string;
    pin: string;
    narration?: string;
    commandID?: "BusinessPayment" | "SalaryPayment" | "PromotionPayment";
  };
}) => invokeFn<{
  ok: boolean;
  withdrawalId: string;
  reference: string;
  conversationId?: string;
  message?: string;
}>("mpesa", { action: "b2c_send", ...opts.data });
