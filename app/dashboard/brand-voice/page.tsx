"use client";

import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { DashTopbar } from "@/components/DashTopbar";
import { useBrief } from "@/lib/use-brief";
import { Loader2, Check, Sparkles, Save } from "lucide-react";

type Field = { key: string; label: string; placeholder: string; multiline?: boolean };

const FIELDS: Field[] = [
  { key: "tone", label: "Your tone", placeholder: "e.g. Warm, witty, a bit cheeky. Never corporate." },
  { key: "audience", label: "Your audience", placeholder: "e.g. Home bakers in India, 25–40, budget-conscious" },
  { key: "products", label: "Products / services", placeholder: "e.g. Online baking classes (₹499), custom cake orders" },
  { key: "emoji_style", label: "Emoji style", placeholder: "e.g. 1–2 per caption, mostly 🍰✨. Never 😂🔥" },
  { key: "dos", label: "Always do", placeholder: "e.g. End with a question. Mention free shipping over ₹999." },
  { key: "donts", label: "Never do", placeholder: "e.g. Never use 'hustle', never over-promise, no clickbait" },
  { key: "faqs", label: "Common questions & answers", placeholder: "e.g. Do you ship pan-India? Yes. Delivery time? 3–5 days.", multiline: true },
  { key: "sample_caption", label: "A caption you're proud of", placeholder: "Paste one caption that sounds exactly like you.", multiline: true },
];

export default function BrandVoice() {
  const { data } = useBrief();
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [detecting, setDetecting] = useState(false);

  useEffect(() => {
    fetch("/api/brand-voice").then((r) => r.json()).then((d) => {
      setValues(d.voice || {});
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  async function autoFill() {
    setDetecting(true);
    setError("");
    try {
      const res = await fetch("/api/brand-voice?detect=1");
      const d = await res.json();
      if (d.detected && d.voice) {
        setValues(d.voice);
        setSaved(false);
      } else {
        setError("Couldn't auto-detect — make sure Instagram is connected and has posts. You can fill this in manually.");
      }
    } catch {
      setError("Auto-fill failed. Try again or fill in manually.");
    }
    setDetecting(false);
  }

  function set(key: string, val: string) {
    setValues((v) => ({ ...v, [key]: val }));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/brand-voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const d = await res.json();
      if (res.ok) { setSaved(true); }
      else { setError(d.error || "Couldn't save."); }
    } catch {
      setError("Network error. Try again.");
    }
    setSaving(false);
  }

  return (
    <DashboardShell>
      <DashTopbar account={data?.account} pageTitle="Brand Voice" />
      <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="font-display font-semibold text-2xl text-navy">Brand voice</h1>
          <p className="text-navy/50 text-sm mt-1">
            Teach Dawn how you sound once. Every caption, reply, and idea will match your voice.
          </p>
        </div>

        <div className="flex items-start gap-2 bg-amber/5 border border-amber/20 rounded-xl p-4">
          <Sparkles className="w-4 h-4 text-amber-deep shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-navy/70 mb-2">
              The more you fill in, the more &ldquo;you&rdquo; Dawn sounds — or let Dawn draft it by analyzing your Instagram. You can edit anything.
            </p>
            <button
              onClick={autoFill}
              disabled={detecting}
              className="flex items-center gap-2 text-sm font-medium bg-navy text-white px-4 py-2 rounded-lg hover:bg-navy-soft transition-colors disabled:opacity-60"
            >
              {detecting ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing your Instagram…</> : <><Sparkles className="w-4 h-4" /> Auto-fill from my Instagram</>}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-12 flex items-center justify-center text-navy/40"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…</div>
        ) : (
          <div className="space-y-5">
            {FIELDS.map((f) => (
              <div key={f.key}>
                <label className="block text-sm font-semibold text-navy mb-1.5">{f.label}</label>
                {f.multiline ? (
                  <textarea
                    value={values[f.key] || ""}
                    onChange={(e) => set(f.key, e.target.value)}
                    placeholder={f.placeholder}
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl border border-navy/12 text-sm text-navy focus:outline-none focus:border-amber resize-none"
                  />
                ) : (
                  <input
                    value={values[f.key] || ""}
                    onChange={(e) => set(f.key, e.target.value)}
                    placeholder={f.placeholder}
                    className="w-full px-4 py-3 rounded-xl border border-navy/12 text-sm text-navy focus:outline-none focus:border-amber"
                  />
                )}
              </div>
            ))}

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={save}
                disabled={saving}
                className="flex items-center gap-2 bg-navy text-white font-medium px-6 py-3 rounded-xl hover:bg-navy-soft transition-colors disabled:opacity-60"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                {saved ? "Saved" : "Save brand voice"}
              </button>
              {error && <span className="text-red-500 text-sm">{error}</span>}
              {saved && <span className="text-emerald-600 text-sm">Dawn now sounds more like you.</span>}
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
