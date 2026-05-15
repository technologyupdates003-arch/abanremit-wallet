import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, Mail } from "lucide-react";
import { AuthFooter, AuthLink } from "./AuthShell";
import { Field } from "./LoginForm";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setSent(true);
    toast.success("Reset link sent");
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-3xl font-bold tracking-tight">Reset password</h2>
        <p className="text-sm text-muted-foreground mt-1.5">We'll email you a secure reset link</p>
      </div>
      {sent ? (
        <div className="glass-card rounded-2xl p-5 text-sm">
          Check your inbox at <span className="text-foreground font-medium">{email}</span> for the reset link.
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Email" icon={Mail}>
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@aban.io" />
          </Field>
          <Button type="submit" disabled={loading} className="w-full h-11 gradient-primary glow-primary text-primary-foreground font-medium">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send reset link"}
          </Button>
        </form>
      )}
      <AuthFooter>
        Back to <AuthLink to="/">sign in</AuthLink>
      </AuthFooter>
    </div>
  );
}
