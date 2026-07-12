"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/DashboardShell";
import { DashTopbar } from "@/components/DashTopbar";
import { useBrief } from "@/lib/use-brief";
import { ToastProvider, useToast, ConfirmDialog } from "@/components/Toast";
import { ConvertModal } from "@/components/ConvertModal";
import { LostDialog } from "@/components/SharedModals";
import { useSettings } from "@/lib/use-settings";
import { Loader2, Plus, LayoutGrid, List, Phone, MessageCircle, X, Search } from "lucide-react";

type Contact = {
  id: string; name: string; phone: string; email: string; instagram_handle: string;
  source: string; stage: string; tags: string[]; interested_item_ids: string[];
  follow_up_date: string | null; notes: string;
};

// Stable internal stage values — never change (data integrity). Display
// names come from settings so "renaming" is cosmetic and safe.
const STAGE_VALUES = ["New Lead", "Contacted", "Negotiating", "Customer (Won)", "Lost"];
const SOURCES = ["Instagram DM", "WhatsApp", "Referral", "Walk-in", "Website", "Other"];
const stageColor: Record<string, string> = {
  "New Lead": "bg-blue-50 text-blue-700 border-blue-200",
  "Contacted": "bg-amber/10 text-amber-deep border-amber/30",
  "Negotiating": "bg-purple-50 text-purple-700 border-purple-200",
  "Customer (Won)": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Lost": "bg-navy/5 text-navy/50 border-navy-line",
};

function QuickAdd({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const { toast } = useToast();
  const [f, setF] = useState<any>({ name: "", phone: "", instagramHandle: "", source: "Instagram DM", notes: "", employeeId: "" });
  const [saving, setSaving] = useState(false);
  const [dup, setDup] = useState<any>(null);
  const [dupOk, setDupOk] = useState(false);
  const [employees, setEmployees] = useState<{ id: string; name: string; status: string }[]>([]);

  useEffect(() => { fetch("/api/employees").then((r) => r.json()).then((d) => setEmployees((d.employees || []).filter((e: any) => e.status === "active"))).catch(() => {}); }, []);

  async function checkDup(val: string) {
    if (!val) { setDup(null); return; }
    try { const d = await (await fetch(`/api/contacts?check=${encodeURIComponent(val)}`)).json(); setDup(d.duplicate); } catch {}
  }

  const [err, setErr] = useState("");

  async function save() {
    setErr("");
    if (!f.name.trim()) { setErr("Name is required."); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/contacts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
      if (res.ok) { toast("Lead added"); onAdded(); onClose(); }
      else { const d = await res.json().catch(() => ({})); setErr(d.error || "Couldn't save — try again."); }
    } catch { setErr("Network error — check your connection."); }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="absolute inset-0 bg-navy/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-md p-5 animate-rise max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-navy text-lg">Add lead</h3>
          <button onClick={onClose} className="p-1.5 text-navy/40 hover:text-navy"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-3">
          <input autoFocus value={f.name} onChange={(e) => { setF({ ...f, name: e.target.value }); setErr(""); }} placeholder="Name *" className="inp" />
          <input value={f.phone} onChange={(e) => { setF({ ...f, phone: e.target.value }); setErr(""); setDupOk(false); }} onBlur={(e) => checkDup(e.target.value)} placeholder="Phone" className="inp" />
          {dup && (
            <div className="bg-amber/10 border border-amber/40 rounded-xl p-3">
              <p className="text-xs text-navy">⚠ <span className="font-semibold">{dup.name}</span> already has this phone or handle.</p>
              <label className="flex items-center gap-2 mt-2 text-xs text-navy cursor-pointer">
                <input type="checkbox" checked={dupOk} onChange={(e) => setDupOk(e.target.checked)} className="w-3.5 h-3.5 accent-amber-deep" />
                Add anyway — this is a different person
              </label>
            </div>
          )}
          <input value={f.instagramHandle} onChange={(e) => { setF({ ...f, instagramHandle: e.target.value }); setDupOk(false); }} onBlur={(e) => checkDup(e.target.value.replace("@", ""))} placeholder="Instagram handle" className="inp" />
          <select value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} className="inp">{SOURCES.map((s) => <option key={s}>{s}</option>)}</select>
          {employees.length > 0 && (
            <select value={f.employeeId} onChange={(e) => setF({ ...f, employeeId: e.target.value })} className="inp">
              <option value="">Assign employee (optional)</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          )}
          <textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} rows={2} placeholder="Notes (optional)" className="inp resize-none" />
          {err && <p className="text-sm text-red-600">{err}</p>}
          <button onClick={save} disabled={saving || (!!dup && !dupOk)} className="w-full flex items-center justify-center gap-2 bg-navy text-white font-medium py-3 rounded-xl hover:bg-navy-soft disabled:opacity-60">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Add lead
          </button>
        </div>
        <style jsx>{`.inp{width:100%;padding:0.6rem 0.75rem;border:1px solid #E4E8F0;border-radius:0.75rem;font-size:0.875rem;color:#16233F;outline:none}.inp:focus{border-color:#FF9E43}`}</style>
      </div>
    </div>
  );
}

