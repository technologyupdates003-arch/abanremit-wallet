import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminListRates, adminSetRate } from "@/lib/admin.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/admin/rates")({ component: RatesPage });
const CCY = ["KES","USD","ABAN","EUR","GBP"] as const;

function RatesPage() {
  const list = useServerFn(adminListRates);
  const setRate = useServerFn(adminSetRate);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["admin","rates"], queryFn: () => list() });
  const [form, setForm] = useState({ from: "USD" as any, to: "KES" as any, rate: "", spread: "0.01" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await setRate({ data: { from: form.from, to: form.to, rate: Number(form.rate), spread: Number(form.spread) } });
      toast.success("Rate updated");
      setForm(f => ({ ...f, rate: "" }));
      qc.invalidateQueries({ queryKey: ["admin","rates"] });
    } catch (e: any) { toast.error(e.message); }
  }
  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold">Exchange Rates</h1>
      <form onSubmit={submit} className="rounded-xl border border-white/10 bg-white/[0.02] p-4 grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
        <Field label="From">
          <select value={form.from} onChange={e => setForm({...form, from: e.target.value as any})} className="h-10 w-full px-2 rounded-lg bg-white/5 border border-white/10">
            {CCY.map(c => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="To">
          <select value={form.to} onChange={e => setForm({...form, to: e.target.value as any})} className="h-10 w-full px-2 rounded-lg bg-white/5 border border-white/10">
            {CCY.map(c => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Rate"><input type="number" step="0.0001" value={form.rate} onChange={e => setForm({...form, rate: e.target.value})} className="h-10 w-full px-3 rounded-lg bg-white/5 border border-white/10 text-white" /></Field>
        <Field label="Spread"><input type="number" step="0.001" value={form.spread} onChange={e => setForm({...form, spread: e.target.value})} className="h-10 w-full px-3 rounded-lg bg-white/5 border border-white/10 text-white" /></Field>
        <button className="h-10 rounded-lg bg-red-500 hover:bg-red-600 text-white font-semibold text-sm">Save</button>
      </form>
      <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-left text-white/40 text-xs uppercase"><tr>
            <th className="p-3">Pair</th><th className="text-right">Rate</th><th className="text-right">Spread</th><th className="text-right">Effective</th><th>Updated</th>
          </tr></thead>
          <tbody>
            {(data ?? []).map((r: any) => (
              <tr key={`${r.from_currency}-${r.to_currency}`} className="border-t border-white/5">
                <td className="p-3 font-mono">{r.from_currency} → {r.to_currency}</td>
                <td className="text-right font-mono">{Number(r.rate).toFixed(4)}</td>
                <td className="text-right font-mono">{Number(r.spread).toFixed(4)}</td>
                <td className="text-right font-mono text-red-400">{(Number(r.rate) * (1 - Number(r.spread))).toFixed(4)}</td>
                <td className="text-white/40 text-xs">{new Date(r.updated_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><div className="text-[11px] uppercase text-white/40 mb-1">{label}</div>{children}</label>;
}
