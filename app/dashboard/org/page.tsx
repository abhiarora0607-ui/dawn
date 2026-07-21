"use client";

// Organisation — the chart, departments, and who reports to whom.
//
// The page adapts to the size of the business. A two-person shop sees a short
// explanation and nothing else; the tree and departments appear once there are
// enough people for them to mean anything. Same code, same schema.

import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { DashTopbar } from "@/components/DashTopbar";
import { ToastProvider, useToast } from "@/components/Toast";
import { OrgTree } from "@/components/OrgTree";
import { Loader2, Network, Building2, Plus, Trash2, Users } from "lucide-react";

export default function OrgPage() {
  return (
    <ToastProvider>
      <DashboardShell>
        <DashTopbar pageTitle="Organisation" />
        <Inner />
      </DashboardShell>
    </ToastProvider>
  );
}

function Inner() {
  const [tab, setTab] = useState<"tree" | "reporting" | "departments">("tree");
  const [d, setD] = useState<any>(null);

  function load() { fetch("/api/org").then((r) => r.json()).then(setD).catch(() => {}); }
  useEffect(() => { load(); }, []);

  if (!d) return <div className="py-20 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-navy/30" /></div>;

  const tiny = !d.complexity?.showOrgTree;

  return (
    <div className="dawn-page space-y-5">
      <div>
        <h1 className="font-display font-semibold t-display text-navy">Organisation</h1>
        <p className="text-muted text-sm mt-1">Who works where, and who they report to.</p>
      </div>

      {tiny ? (
        // Below three people a hierarchy is noise. Say so plainly rather than
        // showing an empty chart.
        <div className="dawn-card p-6 text-center">
          <span className="w-12 h-12 rounded-2xl bg-surface flex items-center justify-center mx-auto mb-3">
            <Network className="w-6 h-6 text-navy/30" />
          </span>
          <p className="font-semibold text-navy">Your team is small enough not to need this yet</p>
          <p className="text-sm text-muted mt-1 max-w-md mx-auto">
            Reporting lines and departments start to help at around three people. Add a few more and this page fills in on its own.
          </p>
        </div>
      ) : (
        <>
          <div className="flex gap-1 border-b border-navy-line overflow-x-auto">
            {([["tree", "Chart", Network], ["reporting", "Reporting lines", Users], ["departments", "Departments", Building2]] as const)
              .filter(([id]) => id !== "departments" || d.complexity?.showDepartments)
              .map(([id, label, Icon]) => (
                <button key={id} onClick={() => setTab(id as any)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${tab === id ? "border-amber-deep text-navy" : "border-transparent text-muted hover:text-navy"}`}>
                  <Icon className="w-4 h-4" /> {label}
                </button>
              ))}
          </div>

          {tab === "tree" && <OrgTree nodes={d.nodes} roots={d.roots} />}
          {tab === "reporting" && <Reporting d={d} onChange={load} />}
          {tab === "departments" && <Departments onChange={load} />}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------- reporting lines */

function Reporting({ d, onChange }: { d: any; onChange: () => void }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState("");

  async function setManager(employeeId: string, managerId: string) {
    setBusy(employeeId);
    const res = await fetch("/api/org", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_manager", employeeId, managerId: managerId || null }),
    });
    const out = await res.json();
    setBusy("");
    if (out.ok) { toast("Saved"); onChange(); } else toast(out.error || "Couldn't save", "error");
  }

  return (
    <div className="dawn-card divide-y divide-navy-line/40">
      {d.nodes.map((n: any) => (
        <div key={n.id} className="flex items-center justify-between gap-3 px-4 py-3 flex-wrap">
          <div className="min-w-0">
            <p className="font-medium text-navy truncate">{n.name}</p>
            <p className="t-micro text-muted truncate">
              {n.jobTitle || n.roleLabel}
              {n.directReports > 0 && ` · ${n.directReports} ${n.directReports === 1 ? "report" : "reports"}`}
            </p>
          </div>
          <label className="flex items-center gap-2 shrink-0">
            <span className="t-micro text-muted">Reports to</span>
            <select
              className="inp w-48"
              defaultValue={n.reportsTo || ""}
              disabled={busy === n.id || n.role === "owner"}
              onChange={(e) => setManager(n.id, e.target.value)}>
              <option value="">— nobody —</option>
              {d.nodes.filter((o: any) => o.id !== n.id).map((o: any) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
            {busy === n.id && <Loader2 className="w-4 h-4 animate-spin text-navy/30" />}
          </label>
        </div>
      ))}
      <p className="t-micro text-muted px-4 py-3">
        A manager sees everything for the people beneath them — at every level, not just their direct reports. Salary is the exception and stays with admins.
      </p>
    </div>
  );
}

/* ----------------------------------------------------------- departments */

function Departments({ onChange }: { onChange: () => void }) {
  const { toast } = useToast();
  const [d, setD] = useState<any>(null);
  const [people, setPeople] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  function load() { fetch("/api/org?view=departments").then((r) => r.json()).then(setD).catch(() => {}); }
  useEffect(() => {
    load();
    fetch("/api/org").then((r) => r.json()).then((x) => setPeople(x.nodes || [])).catch(() => {});
  }, []);

  async function setHead(id: string, headId: string) {
    const res = await fetch("/api/org", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "dept_update", id, headId: headId || null }),
    });
    const out = await res.json();
    if (out.ok) { load(); onChange(); toast(headId ? "Head set" : "Head removed"); }
    else toast(out.error || "Couldn't save", "error");
  }

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    const res = await fetch("/api/org", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "dept_create", name }),
    });
    const out = await res.json();
    setBusy(false);
    if (out.ok) { setName(""); load(); onChange(); toast("Department added"); }
    else toast(out.error || "Couldn't add that", "error");
  }

  async function remove(id: string) {
    await fetch("/api/org", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "dept_delete", id }),
    });
    load(); onChange(); toast("Removed — nobody was deleted, they're just unassigned");
  }

  if (!d) return <div className="py-12 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-navy/30" /></div>;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="dawn-card p-5">
        <p className="font-semibold text-navy text-sm">Add a department</p>
        <div className="flex gap-2 mt-2">
          <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()}
            placeholder="Sales, Operations, Finance…" className="inp flex-1" />
          <button onClick={create} disabled={busy || !name.trim()} className="btn btn-primary">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add
          </button>
        </div>
      </div>

      {d.departments?.length === 0 ? (
        <p className="dawn-empty">No departments yet. They&apos;re optional — most businesses only need them past about ten people.</p>
      ) : (
        <div className="dawn-card divide-y divide-navy-line/40">
          {d.departments.map((dep: any) => (
            <div key={dep.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-navy truncate">{dep.name}</p>
                <p className="t-micro text-muted">
                  {dep.memberCount} {dep.memberCount === 1 ? "person" : "people"}
                </p>
                <label className="flex items-center gap-2 mt-1.5">
                  <span className="t-micro text-muted shrink-0">Head</span>
                  <select className="inp py-1 text-sm" defaultValue={dep.head_employee_id || ""}
                    onChange={(e) => setHead(dep.id, e.target.value)}>
                    <option value="">— nobody —</option>
                    {people.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
              </div>
              <button onClick={() => remove(dep.id)} className="btn-icon text-navy/40 hover:text-red-500" aria-label="Delete">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
