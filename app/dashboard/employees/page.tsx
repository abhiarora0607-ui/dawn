"use client";

import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { DashTopbar } from "@/components/DashTopbar";
import { useBrief } from "@/lib/use-brief";
import { ToastProvider, useToast, ConfirmDialog } from "@/components/Toast";
import { Loader2, Plus, X, Trash2, Users, Pencil } from "lucide-react";
import { useSettings } from "@/lib/use-settings";

type Employee = { id: string; name: string; status: string; monthly_salary: number };

function EmpModal({ emp, onClose, onSaved }: { emp: Employee | null; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [f, setF] = useState<any>(emp ? { name: emp.name, status: emp.status, monthlySalary: emp.monthly_salary, joiningDate: (emp as any).joining_date || "", phone: (emp as any).phone || "", role: (emp as any).role || "", email: (emp as any).email || "" } : { name: "", status: "active", monthlySalary: "", joiningDate: "", phone: "", role: "", email: "" });
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!f.name.trim()) { toast("Name is required.", "error"); return; }
    if (f.monthlySalary !== "" && Number(f.monthlySalary) < 0) { toast("Salary can't be negative.", "error"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/employees", {
        method: emp ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(emp ? { id: emp.id } : {}), name: f.name.trim(), status: f.status, monthlySalary: Number(f.monthlySalary) || 0, joiningDate: f.joiningDate || null, phone: f.phone, role: f.role, email: f.email }),
      });
      if (res.ok) { toast(emp ? "Employee updated" : "Employee added"); onSaved(); onClose(); }
      else { const d = await res.json(); toast(d.error || "Failed", "error"); }
    } catch { toast("Network error", "error"); }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="absolute inset-0 bg-navy/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-sm p-5 animate-rise">
        <div className="flex items-center justify-between mb-4"><h3 className="font-semibold text-navy">{emp ? "Edit employee" : "Add employee"}</h3><button onClick={onClose} className="p-1.5 text-navy/40"><X className="w-5 h-5" /></button></div>
        <div className="space-y-3">
          <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Name *" className="inp" />
          <div className="grid grid-cols-2 gap-2">
            <input value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} placeholder="Role (e.g. Sales)" className="inp" />
            <input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="Phone" className="inp" />
          </div>
          <input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="Email (optional)" className="inp" />
          <div>
            <label className="block text-sm font-semibold text-navy mb-1.5">Joining date</label>
            <input type="date" value={f.joiningDate} onChange={(e) => setF({ ...f, joiningDate: e.target.value })} className="inp" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-navy mb-1.5">Monthly salary</label>
            <input type="number" min="0" value={f.monthlySalary} onChange={(e) => setF({ ...f, monthlySalary: e.target.value })} placeholder="0" className="inp" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-navy mb-1.5">Status</label>
            <div className="flex gap-2">
              {["active", "inactive"].map((st) => (
                <button key={st} onClick={() => setF({ ...f, status: st })} className={`flex-1 py-2 rounded-lg text-sm font-medium border capitalize ${f.status === st ? "border-amber bg-amber/5 text-navy" : "border-navy-line text-muted"}`}>{st}</button>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted">While active, this salary is auto-added as a monthly expense. Marking inactive stops future salary expenses (past ones stay).</p>
          <button onClick={save} disabled={saving} className="w-full flex items-center justify-center gap-2 bg-navy text-white font-medium py-3 rounded-xl disabled:opacity-60">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null} {emp ? "Save" : "Add employee"}</button>
        </div>
        <style jsx>{`.inp{width:100%;padding:0.6rem 0.75rem;border:1px solid #E4E8F0;border-radius:0.75rem;font-size:0.875rem;color:#16233F;outline:none}.inp:focus{border-color:#FF9E43}`}</style>
      </div>
    </div>
  );
}

