import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendSms, welcomeMsg } from "./talksasa.server";

const WelcomeInput = z.object({
  phone: z.string().min(7).max(20),
  fullName: z.string().max(80).optional(),
});

export const sendWelcomeSms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof WelcomeInput>) => WelcomeInput.parse(d))
  .handler(async ({ data }) => {
    const res = await sendSms(data.phone, welcomeMsg(data.fullName));
    return res;
  });
