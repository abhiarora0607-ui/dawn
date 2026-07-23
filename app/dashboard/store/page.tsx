"use client";

import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { DashTopbar } from "@/components/DashTopbar";
import { useBrief } from "@/lib/use-brief";
import { Loader2, Check, Save, ShoppingBag, TrendingUp } from "lucide-react";

const FIELDS = [
  { key: "store_url", label: "Store URL", placeholder: "https://yourbrand.com", multiline: false },
  { key: "products", label: "Products & price points", placeholder: "e.g. Cold-pressed juices ₹250, sampler pack ₹499, subscription ₹1,200/mo. Hero product: the green detox.", multiline: true },
  { key: "promos", label: "Current promos & launches", placeholder: "e.g. Launching a winter range Aug 15. Free shipping over ₹999 this month.", multiline: true },
  { key: "goals", label: "Business goals", placeholder: "e.g. Grow DTC sales 30% this quarter, push subscriptions, clear summer stock.", multiline: true },
  { key: "avg_order_value", label: "Average order value", placeholder: "e.g. ₹650", multiline: false },
  { key: "winning_hooks", label: "Hooks/angles that have converted before", placeholder: "e.g. 'POV: your skin after 7 days', behind-the-scenes of sourcing, customer transformations.", multiline: true },
];

export default function Store() {
  const { data } = useBrief();
  const [values, setValues] = useState<Record<string, string>>({});
  const [loadErr, setLoadErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/store").then((r) => r.json()).then((d) => { setValues(d.store || {}); setLoading(false); }).catch(() => { setLoadErr("Couldn't load this page — check your connection."); setLoading(false); });
  }, []);

  function set(k: string, v: string) { setValues((p) => ({ ...p, [k]: v })); setSaved(false); }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/store", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      if (res.ok) setSaved(true);
    } catch {}
    setSaving(false);
  }

  return (
    <DashboardShell>
      <DashTopbar account={data?.account} pageTitle="Store" />
      <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
        {loadErr && <p className="t-small text-red-600 bg-red-50 rounded-xl px-3 py-2 mb-3">{loadErr} <button onClick={() => location.reload()} className="underline font-medium">Try again</button></p>}
        <div>
          <h1 className="font-display font-semibold text-2xl text-navy">Your store</h1>
          <p className="text-muted text-sm mt-1">Tell Dawn what you sell. Every briefing and idea becomes tied to moving your revenue.</p>
        </div>

        <div className="flex items-start gap-2 bg-navy rounded-xl p-4 text-white">
          <TrendingUp className="w-4 h-4 text-amber shrink-0 mt-0.5" />
          <p className="text-sm text-white/80">
            This is what turns Dawn from a content tool into a revenue tool. With your products and goals, briefings stop saying &ldquo;post more&rdquo; and start saying &ldquo;post your hero product Tuesday with a link sticker — here&apos;s why.&rdquo;
          </p>
        </div>

        {loading ? (
          <div className="p-12 flex items-center justify-center text-muted"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…</div>
        ) : (
          <div className="space-y-5">
            {FIELDS.map((f) => (
              <div key={f.key}>
                <label className="block text-sm font-semibold text-navy mb-1.5">{f.label}</label>
                {f.multiline ? (
                  <textarea value={values[f.key] || ""} onChange={(e) => set(f.key, e.target.value)} placeholder={f.placeholder} rows={3}
                    className="w-full px-4 py-3 rounded-xl border border-navy-line text-sm text-navy focus:outline-none focus:border-amber resize-none" />
                ) : (
                  <input value={values[f.key] || ""} onChange={(e) => set(f.key, e.target.value)} placeholder={f.placeholder}
                    className="w-full px-4 py-3 rounded-xl border border-navy-line text-sm text-navy focus:outline-none focus:border-amber" />
                )}
              </div>
            ))}
            <div className="flex items-center gap-3">
              <button onClick={save} disabled={saving} className="flex items-center gap-2 bg-navy text-white font-medium px-6 py-3 rounded-xl hover:bg-navy-soft transition-colors disabled:opacity-60">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                {saved ? "Saved" : "Save store profile"}
              </button>
              {saved && <span className="text-emerald-600 text-sm">Your briefings are now revenue-aware.</span>}
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
