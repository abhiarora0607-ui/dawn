"use client";

// Leave, for the owner. Four tabs matching the four questions:
//   Requests  — who wants time off?
//   Balances  — what does everyone have left?
//   Encashment— who wants paying for unused days?
//   Policy    — how much does each type give, and what happens at year end?

import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { DashTopbar } from "@/components/DashTopbar";
import { ToastProvider, useToast } from "@/components/Toast";
import {
  Loader2, Check, X, Inbox, Users, Wallet, SlidersHorizontal, AlertTriangle,
} from "lucide-react";

const TABS = [
  { id: "requests", label: "Requests", icon: Inbox },
  { id: "balances", label: "Balances", icon: Users },
  { id: "encash", label: "Encashment", icon: Wallet },
  { id: "policy", label: "Policy", icon: SlidersHorizontal },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default function LeavePage() {
  return (
    <ToastProvider>
      <DashboardShell>
        <DashTopbar pageTitle="Leave" />
        <Inner />
      </DashboardShell>
    </ToastProvider>
  );
}

function Inner() {
  const [tab, setTab] = useState<TabId>("requests");
  const [pending, setPending] = useState(0);

  useEffect(() => {
    fetch("/api/leave?status=pending").then((r) => r.json()).then((d) => setPending(d.pendingCount || 0)).catch(() => {});
  }, [tab]);

  return (
    <div className="dawn-page space-y-5">
      <div>
        <h1 className="font-display font-semibold text-2xl text-navy">Leave</h1>
        <p className="text-muted text-sm mt-1">Time off, balances, and what your business offers.</p>
      </div>

      <div className="flex gap-1 border-b border-navy-line overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${tab === t.id ? "border-amber-deep text-navy" : "border-transparent text-muted hover:text-navy"}`}>
            <t.icon className="w-4 h-4" /> {t.label}
            {t.id === "requests" && pending > 0 && <span className="text-[12px] font-bold bg-amber text-navy px-1.5 py-0.5 rounded-full">{pending}</span>}
          </button>
        ))}
      </div>

      {tab === "requests" && <Requests onChange={() => setPending((p) => Math.max(0, p - 1))} />}
      {tab === "balances" && <BalancesTab />}
      {tab === "encash" && <EncashTab />}
      {tab === "policy" && <PolicyTab />}
    </div>
  );
}

/* -------------------------------------------------------------- requests */

