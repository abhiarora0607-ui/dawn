"use client";

// CONTROL — the admin bench. Settings that shape everyone's experience,
// announcements owners will read, and a record of what you changed.

import { useEffect, useState } from "react";
import { OperatorGate } from "@/components/OperatorGate";
import { Hero } from "@/components/OperatorTabs";
import { Loader2, LogOut, Megaphone } from "lucide-react";

export default function ControlPage() {
  return <OperatorGate><Control /></OperatorGate>;
}

function Control() {
  const [bill, setBill] = useState<any>(null);
  const [loadErr, setLoadErr] = useState("");
  const [ann, setAnn] = useState<any[]>([]);
  const [annTitle, setAnnTitle] = useState(""); const [annBody, setAnnBody] = useState("");
  const [cfgTrial, setCfgTrial] = useState(""); const [cfgGrace, setCfgGrace] = useState("");
  const [savedMsg, setSavedMsg] = useState("");

  function load() {
    fetch("/api/operator/billing").then((r) => r.json()).then((b) => {
      setBill(b);
      setCfgTrial(String(b.billingSettings?.default_trial_days ?? 14));
      setCfgGrace(String(b.billingSettings?.grace_days ?? 3));
    }).catch(() => setLoadErr("Couldn't load — try a refresh."));
    fetch("/api/operator/announcements").then((r) => r.json()).then((x) => setAnn(x.items || [])).catch(() => {});
  }
  useEffect(() => { load(); }, []);

  async function saveSettings() {
    await fetch("/api/operator/billing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update_settings", default_trial_days: Number(cfgTrial), grace_days: Number(cfgGrace) }) });
    setSavedMsg("Saved — applies to every new trial from now on.");
    setTimeout(() => setSavedMsg(""), 4000);
    load();
  }
  async function postAnn() {
    if (!annTitle.trim()) return;
    await fetch("/api/operator/announcements", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: annTitle, body: annBody }) });
    setAnnTitle(""); setAnnBody("");
    fetch("/api/operator/announcements").then((r) => r.json()).then((x) => setAnn(x.items || [])).catch(() => {});
  }
  async function delAnn(id: string) {
    await fetch(`/api/operator/announcements?id=${id}`, { method: "DELETE" });
    setAnn(ann.filter((a) => a.id !== id));
  }

  if (!bill) return <div className="py-20 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-navy/30" /></div>;

  return (
    <>
      <Hero line="Control" sub="Settings that shape everyone's experience." />

      <div className="dawn-card p-5">
        {loadErr && <p className="t-small text-red-600 bg-red-50 rounded-xl px-3 py-2 mb-3">{loadErr} <button onClick={() => location.reload()} className="underline font-medium">Try again</button></p>}
        <p className="font-semibold text-navy text-sm mb-1">Trial length</p>
        <p className="text-[12px] text-muted mb-3">Applies to every new business. Existing trials keep their own clock.</p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block text-xs text-muted">Free days<input type="number" value={cfgTrial} onChange={(e) => setCfgTrial(e.target.value)} className="inp mt-1 w-28" /></label>
          <label className="block text-xs text-muted">Grace after<input type="number" value={cfgGrace} onChange={(e) => setCfgGrace(e.target.value)} className="inp mt-1 w-28" /></label>
          <button onClick={saveSettings} className="bg-navy text-white text-sm font-medium px-4 py-2.5 rounded-xl">Save</button>
        </div>
        {savedMsg && <p className="text-xs text-emerald-600 mt-2">{savedMsg}</p>}
      </div>

      <div className="dawn-card p-5">
        <p className="font-semibold text-navy text-sm mb-1 flex items-center gap-1.5"><Megaphone className="w-4 h-4 text-amber-deep" /> Tell everyone what&apos;s new</p>
        <p className="text-[12px] text-muted mb-3">Appears on every owner&apos;s dashboard for 60 days.</p>
        <input value={annTitle} onChange={(e) => setAnnTitle(e.target.value)} placeholder="Title — e.g. Public menu cards are here" className="inp mb-2" />
        <div className="flex gap-2">
          <input value={annBody} onChange={(e) => setAnnBody(e.target.value)} placeholder="One-line detail (optional)" className="inp flex-1" />
          <button onClick={postAnn} className="bg-navy text-white text-sm font-medium px-4 rounded-xl">Post</button>
        </div>
        {ann.length > 0 && (
          <div className="mt-3 space-y-1">
            {ann.map((a) => (
              <p key={a.id} className="text-xs text-navy flex items-center justify-between border-b border-navy-line/40 py-1.5 last:border-0">
                <span className="truncate">{a.title} <span className="text-muted">· {new Date(a.created_at).toLocaleDateString()}</span></span>
                <button onClick={() => delAnn(a.id)} className="text-red-400 hover:text-red-600 ml-2 shrink-0">Remove</button>
              </p>
            ))}
          </div>
        )}
      </div>

      <div className="dawn-card p-5">
        <p className="font-semibold text-navy text-sm mb-3">Session</p>
        <button onClick={async () => { await fetch("/api/operator/auth", { method: "DELETE" }); window.location.href = "/operator"; }}
          className="flex items-center gap-1.5 text-sm font-medium text-navy/60 border border-navy-line px-3.5 py-2 rounded-xl hover:bg-surface">
          <LogOut className="w-4 h-4" /> Sign out of operator
        </button>
      </div>

      <p className="text-center text-[12px] text-muted">
        Dawn&apos;s privacy wall applies to you too: this console shows usage shape and money — never anything inside a business&apos;s CRM.
      </p>
    </>
  );
}
