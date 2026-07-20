"use client";

// The Records console: every object in the CRM in one list view, with edit and
// delete. It reuses the same server rules as the rest of the app — a faster
// door in, not a way around the guardrails.

import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { DashTopbar } from "@/components/DashTopbar";
import { ToastProvider, useToast, ConfirmDialog } from "@/components/Toast";
import { LostDialog, WonDialog } from "@/components/SharedModals";
import { Loader2, Search, Pencil, Trash2, X, Database } from "lucide-react";

const STAGES = ["New Lead", "Contacted", "Negotiating", "Customer (Won)", "Lost"];

// Fields we never show in the table (noisy or internal).
const HIDE = ["uid", "id", "is_demo", "is_owner", "payments", "items", "meta", "permissions"];

export default function RecordsPage() {
  return <ToastProvider><Inner /></ToastProvider>;
}

function Inner() {
  const { toast } = useToast();
  const [object, setObject] = useState("contacts");
  const [data, setData] = useState<any>({ rows: [], employees: [], editable: [], objects: [] });
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<any>(null);
  const [del, setDel] = useState<any>(null);

  function load() {
    setLoading(true);
    fetch(`/api/records?object=${object}`).then((r) => r.json()).then((d) => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }
  useEffect(() => { load(); }, [object]);

  const rows = (data.rows || []).filter((r: any) => !q || JSON.stringify(r).toLowerCase().includes(q.toLowerCase()));
  const readOnly = (data.editable || []).length === 0;
  const empName = (id: string) => (data.employees || []).find((e: any) => e.id === id)?.name || "—";

  // Columns: a useful subset, in a sensible order, for whatever object is loaded.
  const cols = rows.length > 0 ? Object.keys(rows[0]).filter((k) => !HIDE.includes(k)).slice(0, 6) : [];

  async function remove(row: any) {
    const res = await fetch(`/api/records?object=${object}&id=${row.id}`, { method: "DELETE" });
    if (res.ok) { toast("Deleted"); load(); }
    else { const d = await res.json().catch(() => ({})); toast(d.error || "Delete failed", "error"); }
    setDel(null);
  }

  function fmt(k: string, v: any) {
    if (v === null || v === undefined || v === "") return "—";
    if (k === "employee_id") return empName(v);
    if (typeof v === "boolean") return v ? "Yes" : "No";
    if (typeof v === "object") return Array.isArray(v) ? `${v.length} item(s)` : "—";
    const s = String(v);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return new Date(s).toLocaleDateString();
    return s.length > 42 ? s.slice(0, 42) + "…" : s;
  }

  return (
    <DashboardShell>
      <DashTopbar pageTitle="Records" />
      <div className="p-4 sm:p-6 space-y-4 max-w-6xl">
        <div className="flex gap-1.5 overflow-x-auto pb-1 dawn-scroll">
          {(data.objects || []).map((o: any) => (
            <button key={o.key} onClick={() => { setObject(o.key); setQ(""); }} className={`shrink-0 text-xs font-medium px-3 py-2 rounded-xl border ${object === o.key ? "bg-navy text-white border-navy" : "bg-white text-navy/60 border-navy-line hover:border-amber/40"}`}>{o.label}</button>
          ))}
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-navy/30 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search these records…" className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-navy-line text-sm text-navy bg-white focus:outline-none focus:border-amber" />
        </div>

        {readOnly && !loading && <p className="text-xs text-muted flex items-center gap-1.5"><Database className="w-3.5 h-3.5" /> This is a historical record — it can be read but never edited or deleted.</p>}

        {loading ? <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-navy/30" /></div>
        : rows.length === 0 ? <div className="dawn-card p-12 text-center text-muted text-sm">No records here yet.</div>
        : (
          <div className="dawn-card shadow-card overflow-hidden">
            <div className="dawn-table-wrap">
              <table className="w-full text-sm">
                <thead className="bg-surface border-b border-navy-line">
                  <tr>
                    {cols.map((c) => <th key={c} className="text-left font-semibold text-navy/70 text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">{c.replace(/_/g, " ")}</th>)}
                    <th className="px-4 py-3 w-20" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r: any) => (
                    <tr key={r.id} className="border-b border-navy-line/60 last:border-0 hover:bg-surface/60">
                      {cols.map((c) => <td key={c} className="px-4 py-3 text-navy whitespace-nowrap">{fmt(c, r[c])}</td>)}
                      <td className="px-4 py-3">
                        {!readOnly && (
                          <div className="flex items-center gap-1 justify-end">
                            <button onClick={() => setEdit(r)} className="btn-icon text-navy/40 hover:text-navy rounded-lg" title="Edit"><Pencil className="w-4 h-4" /></button>
                            <button onClick={() => setDel(r)} className="btn-icon text-navy/40 hover:text-red-600 rounded-lg" title="Delete"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted px-4 py-3 border-t border-navy-line">{rows.length} record(s)</p>
          </div>
        )}
      </div>

      {edit && <EditRow object={object} row={edit} editable={data.editable} employees={data.employees} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); toast("Saved"); load(); }} />}
      <ConfirmDialog
        open={!!del}
        title="Delete this record?"
        body={object === "contacts" ? "This also deletes their orders and history. This can't be undone." : "This can't be undone."}
        confirmLabel="Delete"
        onConfirm={() => del && remove(del)}
        onCancel={() => setDel(null)}
      />
    </DashboardShell>
  );
}

