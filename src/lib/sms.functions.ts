import { invokeFn } from "./invoke-fn";

export const sendWelcomeSms = async (opts: {
  data: { phone: string; fullName?: string };
}) =>
  invokeFn<{ ok: boolean; error?: string }>("sms", {
    action: "welcome",
    ...opts.data,
  });