function ContactCard({ c, stageNames, onDragStart, onConvert, onMove }: { c: Contact; stageNames: string[]; onDragStart?: (e: any) => void; onConvert: (c: Contact) => void; onMove: (id: string, stage: string) => void }) {
  const wa = (c.phone || "").replace(/[^0-9]/g, "");
  return (
    <div draggable onDragStart={onDragStart} className="bg-white rounded-xl border border-navy-line p-3 shadow-card cursor-grab active:cursor-grabbing">
      <Link href={`/dashboard/contacts/${c.id}`} className="block">
        <p className="font-semibold text-navy text-sm">{c.name}</p>
        {c.phone && <p className="text-xs text-muted">{c.phone}</p>}
        {c.instagram_handle && <p className="text-xs text-muted">@{c.instagram_handle}</p>}
        <span className="inline-block text-[10px] text-muted mt-1">{c.source}</span>
      </Link>
      <div className="flex items-center gap-1 mt-2 pt-2 border-t border-navy-line">
        {wa && <a href={`https://wa.me/${wa}`} target="_blank" className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg"><MessageCircle className="w-3.5 h-3.5" /></a>}
        {c.phone && <a href={`tel:${c.phone}`} className="p-1.5 text-navy/50 hover:bg-navy/5 rounded-lg"><Phone className="w-3.5 h-3.5" /></a>}
        {c.stage !== "Customer (Won)" && (
          <button onClick={() => onConvert(c)} className="ml-auto text-[11px] font-semibold text-amber-deep bg-amber/10 px-2 py-1 rounded-lg hover:bg-amber/20">Convert →</button>
        )}
      </div>
      <select
        value={c.stage}
        onChange={(e) => onMove(c.id, e.target.value)}
        onClick={(e) => e.stopPropagation()}
        className="mt-2 w-full text-[11px] text-navy/70 border border-navy-line rounded-lg px-2 py-1.5 bg-surface focus:outline-none focus:border-amber"
        aria-label={`Move ${c.name} to another stage`}
      >
        {STAGE_VALUES.map((s, i) => <option key={s} value={s}>{stageNames[i] || s}</option>)}
      </select>
    </div>
  );
}

function ContactsInner() {
  const { data } = useBrief();
  const { stages: stageNames } = useSettings();
  const { toast } = useToast();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"board" | "list">("board");
  const [quickAdd, setQuickAdd] = useState(false);
  const [query, setQuery] = useState("");
  const [convert, setConvert] = useState<Contact | null>(null);
  const [lostFor, setLostFor] = useState<Contact | null>(null);
  const [backFor, setBackFor] = useState<{ c: Contact; stage: string } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    fetch("/api/contacts").then((r) => r.json()).then((d) => { setContacts(d.contacts || []); setLoading(false); }).catch(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  const filtered = contacts.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()) || (c.phone || "").includes(query) || (c.instagram_handle || "").toLowerCase().includes(query.toLowerCase()));

  async function moveStage(id: string, stage: string, lostNote?: string, confirmedBack?: boolean) {
    const c = contacts.find((x) => x.id === id);
    if (!c || c.stage === stage) return;
    // Winning goes THROUGH the order modal — the stage is only committed by
    // the server when an order is recorded (or explicitly won with a reason).
    if (stage === "Customer (Won)") { setConvert(c); return; }
    // Marking Lost always requires a reason — intercept and ask first.
    if (stage === "Lost" && !lostNote) { setLostFor(c); return; }
    // Moving a customer BACK into the pipeline is unusual — confirm it.
    // (Churning to Lost is handled by the Lost dialog above, not this.)
    if (c.stage === "Customer (Won)" && stage !== "Lost" && !confirmedBack) { setBackFor({ c, stage }); return; }
    const prev = contacts;
    setContacts((cs) => cs.map((x) => x.id === id ? { ...x, stage } : x));
    const res = await fetch("/api/contacts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, stage, logStage: true, ...(lostNote ? { lostNote } : {}) }) });
    if (!res.ok) {
      setContacts(prev); // revert — the server said no, the board shouldn't lie
      const d = await res.json().catch(() => ({}));
      toast(d.error || "Couldn't move — try again.", "error");
    }
  }

  return (
    <DashboardShell>
      <DashTopbar account={data?.account} pageTitle="Contacts" />
      <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="font-display font-semibold text-2xl text-navy">Contacts</h1>
            <p className="text-muted text-sm mt-1">Your leads and customers, from first message to sale.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex bg-white border border-navy-line rounded-xl p-0.5">
              <button onClick={() => setView("board")} className={`p-2 rounded-lg ${view === "board" ? "bg-navy text-white" : "text-muted"}`}><LayoutGrid className="w-4 h-4" /></button>
              <button onClick={() => setView("list")} className={`p-2 rounded-lg ${view === "list" ? "bg-navy text-white" : "text-muted"}`}><List className="w-4 h-4" /></button>
            </div>
          </div>
        </div>

        {!loading && contacts.length > 0 && (
          <div className="flex items-center gap-2 border border-navy-line rounded-xl px-3 bg-white max-w-sm">
            <Search className="w-4 h-4 text-navy/40" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search contacts…" className="flex-1 py-2.5 text-sm text-navy focus:outline-none" />
          </div>
        )}

        {loading ? (
          <div className="p-12 flex items-center justify-center text-muted"><Loader2 className="w-6 h-6 animate-spin mr-3" /> Loading contacts…</div>
        ) : contacts.length === 0 ? (
          <div className="bg-white rounded-2xl border border-navy-line p-12 text-center shadow-card">
            <div className="w-14 h-14 rounded-2xl bg-amber/15 flex items-center justify-center mx-auto mb-4"><Plus className="w-7 h-7 text-amber-deep" /></div>
            <h2 className="text-lg font-semibold text-navy mb-2">No leads yet</h2>
            <p className="text-muted text-sm max-w-sm mx-auto mb-5">Add your first lead — someone who messaged you, or a walk-in. It takes 10 seconds.</p>
            <button onClick={() => setQuickAdd(true)} className="inline-flex items-center gap-2 bg-navy text-white font-medium px-5 py-2.5 rounded-xl hover:bg-navy-soft"><Plus className="w-4 h-4" /> Add your first lead</button>
          </div>
        ) : view === "board" ? (
        <div className="relative">
          <div className="flex gap-3 overflow-x-auto pb-4 -mx-1 px-1 dawn-scroll">
            {STAGE_VALUES.map((stage, si) => {
              const inStage = filtered.filter((c) => c.stage === stage);
              const displayName = stageNames[si] || stage;
              return (
                <div key={stage} className="shrink-0 w-64" onDragOver={(e) => e.preventDefault()} onDrop={() => { if (dragId) moveStage(dragId, stage); setDragId(null); }}>
                  <div className="flex items-center justify-between mb-2 px-1">
                    <span className={`text-xs font-semibold px-2 py-1 rounded-lg border ${stageColor[stage]}`}>{displayName}</span>
                    <span className="text-xs text-muted">{inStage.length}</span>
                  </div>
                  <div className="space-y-2 min-h-[60px]">
                    {inStage.map((c) => <ContactCard key={c.id} c={c} stageNames={stageNames} onDragStart={() => setDragId(c.id)} onConvert={setConvert} onMove={moveStage} />)}
                  </div>
                </div>
              );
            })}
          </div>
          {/* Fade edge signals more columns off-screen */}
          <div className="pointer-events-none absolute top-0 right-0 bottom-4 w-10 bg-gradient-to-l from-surface to-transparent sm:hidden" />
        </div>
        ) : (
          <div className="grid gap-2">
            {filtered.map((c) => (
              <div key={c.id} className="bg-white rounded-xl border border-navy-line p-3 shadow-card flex items-center justify-between gap-3 hover:border-amber/40">
                <Link href={`/dashboard/contacts/${c.id}`} className="min-w-0 flex-1">
                  <p className="font-semibold text-navy text-sm">{c.name}</p>
                  <p className="text-xs text-muted">{c.phone || c.instagram_handle ? (c.phone || "@" + c.instagram_handle) : c.source}</p>
                </Link>
                <select
                  value={c.stage}
                  onChange={(e) => moveStage(c.id, e.target.value)}
                  className={`text-[11px] font-semibold px-2 py-1.5 rounded-lg border shrink-0 focus:outline-none ${stageColor[c.stage] || "border-navy-line text-navy/70"}`}
                  aria-label={`Move ${c.name} to another stage`}
                >
                  {STAGE_VALUES.map((s, i) => <option key={s} value={s}>{stageNames[i] || s}</option>)}
                </select>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Floating quick-add */}
      <button onClick={() => setQuickAdd(true)} className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-amber text-navy shadow-glow flex items-center justify-center hover:bg-amber-glow transition-colors">
        <Plus className="w-6 h-6" />
      </button>

      {quickAdd && <QuickAdd onClose={() => setQuickAdd(false)} onAdded={load} />}
      {convert && <ConvertModal contact={convert} onClose={() => setConvert(null)} onDone={() => { setConvert(null); load(); }} />}
      {lostFor && <LostDialog name={lostFor.name} onCancel={() => setLostFor(null)} onConfirm={(note) => { const lid = lostFor.id; setLostFor(null); moveStage(lid, "Lost", note); toast("Marked Lost"); }} />}
      <ConfirmDialog
        open={!!backFor}
        title="Move customer back into the pipeline?"
        body={backFor ? `${backFor.c.name} is a customer. Their order history stays, but they'll be treated as a lead again.` : ""}
        confirmLabel="Move back"
        onConfirm={() => { if (backFor) { const { c, stage } = backFor; setBackFor(null); moveStage(c.id, stage, undefined, true); } }}
        onCancel={() => setBackFor(null)}
      />
    </DashboardShell>
  );
}

export default function Contacts() {
  return <ToastProvider><ContactsInner /></ToastProvider>;
}