function EditRow({ object, row, editable, employees, onClose, onSaved }: { object: string; row: any; editable: string[]; employees: any[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<any>(() => {
    const init: any = {};
    for (const k of editable) init[k] = row[k] ?? "";
    return init;
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ask, setAsk] = useState<null | "lost" | "won" | "unwon">(null);

  async function save(extra?: any) {
    setErr(""); setBusy(true);
    const patch = { ...f, ...(extra || {}) };
    const res = await fetch("/api/records", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ object, id: row.id, patch }) });
    if (res.ok) { onSaved(); return; }
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    // The contacts API tells us when a reason is needed — ask, then retry.
    if (d.needsUnwonReason) { setAsk("unwon"); return; }
    setErr(d.error || "Couldn't save.");
  }

  function submit() {
    // Same pipeline rules as everywhere else.
    if (object === "contacts" && f.stage !== row.stage) {
      if (f.stage === "Lost") { setAsk("lost"); return; }
      if (f.stage === "Customer (Won)") { setAsk("won"); return; }
    }
    save();
  }

  const isDate = (k: string) => k.includes("date");
  const isNum = (k: string) => ["price", "cost", "amount", "monthly_salary", "compare_at_price"].includes(k);
  const isBool = (k: string) => ["done", "is_active"].includes(k);
  const isLong = (k: string) => ["notes", "body", "description"].includes(k);

  return (
    <>
      <div className="dawn-scrim">
        <div className="relative bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-lg p-5 animate-rise max-h-[92vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-navy">Edit record</h3>
            <button aria-label="Close" onClick={onClose} className="btn-icon text-navy/40"><X className="w-5 h-5" /></button>
          </div>
          <div className="space-y-3">
            {editable.map((k) => (
              <div key={k}>
                <label className="block text-xs font-semibold text-navy mb-1 capitalize">{k.replace(/_/g, " ")}</label>
                {k === "stage" ? (
                  <select value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className="rinp">{STAGES.map((s) => <option key={s}>{s}</option>)}</select>
                ) : k === "employee_id" ? (
                  <select value={f[k] || ""} onChange={(e) => setF({ ...f, [k]: e.target.value })} className="rinp">
                    {employees.map((e: any) => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                ) : k === "order_status" ? (
                  <select value={f[k] || "Placed"} onChange={(e) => setF({ ...f, [k]: e.target.value })} className="rinp">{["Placed", "Processing", "Shipped", "Delivered"].map((s) => <option key={s}>{s}</option>)}</select>
                ) : k === "status" && object === "employees" ? (
                  <select value={f[k] || "active"} onChange={(e) => setF({ ...f, [k]: e.target.value })} className="rinp">{["active", "inactive"].map((s) => <option key={s}>{s}</option>)}</select>
                ) : isBool(k) ? (
                  <select value={String(!!f[k])} onChange={(e) => setF({ ...f, [k]: e.target.value === "true" })} className="rinp"><option value="true">Yes</option><option value="false">No</option></select>
                ) : isLong(k) ? (
                  <textarea value={f[k] || ""} onChange={(e) => setF({ ...f, [k]: e.target.value })} rows={3} className="rinp resize-none" />
                ) : (
                  <input type={isDate(k) ? "date" : isNum(k) ? "number" : "text"} value={f[k] ?? ""} onChange={(e) => setF({ ...f, [k]: e.target.value })} className="rinp" />
                )}
              </div>
            ))}
            {err && <p className="text-sm text-red-600">{err}</p>}
            <button onClick={submit} disabled={busy} className="w-full flex items-center justify-center gap-2 bg-navy text-white font-medium py-3 rounded-xl hover:bg-navy-soft disabled:opacity-60">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Save changes
            </button>
          </div>
          <style jsx>{`.rinp{width:100%;padding:0.6rem 0.75rem;border:1px solid #E4E8F0;border-radius:0.75rem;font-size:0.875rem;color:#16233F;outline:none;background:#fff}.rinp:focus{border-color:#FF9E43}`}</style>
        </div>
      </div>

      {ask === "lost" && <LostDialog name={row.name || "this lead"} onCancel={() => setAsk(null)} onConfirm={(note) => { setAsk(null); save({ lostNote: note }); }} />}
      {ask === "won" && <WonDialog name={row.name || "this lead"} onCancel={() => setAsk(null)} onConfirm={(note) => { setAsk(null); save({ wonNote: note }); }} />}
      {ask === "unwon" && <UnwonDialog name={row.name || "this customer"} onCancel={() => { setAsk(null); setF({ ...f, stage: row.stage }); }} onConfirm={(note) => { setAsk(null); save({ unwonReason: note }); }} />}
    </>
  );
}

function UnwonDialog({ name, onConfirm, onCancel }: { name: string; onConfirm: (note: string) => void; onCancel: () => void }) {
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  return (
    <div className="dawn-scrim z-[60]">
      <div className="dawn-sheet relative">
        <h3 className="font-semibold text-navy mb-2">Move {name} out of Customer (Won)?</h3>
        <p className="text-sm text-muted mb-3">This customer has real orders, so they&apos;re normally locked as won. Only you can reverse that — and only with a reason, which is logged. (e.g. &ldquo;order was recorded on the wrong contact&rdquo;, &ldquo;fully refunded&rdquo;.)</p>
        <textarea autoFocus value={note} onChange={(e) => { setNote(e.target.value); setErr(""); }} rows={3} placeholder="Reason (required)" className="w-full px-3 py-2.5 rounded-xl border border-navy-line text-sm text-navy focus:outline-none focus:border-amber resize-none" />
        {err && <p className="text-sm text-red-600 mt-1">{err}</p>}
        <div className="flex gap-2 mt-4">
          <button onClick={onCancel} className="flex-1 border border-navy-line text-navy font-medium py-2.5 rounded-xl hover:bg-surface">Cancel</button>
          <button onClick={() => { if (!note.trim()) { setErr("Please add a reason."); return; } onConfirm(note.trim()); }} className="flex-1 bg-red-600 text-white font-medium py-2.5 rounded-xl hover:bg-red-700">Override</button>
        </div>
      </div>
    </div>
  );
}