function EmployeesInner() {
  const { data } = useBrief();
  const { currency } = useSettings();
  const { toast } = useToast();
  const [emps, setEmps] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ open: boolean; emp: Employee | null }>({ open: false, emp: null });
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [pendingToggle, setPendingToggle] = useState<Employee | null>(null);

  function load() {
    setLoading(true);
    fetch("/api/employees").then((r) => r.json()).then((d) => { setEmps(d.employees || []); setLoading(false); }).catch(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  async function toggleStatus(emp: Employee) {
    await fetch("/api/employees", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: emp.id, status: emp.status === "active" ? "inactive" : "active" }) });
    toast(emp.status === "active" ? "Marked inactive — salary expenses stopped" : "Marked active — salary expenses resume"); setPendingToggle(null); load();
  }
  async function doDelete() {
    if (!confirmDel) return;
    await fetch(`/api/employees?id=${confirmDel}`, { method: "DELETE" });
    toast("Employee removed"); setConfirmDel(null); load();
  }

  return (
    <DashboardShell>
      <DashTopbar account={data?.account} pageTitle="Employees" />
      <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div><h1 className="font-display font-semibold text-2xl text-navy">Employees</h1><p className="text-muted text-sm mt-1">Your team. Active salaries auto-post as monthly expenses.</p></div>
          <button onClick={() => setModal({ open: true, emp: null })} className="flex items-center gap-2 bg-navy text-white font-medium px-4 py-2 rounded-xl hover:bg-navy-soft shrink-0"><Plus className="w-4 h-4" /> <span className="hidden sm:inline">Add</span></button>
        </div>

        {loading ? (
          <div className="p-12 flex items-center justify-center text-muted"><Loader2 className="w-6 h-6 animate-spin mr-3" /> Loading…</div>
        ) : emps.length === 0 ? (
          <div className="bg-white rounded-2xl border border-navy-line p-12 text-center shadow-card">
            <div className="w-14 h-14 rounded-2xl bg-amber/15 flex items-center justify-center mx-auto mb-4"><Users className="w-7 h-7 text-amber-deep" /></div>
            <h2 className="text-lg font-semibold text-navy mb-2">No employees yet</h2>
            <p className="text-muted text-sm max-w-sm mx-auto mb-5">Add your team members. Their salaries become automatic monthly expenses while active.</p>
            <button onClick={() => setModal({ open: true, emp: null })} className="inline-flex items-center gap-2 bg-navy text-white font-medium px-5 py-2.5 rounded-xl"><Plus className="w-4 h-4" /> Add your first employee</button>
          </div>
        ) : (
          <div className="grid gap-2">
            {emps.map((e) => (
              <div key={e.id} className="bg-white rounded-xl border border-navy-line p-4 shadow-card flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-navy text-sm">{e.name}</p>
                  <p className="text-xs text-muted">{currency}{e.monthly_salary}/mo</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => setPendingToggle(e)} className={`text-[10px] font-bold uppercase px-2 py-1 rounded ${e.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-navy/5 text-navy/50"}`}>{e.status}</button>
                  <button onClick={() => setModal({ open: true, emp: e })} className="p-1.5 text-navy/40 hover:text-navy"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => setConfirmDel(e.id)} className="p-1.5 text-navy/40 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {modal.open && <EmpModal emp={modal.emp} onClose={() => setModal({ open: false, emp: null })} onSaved={load} />}
      <ConfirmDialog open={!!confirmDel} title="Remove this employee?" body="Their past salary expenses stay; future ones stop." confirmLabel="Remove" onConfirm={doDelete} onCancel={() => setConfirmDel(null)} />
      <ConfirmDialog open={!!pendingToggle} title={pendingToggle?.status === "active" ? "Mark inactive?" : "Mark active?"} body={pendingToggle?.status === "active" ? "Future monthly salary expenses will stop. Past ones stay." : "Monthly salary will resume as an expense while active."} confirmLabel="Confirm" onConfirm={() => pendingToggle && toggleStatus(pendingToggle)} onCancel={() => setPendingToggle(null)} />
    </DashboardShell>
  );
}

export default function Employees() {
  return <ToastProvider><EmployeesInner /></ToastProvider>;
}
