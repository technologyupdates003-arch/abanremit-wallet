import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, Lock } from "lucide-react";
import { Field } from "./LoginForm";

export function ResetPasswordForm() {
  const nav = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return toast.error("Password must be at least 8 characters");
    if (password !== confirm) return toast.error("Passwords don't match");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Password updated");
    nav({ to: "/dashboard" });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-3xl font-bold tracking-tight">New password</h2>
        <p className="text-sm text-muted-foreground mt-1.5">Set a strong new password</p>
      </div>
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="New password" icon={Lock}>
          <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </Field>
        <Field label="Confirm" icon={Lock}>
          <Input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••" />
        </Field>
        <Button type="submit" disabled={loading} className="w-full h-11 gradient-primary glow-primary text-primary-foreground font-medium">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update password"}
        </Button>
      </form>
    </div>
  );
}
