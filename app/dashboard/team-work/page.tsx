"use client";

// Admin view of the team's Tasks and Notes — and where the admin assigns work.
// An assigned task appears in the employee's portal as if they created it.

import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { DashTopbar } from "@/components/DashTopbar";
import { ToastProvider, useToast } from "@/components/Toast";
import { Loader2, Plus, X, Trash2, CheckSquare, StickyNote, UserCheck } from "lucide-react";

export default function TeamWorkPage() {
  return <ToastProvider><Inner /></ToastProvider>;
}

function Inner() {
  const { toast } = useToast();
  const [d, setD] = useState<any>({ tasks: [], notes: [], employees: [], contacts: [] });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"tasks" | "notes">("tasks");
  const [who, setWho] = useState("all");
  const [modal, setModal] = useState(false);

  function load() {
    fetch("/api/admin-tasks").then((r) => r.json()).then((res) => { setD(res); setLoading(false); }).catch(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  const empName = (id: string) => (d.employees || []).find((e: any) => e.id === id)?.name || "Unassigned";
  const items = (tab === "tasks" ? d.tasks : d.notes).filter((x: any) => who === "all" || x.employee_id === who);

  async function toggle(t: any) {
    await fetch("/api/admin-tasks", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: t.id, done: !t.done }) });
    load();
  }
  async function remove(id: string) {
    await fetch(`/api/admin-tasks?id=${id}&kind=${tab === "notes" ? "note" : "task"}`, { method: "DELETE" });
    toast("Deleted"); load();
  }

  const today = new Date(new Date().toDateString());

  return (
    <DashboardShell>
      <DashTopbar pageTitle="Team work" />
      <div className="p-4 sm:p-6 space-y-4 max-w-4xl">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex gap-1 bg-white p-1 rounded-xl border border-navy-line">
            {(["tasks", "notes"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg capitalize ${tab === t ? "bg-navy text-white" : "text-muted"}`}>
                {t === "tasks" ? <CheckSquare className="w-4 h-4" /> : <StickyNote className="w-4 h-4" />} {t}
              </button>
            ))}
          </div>
          <button onClick={() => setModal(true)} className="flex items-center gap-1.5 text-sm font-medium bg-amber-deep text-white px-3 py-2 rounded-xl hover:opacity-90">
            <Plus className="w-4 h-4" /> Assign {tab === "tasks" ? "task" : "note"}
          </button>
        </div>

        <select value={who} onChange={(e) => setWho(e.target.value)} className="w-full sm:w-64 px-3 py-2.5 rounded-xl border border-navy-line text-sm text-navy bg-white focus:outline-none focus:border-amber">
          <option value="all">Everyone</option>
          {(d.employees || []).map((e: any) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>

        {loading ? <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-navy/30" /></div>
        : items.length === 0 ? <div className="bg-white rounded-2xl border border-navy-line p-12 text-center text-muted text-sm">Nothing here yet. Assign the first one.</div>
        : (
          <div className="grid gap-2">
            {items.map((x: any) => {
              const overdue = tab === "tasks" && !x.done && x.due_date && new Date(x.due_date) < today;
              return (
                <div key={x.id} className="bg-white rounded-xl border border-navy-line p-4 shadow-card flex items-start gap-3">
                  {tab === "tasks" && <input type="checkbox" checked={!!x.done} onChange={() => toggle(x)} className="w-4 h-4 accent-amber-deep mt-0.5 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm ${x.done ? "text-navy/40 line-through" : "text-navy"} ${tab === "notes" ? "whitespace-pre-wrap" : ""}`}>{tab === "tasks" ? x.title : x.body}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-[10px] text-muted flex items-center gap-1"><UserCheck className="w-3 h-3" /> {empName(x.employee_id)}</span>
                      {x.due_date && <span className={`text-[10px] ${overdue ? "text-red-600 font-semibold" : "text-muted"}`}>{overdue ? "Overdue · " : "Due "}{new Date(x.due_date).toLocaleDateString()}</span>}
                      {x.assigned_by === "admin" && <span className="text-[10px] bg-amber/10 text-amber-deep px-1.5 py-0.5 rounded">assigned by you</span>}
                    </div>
                  </div>
                  <button onClick={() => remove(x.id)} className="p-1.5 text-navy/30 hover:text-red-500 shrink-0"><Trash2 className="w-4 h-4" /></button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {modal && <AssignModal kind={tab} employees={d.employees} contacts={d.contacts} onClose={() => setModal(false)} onSaved={() => { setModal(false); toast("Assigned"); load(); }} />}
    </DashboardShell>
  );
}

function AssignModal({ kind, employees, contacts, onClose, onSaved }: { kind: "tasks" | "notes"; employees: any[]; contacts: any[]; onClose: () => void; onSaved: () => void }) {
  const [employeeId, setEmployeeId] = useState(employees?.[0]?.id || "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [contactId, setContactId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    setErr(""); setBusy(true);
    const res = await fetch("/api/admin-tasks", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: kind === "notes" ? "note" : "task", employeeId, title, body, dueDate: dueDate || null, contactId: contactId || null }),
    });
    if (res.ok) onSaved();
    else { const d = await res.json().catch(() => ({})); setErr(d.error || "Couldn't save."); setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="absolute inset-0 bg-navy/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-md p-5 animate-rise max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-navy">Assign {kind === "tasks" ? "a task" : "a note"}</h3>
          <button onClick={onClose} className="p-1.5 text-navy/40"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-xs text-muted mb-4">It appears in their portal like one of their own.</p>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-navy mb-1">For</label>
            <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="ainp">
              {employees.map((e: any) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          {kind === "tasks" ? (
            <>
              <input autoFocus value={title} onChange={(e) => { setTitle(e.target.value); setErr(""); }} placeholder="What needs doing?" className="ainp" />
              <div>
                <label className="block text-xs font-semibold text-navy mb-1">Due date (optional)</label>
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="ainp" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-navy mb-1">Link a contact (optional)</label>
                <select value={contactId} onChange={(e) => setContactId(e.target.value)} className="ainp">
                  <option value="">None</option>
                  {contacts.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </>
          ) : (
            <textarea autoFocus value={body} onChange={(e) => { setBody(e.target.value); setErr(""); }} rows={4} placeholder="Write the note…" className="ainp resize-none" />
          )}
          {err && <p className="text-sm text-red-600">{err}</p>}
          <button onClick={save} disabled={busy} className="w-full flex items-center justify-center gap-2 bg-navy text-white font-medium py-3 rounded-xl hover:bg-navy-soft disabled:opacity-60">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Assign
          </button>
        </div>
        <style jsx>{`.ainp{width:100%;padding:0.6rem 0.75rem;border:1px solid #E4E8F0;border-radius:0.75rem;font-size:0.875rem;color:#16233F;outline:none;background:#fff}.ainp:focus{border-color:#FF9E43}`}</style>
      </div>
    </div>
  );
}
