import { GlassCard, PageHeader } from "./shared";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ShieldCheck, Upload, CheckCircle2, Clock, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const DOC_TYPES = [
  { id: "national_id", label: "National ID" },
  { id: "passport", label: "Passport" },
  { id: "drivers_license", label: "Driver's License" },
] as const;

export function KycPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [docType, setDocType] = useState<typeof DOC_TYPES[number]["id"]>("national_id");
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => (await supabase.from("profiles").select("*").eq("id", user!.id).single()).data,
    enabled: !!user,
  });
  const { data: docs = [] } = useQuery({
    queryKey: ["kyc-docs", user?.id],
    queryFn: async () => (await supabase.from("kyc_documents").select("*").order("created_at", { ascending: false })).data ?? [],
    enabled: !!user,
  });

  async function submit() {
    if (!user || !front) return toast.error("Front document is required");
    setBusy(true);
    try {
      const upload = async (f: File, side: string) => {
        const path = `${user.id}/${docType}-${side}-${Date.now()}-${f.name}`;
        const { error } = await supabase.storage.from("kyc").upload(path, f, { upsert: false });
        if (error) throw error;
        return path;
      };
      const front_path = await upload(front, "front");
      const back_path = back ? await upload(back, "back") : null;
      const { error } = await supabase.from("kyc_documents").insert({
        user_id: user.id, doc_type: docType, front_path, back_path, status: "pending",
      });
      if (error) throw error;
      await supabase.from("profiles").update({ kyc_status: "pending" }).eq("id", user.id);
      toast.success("KYC submitted — review takes up to 24 hours");
      setFront(null); setBack(null);
      qc.invalidateQueries();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally { setBusy(false); }
  }

  const status = profile?.kyc_status ?? "not_submitted";
  const StatusBadge = () => {
    const map = {
      not_submitted: { icon: ShieldCheck, label: "Not submitted", cls: "bg-muted text-muted-foreground" },
      pending: { icon: Clock, label: "Under review", cls: "bg-warning/15 text-warning" },
      approved: { icon: CheckCircle2, label: "Approved", cls: "bg-success/15 text-success" },
      rejected: { icon: XCircle, label: "Rejected", cls: "bg-destructive/15 text-destructive" },
    } as const;
    const s = map[status];
    return <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs ${s.cls}`}><s.icon className="h-3.5 w-3.5" />{s.label}</span>;
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Identity verification" subtitle="Unlock higher limits and full features." action={<StatusBadge />} />

      <div className="grid lg:grid-cols-[1fr_1fr] gap-4">
        <GlassCard>
          <div className="font-display text-lg font-semibold mb-4">Submit document</div>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Document type</Label>
              <select value={docType} onChange={(e) => setDocType(e.target.value as typeof docType)} className="flex h-10 w-full rounded-md border border-input bg-input/50 px-3 text-sm">
                {DOC_TYPES.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
              </select>
            </div>
            <FileDrop label="Front" file={front} onChange={setFront} />
            {docType !== "passport" && <FileDrop label="Back" file={back} onChange={setBack} />}
            <Button onClick={submit} disabled={busy || !front} className="w-full h-11 gradient-primary glow-primary text-primary-foreground">
              {busy ? "Uploading…" : "Submit for review"}
            </Button>
          </div>
        </GlassCard>

        <GlassCard>
          <div className="font-display text-lg font-semibold mb-4">Submission history</div>
          {docs.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">No submissions yet.</div>
          ) : (
            <div className="space-y-2">
              {docs.map((d) => (
                <div key={d.id} className="flex items-center justify-between p-3 rounded-xl bg-surface-2/60">
                  <div>
                    <div className="text-sm capitalize font-medium">{d.doc_type.replace("_", " ")}</div>
                    <div className="text-[11px] text-muted-foreground">{new Date(d.created_at).toLocaleString()}</div>
                  </div>
                  <span className={`px-2 py-1 rounded-md text-xs ${d.status === "approved" ? "bg-success/15 text-success" : d.status === "rejected" ? "bg-destructive/15 text-destructive" : "bg-warning/15 text-warning"}`}>{d.status}</span>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  );
}

function FileDrop({ label, file, onChange }: { label: string; file: File | null; onChange: (f: File | null) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      <label className="flex items-center gap-3 p-3 rounded-xl bg-surface-2/60 border border-dashed border-border hover:border-primary/40 cursor-pointer transition-colors">
        <div className="h-10 w-10 rounded-lg bg-surface-3 flex items-center justify-center"><Upload className="h-4 w-4 text-primary" /></div>
        <div className="flex-1 text-sm">
          {file ? <span className="font-medium">{file.name}</span> : <span className="text-muted-foreground">Click to upload (JPG, PNG, PDF)</span>}
        </div>
        <Input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => onChange(e.target.files?.[0] ?? null)} />
      </label>
    </div>
  );
}
