"use client";

// My Team — for anyone who has people reporting to them.
//
// The tab only appears if you actually manage someone, so a member never sees
// an empty section wondering what it's for. Approvals sit here rather than in
// a separate queue: the decision belongs next to the person it's about.

import { useState } from "react";
import { useApi } from "@/lib/use-api";
import {
  Loader2, Phone, Mail, Check, X, AlertTriangle, Inbox, Users, Clock } from "lucide-react";

const PRESENCE: Record<string, string> = {
  "In today": "pill-green", "Half day": "pill-amber", "On leave": "pill-sky",
  "Day off": "pill-grey", "Holiday": "pill-grey", "Not in": "pill-red",
  "No record yet": "pill-grey",
};

function ApiError({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="dawn-card p-6 text-center">
      <p className="font-semibold text-navy text-sm">Couldn&apos;t load this</p>
      <p className="t-small text-muted mt-1">{error}</p>
      <button onClick={onRetry} className="btn btn-quiet btn-sm mt-3">Try again</button>
    </div>
  );
}

export function TeamMyTeam() {
  const [view, setView] = useState<"people" | "requests">("people");
  const [proposeFor, setProposeFor] = useState<any>(null);
  // Was: fetch().then(setD).catch(() => {}) — on a server error the response
  // was {error}, `!d` was false, and it fell straight through to d.team.map(),
  // white-screening the tab. The hook returns an error state instead.
  const state = useApi<any>("/api/team/my-team");

  if (state.loading) return <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-navy/30" /></div>;
  if (state.error) return <ApiError error={state.error} onRetry={state.retry} />;
  const d = state.data!;

  if (!d.isManager) {
    return (
      <div className="dawn-card p-6 text-center">
        <span className="w-12 h-12 rounded-2xl bg-surface flex items-center justify-center mx-auto mb-3">
          <Users className="w-6 h-6 text-navy/30" />
        </span>
        <p className="font-semibold text-navy">Nobody reports to you yet</p>
        <p className="text-sm text-muted mt-1">If that changes, their attendance and requests will appear here.</p>
      </div>
    );
  }

  const waiting = (d.pending?.leave || 0) + (d.pending?.fixes || 0);

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5">
        <button onClick={() => setView("people")}
          className={`text-xs font-medium px-3 py-1.5 rounded-full border ${view === "people" ? "bg-navy text-white border-navy" : "text-navy/60 border-navy-line"}`}>
          My team
        </button>
        <button onClick={() => setView("requests")}
          className={`text-xs font-medium px-3 py-1.5 rounded-full border ${view === "requests" ? "bg-navy text-white border-navy" : "text-navy/60 border-navy-line"}`}>
          Waiting on me{waiting > 0 ? ` · ${waiting}` : ""}
        </button>
      </div>

      {view === "people" ? (
        <div className="space-y-2">
          {state.data && d.totals && <TeamTotals t={d.totals} canSeeSalary={d.canSeeSalary} month={d.month} />}
          {d.team.map((p: any) => (
            <div key={p.id} className="dawn-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-navy truncate">{p.name}</p>
                  <p className="t-micro text-muted truncate">{p.jobTitle || p.role}</p>
                </div>
                <span className={`pill ${PRESENCE[p.presence] || "pill-grey"} shrink-0`}>{p.presence}</span>
              </div>

              {/* This month's contribution, shown only when there is one —
                  a row of zeros for a support role is noise, not information. */}
              {(p.revenue > 0 || p.orders > 0 || p.expenses > 0 || p.salary) && (
                <div className="grid grid-cols-3 gap-2 mt-2.5">
                  <Fig label="Revenue" value={`₹${Number(p.revenue).toLocaleString("en-IN")}`} />
                  <Fig label={p.orders === 1 ? "Order" : "Orders"} value={String(p.orders)} />
                  {p.salary != null
                    ? <Fig label="Salary" value={`₹${Number(p.salary).toLocaleString("en-IN")}`} />
                    : <Fig label="Expenses" value={`₹${Number(p.expenses).toLocaleString("en-IN")}`} />}
                </div>
              )}

              {d.canProposeSalary && p.salary != null && (
                <button onClick={() => setProposeFor(p)} className="btn btn-quiet btn-sm mt-2">
                  Propose salary change
                </button>
              )}

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
                {p.hours && Number(p.hours) > 0 && <span className="t-micro text-muted">{p.hours}h today</span>}
                {p.flagged && (
                  <span className="t-micro text-amber-deep flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> needs a look
                  </span>
                )}
                {p.phone && (
                  <a href={`tel:${p.phone}`} aria-label="Call" className="t-micro text-navy/70 hover:text-amber-deep flex items-center gap-1">
                    <Phone className="w-3 h-3" />{p.phone}
                  </a>
                )}
                {p.email && (
                  <a href={`mailto:${p.email}`} aria-label="Email" className="t-micro text-navy/70 hover:text-amber-deep flex items-center gap-1 truncate">
                    <Mail className="w-3 h-3" />{p.email}
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Requests onChange={state.retry} />
      )}

      {proposeFor && (
        <ProposeSalarySheet person={proposeFor} onClose={() => setProposeFor(null)}
          onDone={() => { setProposeFor(null); state.retry(); }} />
      )}
    </div>
  );
}

/**
 * A lead proposing a salary change for someone on their team.
 *
 * It doesn't take effect here — it goes to finance or an admin to approve. The
 * lead is told that plainly, so nobody expects the number to change on submit.
 */
function ProposeSalarySheet({ person, onClose, onDone }: { person: any; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState(String(person.salary || ""));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    setBusy(true); setErr("");
    const res = await fetch("/api/salary-change", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "propose", employeeId: person.id, proposedSalary: Number(amount), reason }),
    });
    const out = await res.json();
    setBusy(false);
    if (out.ok) onDone();
    else setErr(out.error || "Couldn't send that.");
  }

  return (
    <div className="dawn-scrim z-50" onClick={onClose}>
      <div className="dawn-sheet" onClick={(e) => e.stopPropagation()}>
        <p className="font-semibold text-navy">Propose a change for {person.name}</p>
        <p className="t-small text-muted mt-1">
          This goes to finance for approval — it won&apos;t change until they sign off.
        </p>
        <label className="t-label block mt-3 mb-1">New monthly salary</label>
        <input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} className="inp" />
        <label className="t-label block mt-3 mb-1">Reason</label>
        <input value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder="Took on team-lead duties" className="inp" />
        {err && <p className="t-small text-red-600 mt-2">{err}</p>}
        <div className="flex gap-2 mt-4">
          <button onClick={submit} disabled={busy || !(Number(amount) >= 0)} className="btn btn-primary btn-sm flex-1">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send to finance"}
          </button>
          <button onClick={onClose} disabled={busy} className="btn btn-quiet btn-sm flex-1">Cancel</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- requests */

function Requests({ onChange }: { onChange: () => void }) {
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  const leaveState = useApi<any>("/api/leave?status=pending");
  const fixState = useApi<any>("/api/attendance/requests?status=pending");
  const leave = leaveState.data, fixes = fixState.data;
  function reload() { leaveState.retry(); fixState.retry(); }

  async function decide(kind: "leave" | "fix", id: string, action: "approve" | "reject") {
    setBusy(id); setMsg("");
    const endpoint = kind === "leave" ? "/api/leave" : "/api/attendance/requests";
    const res = await fetch(endpoint, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    const out = await res.json();
    setBusy("");
    if (out.ok) { reload(); onChange(); setMsg(out.note || ""); }
    else setMsg(out.error || "Couldn't do that");
  }

  if (leaveState.loading || fixState.loading) return <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-navy/30" /></div>;

  const lr = leave.requests || [], fr = fixes.requests || [];
  if (lr.length === 0 && fr.length === 0) {
    return (
      <div className="dawn-card p-6 text-center">
        <Inbox className="w-6 h-6 text-navy/25 mx-auto mb-2" />
        <p className="text-sm text-muted">Nothing waiting on you.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {msg && <p className="text-sm text-navy bg-surface rounded-xl px-3 py-2">{msg}</p>}

      {lr.map((r: any) => (
        <div key={r.id} className="dawn-card p-4">
          <p className="font-semibold text-navy text-sm">
            {r.employee_name}
            <span className="font-normal text-muted"> · {r.label} · {r.days} {r.days === 1 ? "day" : "days"}</span>
          </p>
          <p className="t-micro text-muted mt-0.5">
            {new Date(r.from_date).toLocaleDateString()}
            {r.to_date !== r.from_date && ` – ${new Date(r.to_date).toLocaleDateString()}`}
          </p>
          {r.reason && <p className="t-small text-muted mt-1">&ldquo;{r.reason}&rdquo;</p>}
          {r.actionable ? (
            <div className="flex gap-2 mt-3">
              <button onClick={() => decide("leave", r.id, "approve")} disabled={!!busy} className="btn btn-primary btn-sm flex-1">
                {busy === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Approve
              </button>
              <button onClick={() => decide("leave", r.id, "reject")} disabled={!!busy} className="btn btn-quiet btn-sm flex-1">
                <X className="w-3.5 h-3.5" /> Reject
              </button>
            </div>
          ) : (
            // Visible but not actionable: it's escalated past this person to
            // someone with approval permission. Shown so nothing seems to
            // vanish, but greyed because they can't act on it.
            <p className="t-micro text-muted mt-3 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" /> Waiting on approval from your manager
            </p>
          )}
        </div>
      ))}

      {fr.map((r: any) => (
        <div key={r.id} className="dawn-card p-4">
          <p className="font-semibold text-navy text-sm">
            {r.employee_name}
            <span className="font-normal text-muted"> · fixing {new Date(r.work_date).toLocaleDateString()}</span>
          </p>
          {r.reason && <p className="t-small text-muted mt-1">&ldquo;{r.reason}&rdquo;</p>}
          <div className="flex gap-2 mt-3">
            <button onClick={() => decide("fix", r.id, "approve")} disabled={!!busy} className="btn btn-primary btn-sm flex-1">
              {busy === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Approve
            </button>
            <button onClick={() => decide("fix", r.id, "reject")} disabled={!!busy} className="btn btn-quiet btn-sm flex-1">
              <X className="w-3.5 h-3.5" /> Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}


/** One figure in a compact row. */
function Fig({ label, value }: { label: string; value: string }) {
  return (
    <div className="dawn-card-inset px-2.5 py-2">
      <p className="t-micro text-muted">{label}</p>
      <p className="text-sm font-semibold text-navy truncate">{value}</p>
    </div>
  );
}

/**
 * The team's month.
 *
 * Split into mine / team / together rather than one blended number: a lead
 * asked "how did we do" needs to answer for the team, but also to see their
 * own contribution inside it. One figure hides both.
 */
function TeamTotals({ t, canSeeSalary, month }: { t: any; canSeeSalary: boolean; month: string }) {
  const monthLabel = month
    ? new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", timeZone: "UTC" })
    : "This month";

  return (
    <div className="dawn-card p-4 mb-1">
      <div className="flex items-baseline justify-between gap-2">
        <p className="t-label">{monthLabel}</p>
        <p className="t-micro text-muted">
          you + {t.headcount} {t.headcount === 1 ? "person" : "people"}
        </p>
      </div>

      <p className="font-display font-semibold text-3xl text-navy mt-1">
        ₹{Number(t.combined.revenue).toLocaleString("en-IN")}
      </p>
      <p className="t-micro text-muted">
        {t.combined.orders} {t.combined.orders === 1 ? "order" : "orders"} collected
      </p>

      <div className="grid grid-cols-2 gap-2 mt-3">
        <div className="dawn-card-inset px-3 py-2">
          <p className="t-micro text-muted">Yours</p>
          <p className="text-sm font-semibold text-navy">₹{Number(t.mine.revenue).toLocaleString("en-IN")}</p>
        </div>
        <div className="dawn-card-inset px-3 py-2">
          <p className="t-micro text-muted">Your team&apos;s</p>
          <p className="text-sm font-semibold text-navy">₹{Number(t.team.revenue).toLocaleString("en-IN")}</p>
        </div>
      </div>

      {(t.combined.expenses > 0 || (canSeeSalary && t.team.salary)) && (
        <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2.5 pt-2.5 border-t border-navy-line/40">
          {t.combined.expenses > 0 && (
            <span className="t-micro text-muted">
              Expenses <strong className="text-navy">₹{Number(t.combined.expenses).toLocaleString("en-IN")}</strong>
            </span>
          )}
          {canSeeSalary && t.team.salary > 0 && (
            <span className="t-micro text-muted">
              Team salary <strong className="text-navy">₹{Number(t.team.salary).toLocaleString("en-IN")}/mo</strong>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
