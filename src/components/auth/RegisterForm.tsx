import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, User, Mail, Phone, Globe2, Lock } from "lucide-react";
import { AuthFooter, AuthLink } from "./AuthShell";
import { Field } from "./LoginForm";
import { sendWelcomeSms } from "@/lib/sms.functions";
import { useServerFn } from "@tanstack/react-start";

const COUNTRIES = ["Kenya", "Uganda", "Tanzania", "Nigeria", "Ghana", "South Africa", "United Kingdom", "United States", "United Arab Emirates", "Other"];

const schema = z.object({
  full_name: z.string().min(2).max(80),
  username: z.string().min(3).max(24).regex(/^[a-zA-Z0-9_]+$/, "Letters, numbers, underscore"),
  email: z.string().email(),
  phone: z.string().min(7).max(20),
  country: z.string().min(2),
  password: z.string().min(8, "Min 8 characters"),
  confirm: z.string(),
}).refine((d) => d.password === d.confirm, { path: ["confirm"], message: "Passwords don't match" });

export function RegisterForm() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    full_name: "", username: "", email: "", phone: "", country: "Kenya", password: "", confirm: "",
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setLoading(true);
    const redirectTo = `${window.location.origin}/dashboard`;
    const { error } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
      options: {
        emailRedirectTo: redirectTo,
        data: {
          full_name: form.full_name.trim(),
          username: form.username.trim().toLowerCase(),
          phone: form.phone.trim(),
          country: form.country,
        },
      },
    });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Check your email to verify your account");
    nav({ to: "/" });
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-3xl font-bold tracking-tight">Create your wallet</h2>
        <p className="text-sm text-muted-foreground mt-1.5">Join the future of borderless finance</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-3.5">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Full name" icon={User}><Input required value={form.full_name} onChange={set("full_name")} placeholder="Jane Aban" /></Field>
          <Field label="Username" icon={User}><Input required value={form.username} onChange={set("username")} placeholder="janeaban" /></Field>
        </div>
        <Field label="Email" icon={Mail}><Input type="email" required value={form.email} onChange={set("email")} placeholder="you@aban.io" /></Field>
        <div className="grid grid-cols-[1fr_1.1fr] gap-3">
          <Field label="Country" icon={Globe2}>
            <select value={form.country} onChange={set("country")} className="flex h-10 w-full rounded-md border border-input bg-input/50 px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
              {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Phone" icon={Phone}><Input required value={form.phone} onChange={set("phone")} placeholder="+254 700 000 000" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Password" icon={Lock}><Input type="password" required value={form.password} onChange={set("password")} placeholder="••••••••" /></Field>
          <Field label="Confirm" icon={Lock}><Input type="password" required value={form.confirm} onChange={set("confirm")} placeholder="••••••••" /></Field>
        </div>

        <Button type="submit" disabled={loading} className="w-full h-11 gradient-primary glow-primary text-primary-foreground font-medium mt-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create account"}
        </Button>
      </form>

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        By creating an account you agree to AbanRemit's Terms and Privacy Policy. We'll send a verification email before you can transact.
      </p>

      <AuthFooter>
        Already have an account? <AuthLink to="/">Sign in</AuthLink>
      </AuthFooter>
    </div>
  );
}
