import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, Mail, Lock } from "lucide-react";
import { AuthFooter, AuthLink } from "./AuthShell";

export function LoginForm() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Welcome back");
    nav({ to: "/dashboard" });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-3xl font-bold tracking-tight">Welcome back</h2>
        <p className="text-sm text-muted-foreground mt-1.5">Sign in to your AbanRemit Wallet</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Email" icon={Mail}>
          <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@aban.io" autoComplete="email" />
        </Field>

        <Field label="Password" icon={Lock}>
          <div className="relative">
            <Input type={show ? "text" : "password"} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" className="pr-10" />
            <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
            <Checkbox /> Remember me
          </label>
          <AuthLink to="/forgot-password">Forgot password?</AuthLink>
        </div>

        <Button type="submit" disabled={loading} className="w-full h-11 gradient-primary glow-primary text-primary-foreground hover:opacity-95 font-medium">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
        </Button>
      </form>

      <AuthFooter>
        New to AbanRemit? <AuthLink to="/register">Create an account</AuthLink>
      </AuthFooter>
    </div>
  );
}

export function Field({ label, icon: Icon, children }: { label: string; icon?: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        {Icon && <Icon className="h-3 w-3" />} {label}
      </Label>
      {children}
    </div>
  );
}
