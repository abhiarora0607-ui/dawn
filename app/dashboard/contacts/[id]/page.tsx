"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { DashboardShell } from "@/components/DashboardShell";
import { DashTopbar } from "@/components/DashTopbar";
import { useBrief } from "@/lib/use-brief";
import { ToastProvider, useToast, ConfirmDialog } from "@/components/Toast";
import { ConvertModal } from "@/components/ConvertModal";
import { OrderModal } from "@/components/OrderModal";
import { useSettings } from "@/lib/use-settings";
import {
  Loader2, ArrowLeft, Phone, MessageCircle, Copy, Trash2, Send, ShoppingBag,
  StickyNote, GitBranch, Paperclip, Check, Plus,
} from "lucide-react";

const STAGES = ["New Lead", "Contacted", "Negotiating", "Customer (Won)", "Lost"];

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

const actIcon: Record<string, any> = { note: StickyNote, stage_change: GitBranch, sale: ShoppingBag, attachment: Paperclip };

function ProfileInner() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data } = useBrief();
  const { toast } = useToast();
  const { currency } = useSettings();
  const { stages: stageNames } = useSettings();
  const [pendingStage, setPendingStage] = useState<string | null>(null);

  function askStageChange(newStage: string) {
    if (newStage === contact.stage) return;
    setPendingStage(newStage);
  }
  const [contact, setContact] = useState<any>(null);
  const [activities, setActivities] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [uploadingAtt, setUploadingAtt] = useState(false);

  async function uploadAttachment(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setUploadingAtt(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const up = await (await fetch("/api/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dataUrl: reader.result }) })).json();
        if (up.url) {
          await fetch(`/api/contacts/${id}/attachment`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileUrl: up.url, kind: "payment_screenshot" }) });
          toast("Screenshot attached — check Suggestions to convert");
          load();
        } else toast(up.error || "Upload failed", "error");
      } catch { toast("Upload error", "error"); }
      setUploadingAtt(false);
    };
    reader.readAsDataURL(file);
  }
  const [convert, setConvert] = useState(false);
  const [newOrder, setNewOrder] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  function load() {
    fetch(`/api/contacts/${id}`).then((r) => r.json()).then((d) => {
      if (d.contact) { setContact(d.contact); setActivities(d.activities || []); setSales(d.sales || []); }
      setLoading(false);
    }).catch(() => setLoading(false));
  }
  useEffect(() => { load(); }, [id]);

  async function updateField(patch: any) {
    setContact((c: any) => ({ ...c, ...patch }));
    await fetch("/api/contacts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...patch, logStage: patch.stage !== undefined }) });
    if (patch.stage) load();
  }

  async function addNote() {
    if (!note.trim()) return;
    await fetch(`/api/contacts/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: note }) });
    setNote(""); toast("Note added"); load();
  }

  async function doDelete() {
    await fetch(`/api/contacts?id=${id}`, { method: "DELETE" });
    toast("Contact deleted"); router.push("/dashboard/contacts");
  }

  if (loading) return <DashboardShell><DashTopbar account={data?.account} pageTitle="Contact" /><div className="p-12 flex justify-center text-muted"><Loader2 className="w-6 h-6 animate-spin" /></div></DashboardShell>;
  if (!contact) return <DashboardShell><DashTopbar account={data?.account} pageTitle="Contact" /><div className="p-12 text-center text-muted">Contact not found.</div></DashboardShell>;

  const wa = (contact.phone || "").replace(/[^0-9]/g, "");
  const ltv = sales.reduce((s, x) => s + (Number(x.total) || 0), 0);

  return (
    <DashboardShell>
      <DashTopbar account={data?.account} pageTitle="Contact" />
      <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-5">
        <button onClick={() => router.push("/dashboard/contacts")} className="flex items-center gap-1.5 text-sm text-muted hover:text-navy"><ArrowLeft className="w-4 h-4" /> Contacts</button>

        {/* Header */}
        <div className="bg-white rounded-2xl border border-navy-line p-5 shadow-card">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="font-display font-semibold text-2xl text-navy">{contact.name}</h1>
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-sm text-muted">
                {contact.phone && <span>{contact.phone}</span>}
                {contact.instagram_handle && <span>@{contact.instagram_handle}</span>}
                {contact.email && <span>{contact.email}</span>}
                <span>· {contact.source}</span>
              </div>
            </div>
            <button onClick={() => setConfirmDel(true)} className="p-2 text-navy/40 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
          </div>

          {/* One-tap actions */}
          <div className="flex flex-wrap gap-2 mt-4">
            {wa && <a href={`https://wa.me/${wa}`} target="_blank" className="flex items-center gap-1.5 text-sm font-medium bg-emerald-500 text-white px-3 py-2 rounded-xl hover:bg-emerald-600"><MessageCircle className="w-4 h-4" /> WhatsApp</a>}
            {contact.phone && <a href={`tel:${contact.phone}`} className="flex items-center gap-1.5 text-sm font-medium border border-navy-line text-navy px-3 py-2 rounded-xl hover:bg-surface"><Phone className="w-4 h-4" /> Call</a>}
            {contact.instagram_handle && <button onClick={() => { navigator.clipboard.writeText("@" + contact.instagram_handle); toast("Handle copied"); }} className="flex items-center gap-1.5 text-sm font-medium border border-navy-line text-navy px-3 py-2 rounded-xl hover:bg-surface"><Copy className="w-4 h-4" /> Copy handle</button>}
            {contact.stage !== "Customer (Won)" ? (
              <button onClick={() => setConvert(true)} className="flex items-center gap-1.5 text-sm font-semibold bg-amber text-navy px-3 py-2 rounded-xl hover:bg-amber-glow ml-auto"><ShoppingBag className="w-4 h-4" /> Convert to customer</button>
            ) : (
              <button onClick={() => setNewOrder(true)} className="flex items-center gap-1.5 text-sm font-semibold bg-amber text-navy px-3 py-2 rounded-xl hover:bg-amber-glow ml-auto"><Plus className="w-4 h-4" /> New order</button>
            )}
          </div>
        </div>

        {/* Stage + follow-up */}
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="bg-white rounded-2xl border border-navy-line p-4 shadow-card">
            <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-2">Stage</label>
            <select value={contact.stage} onChange={(e) => askStageChange(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-navy-line text-sm text-navy focus:outline-none focus:border-amber">
              {STAGES.map((s, i) => <option key={s} value={s}>{stageNames[i] || s}</option>)}
            </select>
          </div>
          <div className="bg-white rounded-2xl border border-navy-line p-4 shadow-card">
            <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-2">Follow-up date</label>
            <input type="date" value={contact.follow_up_date || ""} onChange={(e) => updateField({ followUpDate: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-navy-line text-sm text-navy focus:outline-none focus:border-amber" />
          </div>
        </div>

        {/* Customer stats */}
        {sales.length > 0 && (
          <div className="bg-navy rounded-2xl p-5 text-white flex items-center justify-between">
            <div><p className="text-xs text-white/50 uppercase tracking-wide">Lifetime value</p><p className="text-2xl font-bold text-amber">{currency}{ltv}</p></div>
            <div className="text-right"><p className="text-xs text-white/50 uppercase tracking-wide">Orders</p><p className="text-2xl font-bold">{sales.length}</p></div>
          </div>
        )}

        {/* Add note + attachment */}
        <div className="bg-white rounded-2xl border border-navy-line p-4 shadow-card space-y-2">
          <div className="flex gap-2">
            <input value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addNote()} placeholder="Add a note…" className="flex-1 px-3 py-2 rounded-xl border border-navy-line text-sm text-navy focus:outline-none focus:border-amber" />
            <button onClick={addNote} className="bg-navy text-white px-4 rounded-xl hover:bg-navy-soft"><Send className="w-4 h-4" /></button>
          </div>
          <label className="cursor-pointer flex items-center gap-2 text-xs font-medium text-amber-deep w-fit">
            {uploadingAtt ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5" />} Attach payment screenshot
            <input type="file" accept="image/*" onChange={uploadAttachment} className="hidden" />
          </label>
        </div>

        {/* Timeline */}
        <div>
          <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">Activity</p>
          <div className="space-y-3">
            {activities.length === 0 ? (
              <p className="text-sm text-muted">No activity yet.</p>
            ) : activities.map((a) => {
              const Icon = actIcon[a.type] || StickyNote;
              return (
                <div key={a.id} className="flex gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white border border-navy-line flex items-center justify-center shrink-0"><Icon className="w-4 h-4 text-amber-deep" /></div>
                  <div className="flex-1 min-w-0 pb-3 border-b border-navy-line/50">
                    <p className="text-sm text-navy">{a.content}</p>
                    <p className="text-xs text-muted mt-0.5">{timeAgo(a.created_at)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {convert && <ConvertModal contact={contact} onClose={() => setConvert(false)} onDone={() => { setConvert(false); load(); }} />}
      {newOrder && <OrderModal contact={contact} onClose={() => setNewOrder(false)} onDone={() => { setNewOrder(false); load(); }} />}
      <ConfirmDialog
        open={!!pendingStage}
        title="Change stage?"
        body={pendingStage ? `Move ${contact.name} to "${stageNames[STAGES.indexOf(pendingStage)] || pendingStage}"?` : ""}
        confirmLabel="Change"
        onConfirm={() => { if (pendingStage) updateField({ stage: pendingStage }); setPendingStage(null); }}
        onCancel={() => setPendingStage(null)}
      />
      <ConfirmDialog open={confirmDel} title="Delete this contact?" body="This removes them and all their activity. Can't be undone." onConfirm={doDelete} onCancel={() => setConfirmDel(false)} />
    </DashboardShell>
  );
}

export default function ContactProfile() {
  return <ToastProvider><ProfileInner /></ToastProvider>;
}
