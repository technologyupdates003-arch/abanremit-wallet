import { GlassCard, PageHeader } from "./shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Lock, Bell, Smartphone, Trash2, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useAuth } from "@/lib/auth-context";

export function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" subtitle="Security, notifications, and preferences." />

      <div className="grid lg:grid-cols-2 gap-4">
        <ChangePassword />
        <TransactionPin />
        <Toggles />
        <DangerZone />
      </div>
    </div>
  );
}

function Section({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <GlassCard>
      <div className="flex items-center gap-3 mb-4">
        <div className="h-10 w-10 rounded-xl bg-surface-2 flex items-center justify-center"><Icon className="h-5 w-5 text-primary" /></div>
        <div className="font-display text-lg font-semibold">{title}</div>
      </div>
      {children}
    </GlassCard>
  );
}

function ChangePassword() {
  const [pw, setPw] = useState("");
  async function update() {
    if (pw.length < 8) return toast.error("Min 8 characters");
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) return toast.error(error.message);
    toast.success("Password updated"); setPw("");
  }
  return (
    <Section icon={Lock} title="Password">
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">New password</Label>
          <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </div>
        <Button onClick={update} className="gradient-primary text-primary-foreground">Update password</Button>
      </div>
    </Section>
  );
}

function TransactionPin() {
  const { user } = useAuth();
  const [pin, setPin] = useState("");
  async function save() {
    if (pin.length !== 4) return toast.error("Enter a 4-digit PIN");
    // Hash client-side preview; production should hash server-side
    const enc = new TextEncoder().encode(pin + user!.id);
    const buf = await crypto.subtle.digest("SHA-256", enc);
    const hash = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
    const { error } = await supabase.from("profiles").update({ transaction_pin_hash: hash }).eq("id", user!.id);
    if (error) return toast.error(error.message);
    toast.success("Transaction PIN set"); setPin("");
  }
  return (
    <Section icon={Smartphone} title="Transaction PIN">
      <div className="space-y-3">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">4-digit PIN</Label>
        <InputOTP maxLength={4} value={pin} onChange={setPin}>
          <InputOTPGroup>{[0,1,2,3].map((i) => <InputOTPSlot key={i} index={i} className="bg-surface-2 border-border h-12 w-12" />)}</InputOTPGroup>
        </InputOTP>
        <Button onClick={save} className="gradient-primary text-primary-foreground">Save PIN</Button>
      </div>
    </Section>
  );
}

function Toggles() {
  return (
    <Section icon={Bell} title="Preferences">
      <div className="space-y-4">
        {[
          ["Two-factor authentication", "Require a code on every sign-in"],
          ["Push notifications", "Transactions, security alerts"],
          ["Email alerts", "Receipts and statements"],
          ["Login alerts", "New device notifications"],
        ].map(([t, s]) => (
          <div key={t} className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">{t}</div>
              <div className="text-xs text-muted-foreground">{s}</div>
            </div>
            <Switch />
          </div>
        ))}
      </div>
    </Section>
  );
}

function DangerZone() {
  return (
    <Section icon={ShieldAlert} title="Danger zone">
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Permanently delete your account and all associated wallets.</p>
        <Button variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10">
          <Trash2 className="h-4 w-4 mr-2" /> Delete account
        </Button>
      </div>
    </Section>
  );
}
