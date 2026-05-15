import { GlassCard, PageHeader } from "./shared";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export function ProfilePage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => (await supabase.from("profiles").select("*").eq("id", user!.id).single()).data,
    enabled: !!user,
  });
  const [form, setForm] = useState({ full_name: "", phone: "", country: "", city: "", address: "", occupation: "" });
  useEffect(() => {
    if (profile) setForm({
      full_name: profile.full_name ?? "", phone: profile.phone ?? "", country: profile.country ?? "",
      city: profile.city ?? "", address: profile.address ?? "", occupation: profile.occupation ?? "",
    });
  }, [profile]);

  async function save() {
    const { error } = await supabase.from("profiles").update(form).eq("id", user!.id);
    if (error) return toast.error(error.message);
    toast.success("Profile updated");
    qc.invalidateQueries({ queryKey: ["profile"] });
  }

  const initial = form.full_name?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? "A";

  return (
    <div className="space-y-6">
      <PageHeader title="Profile" subtitle="Your AbanRemit identity." />
      <div className="grid lg:grid-cols-[280px_1fr] gap-4">
        <GlassCard className="text-center">
          <div className="mx-auto h-24 w-24 rounded-3xl gradient-primary glow-primary flex items-center justify-center font-display text-3xl font-bold text-primary-foreground">{initial}</div>
          <div className="mt-4 font-display text-lg font-semibold">{form.full_name || "Your name"}</div>
          <div className="text-sm text-muted-foreground">{user?.email}</div>
          <div className="mt-3 text-[11px] uppercase tracking-wider text-primary">@{profile?.username}</div>
        </GlassCard>
        <GlassCard>
          <div className="font-display text-lg font-semibold mb-4">Personal details</div>
          <div className="grid sm:grid-cols-2 gap-3">
            {(["full_name","phone","country","city","address","occupation"] as const).map((k) => (
              <div key={k} className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground capitalize">{k.replace("_", " ")}</Label>
                <Input value={(form as Record<string,string>)[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} />
              </div>
            ))}
          </div>
          <Button onClick={save} className="mt-5 gradient-primary glow-primary text-primary-foreground h-11 px-6">Save changes</Button>
        </GlassCard>
      </div>
    </div>
  );
}