function Requests({ onChange }: { onChange: () => void }) {
  const { toast } = useToast();
  const [d, setD] = useState<any>(null);
  const [status, setStatus] = useState("pending");
  const [busy, setBusy] = useState("");

  function load() { setD(null); fetch(`/api/leave?status=${status}`).then((r) => r.json()).then(setD).catch(() => {}); }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [status]);

  async function decide(id: string, action: "approve" | "reject") {
    setBusy(id);
    const res = await fetch("/api/leave", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action }) });
    const out = await res.json();
    setBusy("");
    if (out.ok) { toast(out.note || (action === "approve" ? "Approved" : "Rejected")); onChange(); load(); }
    else toast(out.error || "Couldn't do that", "error");
  }

  return (
    <>
      <div className="flex gap-1.5">
        {["pending", "approved", "rejected", "all"].map((s) => (
          <button key={s} onClick={() => setStatus(s)}
            className={`text-xs font-medium px-3 py-1.5 rounded-full border capitalize ${status === s ? "bg-navy text-white border-navy" : "text-navy/60 border-navy-line"}`}>{s}</button>
        ))}
      </div>

      {!d ? <Loading /> : d.requests?.length === 0 ? (
        <Empty>{status === "pending" ? "No leave requests waiting." : `No ${status} requests.`}</Empty>
      ) : (
        <div className="space-y-2">
          {d.requests.map((r: any) => (
            <div key={r.id} className="dawn-card p-4 flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="font-semibold text-navy">
                  {r.employee_name}
                  <span className="font-normal text-muted"> · {r.label} · {r.days} {r.days === 1 ? "day" : "days"}</span>
                </p>
                <p className="text-sm text-navy/70 mt-0.5">
                  {new Date(r.from_date).toLocaleDateString()}
                  {r.to_date !== r.from_date && ` – ${new Date(r.to_date).toLocaleDateString()}`}
                  {r.half_day && " · half day"}
                </p>
                {r.reason && <p className="text-sm text-muted mt-1">&ldquo;{r.reason}&rdquo;</p>}
                {r.is_unpaid_fallback && (
                  <p className="text-xs text-amber-deep mt-1.5 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" /> Their balance won&apos;t cover all of this — the rest will be unpaid.
                  </p>
                )}
                <p className="text-[12px] text-muted mt-1.5">Asked {new Date(r.created_at).toLocaleDateString()}</p>
              </div>
              {r.status === "pending" ? (
                <div className="flex items-center gap-2 shrink-0">
                  <button disabled={!!busy} onClick={() => decide(r.id, "approve")} className="flex items-center gap-1.5 text-sm font-medium bg-navy text-white px-3 py-2 rounded-xl disabled:opacity-50">
                    {busy === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Approve
                  </button>
                  <button disabled={!!busy} onClick={() => decide(r.id, "reject")} className="flex items-center gap-1.5 text-sm font-medium text-navy/60 border border-navy-line px-3 py-2 rounded-xl disabled:opacity-50">
                    <X className="w-4 h-4" /> Reject
                  </button>
                </div>
              ) : (
                <span className={`text-[12px] font-bold uppercase px-2 py-1 rounded shrink-0 ${
                  r.status === "approved" ? "bg-emerald-50 text-emerald-700"
                  : r.status === "rejected" ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-500"}`}>{r.status}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* -------------------------------------------------------------- balances */

function BalancesTab() {
  const [d, setD] = useState<any>(null);
  useEffect(() => { fetch("/api/leave?view=balances").then((r) => r.json()).then(setD).catch(() => {}); }, []);
  if (!d) return <Loading />;
  if (!d.rows?.length) return <Empty>No employees yet.</Empty>;

  return (
    <div className="dawn-card dawn-table-wrap">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-navy-line">
            <th className="text-left px-4 py-2.5 font-semibold text-navy sticky-col">Employee</th>
            {d.types.map((t: any) => (
              <th key={t.code} className="px-3 py-2.5 text-right font-medium text-muted text-xs whitespace-nowrap">{t.label.replace(" Leave", "")}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {d.rows.map((r: any) => (
            <tr key={r.id} className="border-b border-navy-line/40 last:border-0">
              <td className="px-4 py-2.5 sticky-col">
                <span className="font-medium text-navy">{r.name}</span>
                {r.role && <span className="text-xs text-muted block">{r.role}</span>}
              </td>
              {d.types.map((t: any) => {
                const b = r.balances.find((x: any) => x.code === t.code);
                if (!b) return <td key={t.code} className="px-3 py-2.5 text-right text-navy/25">—</td>;
                return (
                  <td key={t.code} className="px-3 py-2.5 text-right">
                    <span className={`font-semibold ${b.infinite ? "text-navy/40" : b.available === 0 ? "text-navy/30" : "text-navy"}`}>
                      {b.infinite ? "∞" : b.available}
                    </span>
                    {b.carried_in > 0 && <span className="text-[12px] text-sky-600 block">+{b.carried_in} carried</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[12px] text-muted px-4 py-3 border-t border-navy-line">Balances for {d.year}. Carried-over days are shown separately.</p>
    </div>
  );
}

/* ---------------------------------------------------------------- encash */

function EncashTab() {
  const { toast } = useToast();
  const [d, setD] = useState<any>(null);
  const [busy, setBusy] = useState("");

  function load() { setD(null); fetch("/api/leave?view=encashments").then((r) => r.json()).then(setD).catch(() => {}); }
  useEffect(() => { load(); }, []);

  async function decide(id: string, action: "encash_approve" | "encash_reject") {
    setBusy(id);
    const res = await fetch("/api/leave", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action }) });
    const out = await res.json();
    setBusy("");
    if (out.ok) { toast(out.note || "Done"); load(); } else toast(out.error || "Couldn't do that", "error");
  }

  if (!d) return <Loading />;
  if (!d.encashments?.length) return <Empty>Nobody has asked to cash in leave.</Empty>;

  return (
    <>
      <p className="text-xs text-muted">
        Approving adds the amount to that person&apos;s next monthly salary expense — one line, so you never double-pay.
      </p>
      <div className="space-y-2">
        {d.encashments.map((r: any) => (
          <div key={r.id} className="dawn-card p-4 flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <p className="font-semibold text-navy">
                {r.employee_name}
                <span className="font-normal text-muted"> · {r.days} {r.days === 1 ? "day" : "days"} of {r.label}</span>
              </p>
              {r.amount ? <p className="text-sm text-navy mt-0.5">₹{Number(r.amount).toLocaleString()}</p> : null}
              {r.note && <p className="text-sm text-muted mt-1">&ldquo;{r.note}&rdquo;</p>}
              <p className="text-[12px] text-muted mt-1.5">
                Asked {new Date(r.created_at).toLocaleDateString()}
                {r.paid_in_month && ` · paid in ${r.paid_in_month}`}
              </p>
            </div>
            {r.status === "pending" ? (
              <div className="flex items-center gap-2 shrink-0">
                <button disabled={!!busy} onClick={() => decide(r.id, "encash_approve")} className="flex items-center gap-1.5 text-sm font-medium bg-navy text-white px-3 py-2 rounded-xl disabled:opacity-50">
                  {busy === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Approve
                </button>
                <button disabled={!!busy} onClick={() => decide(r.id, "encash_reject")} className="flex items-center gap-1.5 text-sm font-medium text-navy/60 border border-navy-line px-3 py-2 rounded-xl disabled:opacity-50">
                  <X className="w-4 h-4" /> Reject
                </button>
              </div>
            ) : (
              <span className={`text-[12px] font-bold uppercase px-2 py-1 rounded shrink-0 ${
                r.status === "paid" ? "bg-emerald-50 text-emerald-700"
                : r.status === "approved" ? "bg-sky-50 text-sky-600"
                : "bg-slate-100 text-slate-500"}`}>
                {r.status === "approved" ? "next salary" : r.status}
              </span>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- policy */

function PolicyTab() {
  const { toast } = useToast();
  const [d, setD] = useState<any>(null);
  const [caps, setCaps] = useState<any>(null);
  const [saving, setSaving] = useState("");

  function load() {
    fetch("/api/leave/settings").then((r) => r.json()).then((x) => { setD(x); setCaps(x.caps); }).catch(() => {});
  }
  useEffect(() => { load(); }, []);

  async function saveType(t: any, patch: any) {
    setSaving(t.code);
    const res = await fetch("/api/leave/settings", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: t.code, ...patch }),
    });
    const out = await res.json();
    setSaving("");
    if (out.ok) { load(); } else toast(out.error || "Couldn't save", "error");
  }
  async function saveCaps() {
    setSaving("caps");
    await fetch("/api/leave/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "caps", ...caps }) });
    setSaving(""); toast("Saved"); load();
  }

  if (!d || !caps) return <Loading />;

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="dawn-card p-5 space-y-3">
        <label className="flex items-center gap-2 text-sm font-medium text-navy">
          <input type="checkbox" checked={caps.leave_enabled !== false} onChange={(e) => setCaps({ ...caps, leave_enabled: e.target.checked })} />
          Leave is switched on for this business
        </label>
        <p className="font-semibold text-navy text-sm pt-2">At the end of the year</p>
        <div className="grid sm:grid-cols-2 gap-2">
          <label className="block"><span className="text-xs text-muted">Days that can carry forward</span>
            <input type="number" value={caps.carry_forward_cap} onChange={(e) => setCaps({ ...caps, carry_forward_cap: e.target.value })} className="inp mt-1" /></label>
          <label className="block"><span className="text-xs text-muted">Days that can be encashed</span>
            <input type="number" value={caps.encash_cap} onChange={(e) => setCaps({ ...caps, encash_cap: e.target.value })} className="inp mt-1" /></label>
        </div>
        <p className="text-[12px] text-muted">
          On 1 January, each person&apos;s unused days carry forward up to the cap, then whatever&apos;s left on encashable types can be cashed in up to the second cap. Anything beyond that lapses.
        </p>
        <button onClick={saveCaps} disabled={saving === "caps"} className="bg-navy text-white text-sm font-semibold px-5 py-2.5 rounded-xl disabled:opacity-60">
          {saving === "caps" ? "Saving…" : "Save"}
        </button>
      </div>

      <div className="space-y-2">
        {d.types.map((t: any) => (
          <div key={t.code} className={`dawn-card p-4 ${t.enabled ? "" : "opacity-60"}`}>
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="min-w-0">
                <p className="font-semibold text-navy text-sm">{t.label}</p>
                <p className="text-[12px] text-muted mt-0.5">{t.hint}</p>
              </div>
              {t.code !== "unpaid" && (
                <label className="flex items-center gap-1.5 text-xs text-navy shrink-0">
                  <input type="checkbox" checked={t.enabled} onChange={(e) => saveType(t, { enabled: e.target.checked })} /> On
                </label>
              )}
            </div>

            {t.code !== "unpaid" && t.enabled && (
              <div className="flex flex-wrap items-end gap-3">
                <label className="block">
                  <span className="text-[12px] text-muted">Gives</span>
                  <input type="number" step="0.5" min="0" defaultValue={t.amount} onBlur={(e) => Number(e.target.value) !== t.amount && saveType(t, { amount: e.target.value })}
                    className="inp mt-1 w-20" />
                </label>
                <label className="block">
                  <span className="text-[12px] text-muted">Every</span>
                  <select defaultValue={t.accrual} onChange={(e) => saveType(t, { accrual: e.target.value })} className="inp mt-1 w-28">
                    <option value="monthly">Month</option>
                    <option value="yearly">Year</option>
                  </select>
                </label>
                <label className="flex items-center gap-1.5 text-xs text-navy pb-2.5">
                  <input type="checkbox" checked={t.carries_forward} onChange={(e) => saveType(t, { carries_forward: e.target.checked })} /> Carries forward
                </label>
                <label className="flex items-center gap-1.5 text-xs text-navy pb-2.5">
                  <input type="checkbox" checked={t.encashable} onChange={(e) => saveType(t, { encashable: e.target.checked })} /> Can be encashed
                </label>
                {saving === t.code && <Loader2 className="w-4 h-4 animate-spin text-navy/30 mb-2.5" />}
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="text-[12px] text-muted">
        Type names are fixed so they mean the same thing everywhere. What each one gives, and what happens to unused days, is yours to set.
      </p>
    </div>
  );
}

function Loading() { return <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-navy/30" /></div>; }
function Empty({ children }: { children: React.ReactNode }) { return <p className="dawn-empty">{children}</p>; }
