"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/DashboardShell";
import { DashTopbar } from "@/components/DashTopbar";
import { useBrief } from "@/lib/use-brief";
import { ToastProvider, useToast, ConfirmDialog } from "@/components/Toast";
import { Loader2, Plus, X, Trash2, Users, Pencil, KeyRound, CalendarClock } from "lucide-react";
import { TeamAccessModal } from "@/components/TeamAccessModal";
import { useSettings } from "@/lib/use-settings";

type Employee = {
  id: string; name: string; status: string; monthly_salary: number; is_owner?: boolean;
  role?: string; phone?: string; email?: string; joining_date?: string;
  // V31a attendance fields
  shift_start?: string | null; shift_end?: string | null;
  required_hours?: number | null; weekly_offs?: number[] | null;
  remote_permanent?: boolean; attendance_exempt?: boolean;
  date_of_birth?: string | null; extra_regularizations?: number;
};

function EmpModal({ emp, onClose, onSaved }: { emp: Employee | null; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [f, setF] = useState<any>(emp ? { name: emp.name, status: emp.status, monthlySalary: emp.monthly_salary, joiningDate: (emp as any).joining_date || "", phone: (emp as any).phone || "", role: (emp as any).role || "", email: (emp as any).email || "",
        shiftStart: (emp as any).shift_start?.slice(0, 5) || "", shiftEnd: (emp as any).shift_end?.slice(0, 5) || "",
        requiredHours: (emp as any).required_hours ?? "", weeklyOffs: (emp as any).weekly_offs || null,
        remotePermanent: !!(emp as any).remote_permanent, attendanceExempt: !!(emp as any).attendance_exempt,
        dateOfBirth: (emp as any).date_of_birth || "", extraRegularizations: (emp as any).extra_regularizations ?? 0 }
      : { name: "", status: "active", monthlySalary: "", joiningDate: "", phone: "", role: "", email: "",
        shiftStart: "", shiftEnd: "", requiredHours: "", weeklyOffs: null, remotePermanent: false,
        attendanceExempt: false, dateOfBirth: "", extraRegularizations: 0 });
  const [showAtt, setShowAtt] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!f.name.trim()) { toast("Name is required.", "error"); return; }
    if (f.monthlySalary !== "" && Number(f.monthlySalary) < 0) { toast("Salary can't be negative.", "error"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/employees", {
        method: emp ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(emp ? { id: emp.id } : {}), name: f.name.trim(), status: f.status, monthlySalary: Number(f.monthlySalary) || 0, joiningDate: f.joiningDate || null, phone: f.phone, role: f.role, email: f.email,
          shiftStart: f.shiftStart || null, shiftEnd: f.shiftEnd || null,
          requiredHours: f.requiredHours === "" ? null : Number(f.requiredHours),
          weeklyOffs: f.weeklyOffs, remotePermanent: !!f.remotePermanent,
          attendanceExempt: !!f.attendanceExempt, dateOfBirth: f.dateOfBirth || null,
          extraRegularizations: Number(f.extraRegularizations) || 0 }),
      });
      if (res.ok) { toast(emp ? "Employee updated" : "Employee added"); onSaved(); onClose(); }
      else { const d = await res.json(); toast(d.error || "Failed", "error"); }
    } catch { toast("Network error", "error"); }
    setSaving(false);
  }

  return (
    <div className="dawn-scrim" onClick={onClose}>
      <div className="dawn-sheet relative" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4"><h3 className="font-semibold text-navy">{emp ? "Edit employee" : "Add employee"}</h3><button onClick={onClose} className="btn-icon -mr-2" aria-label="Close"><X className="w-5 h-5" /></button></div>
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
          {/* Attendance rules — collapsed, because most people just need a name and a salary */}
          <div className="border-t border-navy-line pt-3">
            <button onClick={() => setShowAtt(!showAtt)} className="flex items-center justify-between w-full text-sm font-semibold text-navy">
              <span className="flex items-center gap-1.5"><CalendarClock className="w-4 h-4 text-amber-deep" /> Attendance rules</span>
              <span className="text-xs text-muted font-normal">{showAtt ? "Hide" : "Optional"}</span>
            </button>
            {showAtt && (
              <div className="space-y-3 mt-3">
                <div className="grid grid-cols-2 gap-2">
                  <label className="block"><span className="text-xs text-muted">Shift starts</span><input type="time" value={f.shiftStart} onChange={(e) => setF({ ...f, shiftStart: e.target.value })} className="inp mt-1" /></label>
                  <label className="block"><span className="text-xs text-muted">Shift ends</span><input type="time" value={f.shiftEnd} onChange={(e) => setF({ ...f, shiftEnd: e.target.value })} className="inp mt-1" /></label>
                </div>
                <p className="text-[12px] text-muted -mt-1">Leave blank if hours are flexible — nobody is marked late without a shift.</p>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block"><span className="text-xs text-muted">Required hours/day</span><input type="number" step="0.5" min="1" max="24" value={f.requiredHours} onChange={(e) => setF({ ...f, requiredHours: e.target.value })} placeholder="Business default" className="inp mt-1" /></label>
                  <label className="block"><span className="text-xs text-muted">Extra fix requests/mo</span><input type="number" min="0" max="20" value={f.extraRegularizations} onChange={(e) => setF({ ...f, extraRegularizations: e.target.value })} className="inp mt-1" /></label>
                </div>
                <div>
                  <span className="text-xs text-muted">Weekly off</span>
                  <div className="flex gap-1 mt-1.5">
                    {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => {
                      const cur: number[] = f.weeklyOffs || [];
                      const on = cur.includes(i);
                      return (
                        <button key={i} onClick={() => setF({ ...f, weeklyOffs: on ? cur.filter((x: number) => x !== i) : [...cur, i] })}
                          className={`w-8 h-8 rounded-lg text-xs font-semibold border ${on ? "bg-navy text-white border-navy" : "border-navy-line text-navy/50"}`}>{d}</button>
                      );
                    })}
                  </div>
                  <p className="text-[12px] text-muted mt-1">{f.weeklyOffs ? "Overrides the business default." : "Using the business default."}</p>
                </div>
                <label className="block"><span className="text-xs text-muted">Date of birth (for birthday leave)</span><input type="date" value={f.dateOfBirth} onChange={(e) => setF({ ...f, dateOfBirth: e.target.value })} className="inp mt-1" /></label>
                <label className="flex items-start gap-2 text-sm text-navy">
                  <input type="checkbox" checked={!!f.remotePermanent} onChange={(e) => setF({ ...f, remotePermanent: e.target.checked })} className="mt-0.5" />
                  <span>Works remotely — <span className="text-muted text-xs">can mark attendance from anywhere</span></span>
                </label>
                <label className="flex items-start gap-2 text-sm text-navy">
                  <input type="checkbox" checked={!!f.attendanceExempt} onChange={(e) => setF({ ...f, attendanceExempt: e.target.checked })} className="mt-0.5" />
                  <span>Doesn&apos;t mark attendance — <span className="text-muted text-xs">no punch in/out at all</span></span>
                </label>
              </div>
            )}
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
  const [accessEmp, setAccessEmp] = useState<Employee | null>(null);
  const [todayById, setTodayById] = useState<Record<string, any>>({});

  function load() {
    setLoading(true);
    fetch("/api/employees").then((r) => r.json()).then((d) => { setEmps(d.employees || []); setLoading(false); }).catch(() => setLoading(false));
    // Today's attendance, so each card shows where that person actually is.
    fetch("/api/attendance?view=today").then((r) => r.json()).then((d) => {
      const map: Record<string, any> = {};
      for (const r of d.rows || []) map[r.id] = r;
      setTodayById(map);
    }).catch(() => {});
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
      <div className="w-full max-w-[1400px] mx-auto px-5 sm:px-8 lg:px-10 py-6 sm:py-8 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div><h1 className="font-display font-semibold text-2xl text-navy">Employees</h1><p className="text-muted text-sm mt-1">Your team. Active salaries auto-post as monthly expenses. Use <span className="font-medium text-navy/70">Login</span> on any row to give someone their own staff portal sign-in.</p></div>
          <button onClick={() => setModal({ open: true, emp: null })} className="flex items-center gap-2 bg-navy text-white font-medium px-4 py-2 rounded-xl hover:bg-navy-soft shrink-0"><Plus className="w-4 h-4" /> <span className="hidden sm:inline">Add</span></button>
        </div>

        {loading ? (
          <div className="p-12 flex items-center justify-center text-muted"><Loader2 className="w-6 h-6 animate-spin mr-3" /> Loading…</div>
        ) : false ? (
          <div className="bg-white rounded-2xl border border-navy-line p-12 text-center shadow-card">
            <div className="w-14 h-14 rounded-2xl bg-amber/15 flex items-center justify-center mx-auto mb-4"><Users className="w-7 h-7 text-amber-deep" /></div>
            <h2 className="text-lg font-semibold text-navy mb-2">No employees yet</h2>
            <p className="text-muted text-sm max-w-sm mx-auto mb-5">Add your team members. Their salaries become automatic monthly expenses while active.</p>
            <button onClick={() => setModal({ open: true, emp: null })} className="inline-flex items-center gap-2 bg-navy text-white font-medium px-5 py-2.5 rounded-xl"><Plus className="w-4 h-4" /> Add your first employee</button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {emps.map((e) => {
              const att = todayById[e.id];
              return (
              <div key={e.id} className={`dawn-card p-4 ${e.is_owner ? "border-amber/40" : ""}`}>
                {/* who */}
                <div className="flex items-start gap-3 mb-3.5">
                  <Avatar name={e.name} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/dashboard/employees/${e.id}`} className="font-semibold text-navy hover:text-amber-deep block truncate">{e.name}</Link>
                    <p className="text-xs text-muted truncate">
                      {e.role || "Team member"}
                      {e.is_owner ? " · You" : e.status === "active" ? " · Active" : " · Inactive"}
                    </p>
                  </div>
                  {e.remote_permanent && <span className="text-[12px] font-bold uppercase bg-sky-50 text-sky-600 border border-sky-200 px-1.5 py-0.5 rounded shrink-0">Remote</span>}
                </div>

                {/* what */}
                <div className="space-y-1.5 text-sm">
                  {!e.is_owner && <Row label="Salary" value={`${currency}${Number(e.monthly_salary || 0).toLocaleString()}/mo`} />}
                  {e.phone && <Row label="Phone" value={e.phone} />}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted text-[13px]">Today</span>
                    {e.attendance_exempt ? (
                      <span className="text-[12px] text-navy/30">Not tracked</span>
                    ) : (
                      <AttendancePill att={att} />
                    )}
                  </div>
                  {e.joining_date && <Row label="Since" value={new Date(e.joining_date).toLocaleDateString()} />}
                </div>

                {/* do */}
                <div className="flex items-center gap-1.5 mt-4 pt-3 border-t border-navy-line/60">
                  {!e.is_owner && (
                    <button onClick={() => setAccessEmp(e)} className="flex items-center gap-1.5 text-xs font-medium text-navy/60 border border-navy-line px-2.5 py-1.5 rounded-lg hover:text-amber-deep hover:border-amber/40" title="Create or reset this person's portal login">
                      <KeyRound className="w-3.5 h-3.5" /> Login
                    </button>
                  )}
                  <button onClick={() => setModal({ open: true, emp: e })} className="flex items-center gap-1.5 text-xs font-medium text-navy/60 border border-navy-line px-2.5 py-1.5 rounded-lg hover:text-navy">
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </button>
                  <Link href={`/dashboard/attendance?emp=${e.id}`} className="flex items-center gap-1.5 text-xs font-medium text-navy/60 border border-navy-line px-2.5 py-1.5 rounded-lg hover:text-navy">
                    <CalendarClock className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Attendance</span>
                  </Link>
                  {!e.is_owner && (
                    <button onClick={() => setConfirmDel(e.id)} className="ml-auto p-1.5 text-navy/30 hover:text-red-500" title="Remove"><Trash2 className="w-4 h-4" /></button>
                  )}
                </div>
              </div>
              );
            })}
            {emps.filter((e) => !e.is_owner).length === 0 && (
              <div className="bg-white rounded-2xl border border-dashed border-navy-line p-8 text-center">
                <div className="w-12 h-12 rounded-2xl bg-amber/15 flex items-center justify-center mx-auto mb-3"><Users className="w-6 h-6 text-amber-deep" /></div>
                <p className="font-semibold text-navy text-sm mb-1">Working solo?</p>
                <p className="text-muted text-xs max-w-sm mx-auto mb-4">Everything is assigned to you by default. Add team members and their salaries become automatic monthly expenses while they&apos;re active.</p>
                <button onClick={() => setModal({ open: true, emp: null })} className="inline-flex items-center gap-2 bg-navy text-white font-medium px-5 py-2.5 rounded-xl text-sm"><Plus className="w-4 h-4" /> Add an employee</button>
              </div>
            )}
          </div>
        )}
      </div>
      {modal.open && <EmpModal emp={modal.emp} onClose={() => setModal({ open: false, emp: null })} onSaved={load} />}
      <ConfirmDialog open={!!confirmDel} title="Remove this employee?" body="Their past salary expenses stay; future ones stop." confirmLabel="Remove" onConfirm={doDelete} onCancel={() => setConfirmDel(null)} />
      {accessEmp && <TeamAccessModal employee={accessEmp} onClose={() => setAccessEmp(null)} />}
      <ConfirmDialog open={!!pendingToggle} title={pendingToggle?.status === "active" ? "Mark inactive?" : "Mark active?"} body={pendingToggle?.status === "active" ? "Future monthly salary expenses will stop. Past ones stay." : "Monthly salary will resume as an expense while active."} confirmLabel="Confirm" onConfirm={() => pendingToggle && toggleStatus(pendingToggle)} onCancel={() => setPendingToggle(null)} />
    </DashboardShell>
  );
}

export default function Employees() {
  return <ToastProvider><EmployeesInner /></ToastProvider>;
}


// Initial-circle avatar. Colour is derived from the name so the same person is
// always the same colour — recognisable at a glance without storing anything.
const AVATAR_TONES = [
  "bg-amber/20 text-amber-deep",
  "bg-emerald-100 text-emerald-700",
  "bg-sky-100 text-sky-700",
  "bg-violet-100 text-violet-700",
  "bg-rose-100 text-rose-700",
  "bg-navy/10 text-navy",
];

function Avatar({ name }: { name?: string }) {
  const clean = (name || "?").trim();
  const initials = clean.split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase() || "?";
  let h = 0;
  for (let i = 0; i < clean.length; i++) h = (h * 31 + clean.charCodeAt(i)) >>> 0;
  return (
    <span className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${AVATAR_TONES[h % AVATAR_TONES.length]}`}>
      {initials}
    </span>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted text-[13px]">{label}</span>
      <span className="font-medium text-navy text-[13px] truncate">{value}</span>
    </div>
  );
}

// Today's status, as a word. "Present" isn't enough on its own — an owner
// wants to know whether someone is still on shift and how long they've done.
function AttendancePill({ att }: { att?: any }) {
  if (!att) return <span className="text-[12px] text-navy/30">—</span>;
  const map: Record<string, { label: string; cls: string }> = {
    full: { label: "Present", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    half: { label: att.onShift ? "On shift" : "Half day", cls: "bg-amber/15 text-amber-deep border-amber/30" },
    absent: { label: "Absent", cls: "bg-red-50 text-red-600 border-red-200" },
    weekly_off: { label: "Weekly off", cls: "bg-slate-100 text-slate-500 border-slate-200" },
    holiday: { label: "Holiday", cls: "bg-sky-50 text-sky-600 border-sky-200" },
    leave: { label: "Leave", cls: "bg-sky-50 text-sky-600 border-sky-200" },
    missing_punch_out: { label: "No punch-out", cls: "bg-amber/15 text-amber-deep border-amber/30" },
    not_joined: { label: "—", cls: "bg-slate-100 text-slate-400 border-slate-200" },
  };
  const m = map[att.classification] || map.absent;
  return (
    <span className="flex items-center gap-1.5">
      {att.flagged && <span className="w-1.5 h-1.5 rounded-full bg-amber-deep" title={att.flagReason || "Needs a look"} />}
      <span className={`text-[12px] font-bold uppercase tracking-wide px-2 py-0.5 rounded border ${m.cls}`}>{m.label}</span>
    </span>
  );
}
