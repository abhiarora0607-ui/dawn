"use client";

import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { DashTopbar } from "@/components/DashTopbar";
import { useBrief } from "@/lib/use-brief";
import { ToastProvider, useToast, ConfirmDialog } from "@/components/Toast";
import { invalidateSettingsCache } from "@/lib/use-settings";
import { Loader2, Save, Upload, Database, Trash2, Download, Building2, Copy, Check } from "lucide-react";

const CURRENCIES = ["₹", "$", "€", "£", "₨", "R$", "A$"];

function SettingsInner() {
  const { data } = useBrief();
  const { toast } = useToast();
  const [s, setS] = useState<any>({ currency: "₹", stage_names: ["New Lead", "Contacted", "Negotiating", "Customer (Won)", "Lost"] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then((d) => {
      setS({ currency: "₹", stage_names: ["New Lead", "Contacted", "Negotiating", "Customer (Won)", "Lost"], ...d.settings });
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  function set(k: string, v: any) { setS((p: any) => ({ ...p, [k]: v })); }

  async function uploadLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const res = await fetch("/api/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dataUrl: reader.result }) });
        const d = await res.json();
        if (d.url) {
          set("logo_url", d.url);
          // Persist immediately — don't wait for the Save button, or a refresh
          // loses the logo. This is what makes it survive.
          await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ logo_url: d.url }) });
          invalidateSettingsCache();
          toast("Logo uploaded & saved");
        } else toast(d.error || "Upload failed", "error");
      } catch { toast("Upload error", "error"); }
      setUploading(false);
    };
    reader.readAsDataURL(file);
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s) });
      if (res.ok) { invalidateSettingsCache(); toast("Settings saved"); } else toast("Save failed", "error");
    } catch { toast("Network error", "error"); }
    setSaving(false);
  }

  async function seed() {
    setSeeding(true);
    try {
      const res = await fetch("/api/demo?action=seed", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      // Never claim success the server didn't confirm.
      if (res.ok) toast("Demo data added — reload to see it");
      else toast(d.error || "Couldn't add demo data.", "error");
    } catch { toast("Network error — check your connection.", "error"); }
    setSeeding(false);
  }
  async function clearDemo() {
    setConfirmClear(false);
    try {
      const res = await fetch("/api/demo?action=clear", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (res.ok) toast("Demo data cleared");
      else toast(d.error || "Couldn't clear demo data.", "error");
    } catch { toast("Network error — check your connection.", "error"); }
  }

  if (loading) return <DashboardShell><DashTopbar account={data?.account} pageTitle="Settings" /><div className="p-12 flex justify-center text-muted"><Loader2 className="w-6 h-6 animate-spin" /></div></DashboardShell>;

  return (
    <DashboardShell>
      <DashTopbar account={data?.account} pageTitle="Settings" />
      <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-5 pb-24">
        <h1 className="font-display font-semibold text-2xl text-navy">Settings</h1>

        <section className="bg-white rounded-2xl border border-navy-line p-5 shadow-card space-y-4">
          <div className="flex items-center gap-2"><Building2 className="w-4 h-4 text-amber-deep" /><h2 className="font-semibold text-navy">Business profile</h2></div>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-surface border border-navy-line flex items-center justify-center overflow-hidden shrink-0">
              {s.logo_url ? <img src={s.logo_url} alt="" className="w-full h-full object-cover" /> : <Building2 className="w-6 h-6 text-navy/30" />}
            </div>
            <label className="cursor-pointer flex items-center gap-2 text-sm font-medium border border-navy-line px-4 py-2 rounded-xl hover:bg-surface">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Upload logo
              <input type="file" accept="image/*" onChange={uploadLogo} className="hidden" />
            </label>
          </div>
          <Field label="Business name"><input value={s.business_name || ""} onChange={(e) => set("business_name", e.target.value)} className="inp" placeholder="Your business" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone"><input value={s.phone || ""} onChange={(e) => set("phone", e.target.value)} className="inp" /></Field>
            <Field label="WhatsApp"><input value={s.whatsapp || ""} onChange={(e) => set("whatsapp", e.target.value)} className="inp" placeholder="for public list" /></Field>
          </div>
          <Field label="Address"><input value={s.address || ""} onChange={(e) => set("address", e.target.value)} className="inp" /></Field>
          <Field label="GST number (shown on invoices)"><input value={s.gst_number || ""} onChange={(e) => set("gst_number", e.target.value)} className="inp" placeholder="e.g. 22AAAAA0000A1Z5" /></Field>
          <Field label="Monthly revenue target (optional)"><input type="number" value={s.revenue_target || ""} onChange={(e) => set("revenue_target", e.target.value)} className="inp" placeholder="e.g. 50000" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Currency"><select value={s.currency} onChange={(e) => set("currency", e.target.value)} className="inp">{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Business type"><input value={s.business_type || ""} onChange={(e) => set("business_type", e.target.value)} className="inp" placeholder="e.g. D2C, salon" /></Field>
          </div>
        </section>

        <button onClick={save} disabled={saving} className="w-full flex items-center justify-center gap-2 bg-navy text-white font-medium py-3 rounded-xl hover:bg-navy-soft disabled:opacity-60">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save settings
        </button>

        <section className="bg-white rounded-2xl border border-navy-line p-5 shadow-card space-y-3">
          <div className="flex items-center gap-2"><Database className="w-4 h-4 text-amber-deep" /><h2 className="font-semibold text-navy">Data</h2></div>
          <div className="flex flex-wrap gap-2">
            <button onClick={seed} disabled={seeding} className="flex items-center gap-2 text-sm font-medium border border-navy-line px-4 py-2 rounded-xl hover:bg-surface disabled:opacity-60">
              {seeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />} Add demo data
            </button>
            <button onClick={() => setConfirmClear(true)} className="flex items-center gap-2 text-sm font-medium border border-navy-line px-4 py-2 rounded-xl hover:bg-surface text-red-600"><Trash2 className="w-4 h-4" /> Clear demo data</button>
            <a href="/api/catalog/export" className="flex items-center gap-2 text-sm font-medium border border-navy-line px-4 py-2 rounded-xl hover:bg-surface"><Download className="w-4 h-4" /> Export catalog CSV</a>
            <a href="/api/export-data" className="flex items-center gap-2 text-sm font-medium border border-navy-line px-4 py-2 rounded-xl hover:bg-surface"><Download className="w-4 h-4" /> Export all my data</a>
          </div>
        </section>

        <LoginLinksSection />
      </div>
      <ConfirmDialog open={confirmClear} title="Clear demo data?" body="Removes only demo contacts, orders, and items. Your real data stays." confirmLabel="Clear" onConfirm={clearDemo} onCancel={() => setConfirmClear(false)} />
      <style jsx global>{`.inp{width:100%;padding:0.6rem 0.75rem;border:1px solid #E4E8F0;border-radius:0.75rem;font-size:0.875rem;color:#16233F;outline:none}.inp:focus{border-color:#FF9E43}`}</style>
    </DashboardShell>
  );
}

function LoginLinksSection() {
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState("");
  useEffect(() => { setOrigin(window.location.origin); }, []);
  function copy(label: string, text: string) { navigator.clipboard.writeText(text); setCopied(label); setTimeout(() => setCopied(""), 1500); }
  const links = [
    { key: "admin", label: "Admin login", desc: "For you, the business owner", url: `${origin}/dashboard` },
    { key: "team", label: "Employee login", desc: "Share with your team members", url: `${origin}/team-login` },
  ];
  return (
    <section className="bg-white rounded-2xl border border-navy-line p-5 sm:p-6">
      <h2 className="font-display font-semibold text-lg text-navy mb-1">Login links</h2>
      <p className="text-muted text-sm mb-4">Quick access to share with your team. The employee link is where staff sign in with the login you create for them.</p>
      <div className="space-y-3">
        {links.map((l) => (
          <div key={l.key} className="flex items-center justify-between gap-3 border border-navy-line rounded-xl p-3">
            <div className="min-w-0">
              <p className="font-medium text-navy text-sm">{l.label}</p>
              <p className="text-xs text-muted truncate">{l.url || "…"}</p>
            </div>
            <button onClick={() => copy(l.key, l.url)} className="shrink-0 flex items-center gap-1.5 text-sm font-medium bg-navy text-white px-3 py-2 rounded-lg hover:bg-navy-soft">
              {copied === l.key ? <><Check className="w-4 h-4" /> Copied</> : <><Copy className="w-4 h-4" /> Copy</>}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-sm font-semibold text-navy mb-1.5">{label}</label>{children}</div>;
}

export default function Settings() {
  return <ToastProvider><SettingsInner /></ToastProvider>;
}
