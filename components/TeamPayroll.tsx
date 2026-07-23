"use client";

// The payroll run, from the employee portal (V53).
//
// The API has been employee-capable since V48b (resolveApprover falls through
// to the logged-in employee; canPrepare/canApprove/canPay come from
// permissions). What was missing was any door in the portal — Karan held
// payroll_approve he could not reach. This is the door.
//
// Maker-checker in pixels, not just in the API: each button renders only for
// the capability that permits it, so an accountant with payroll_prepare sees
// Generate but never Approve, and an approver without payroll_pay never sees
// Mark paid. The server enforces it regardless; the UI simply never lies.

import { useState } from "react";
import { useApi } from "@/lib/use-api";
import type { PayrollResponse } from "@/lib/api-types";
import { Loader2, Wallet, Check, X, IndianRupee } from "lucide-react";

const STATUS_TONE: Record<string, string> = {
  draft: "bg-navy/5 text-navy/70",
  approved: "bg-amber/15 text-amber-deep",
  paid: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-50 text-red-600",
  cancelled: "bg-navy/5 text-navy/40",
};

export function TeamPayroll() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const state = useApi<PayrollResponse>(`/api/payroll?month=${month}`, [month]);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  async function act(body: any, key: string) {
    setBusy(key); setMsg("");
    const res = await fetch("/api/payroll", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const out = await res.json();
    setBusy("");
    if (out.ok || out.made != null) { setMsg(out.note || "Done"); state.retry(); }
    else setMsg(out.error || "Couldn't do that");
  }

  if (state.loading) return <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-navy/30" /></div>;
  if (state.error) {
    return (
      <div className="dawn-card p-6 text-center">
        <p className="t-small text-muted">{state.error}</p>
        <button onClick={state.retry} className="btn btn-quiet btn-sm mt-3">Try again</button>
      </div>
    );
  }
  const d = state.data;
  if (!d) return null;

  const roles = [d.canPrepare && "prepare", d.canApprove && "approve", d.canPay && "pay"].filter(Boolean).join(" · ");
  const drafts = d.payslips.filter((s) => s.status === "draft").length;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display font-semibold text-2xl text-navy flex items-center gap-2">
            <Wallet className="w-6 h-6 text-amber-deep" /> Payroll
          </h1>
          <p className="text-muted text-sm mt-1">
            {roles ? `You can ${roles}.` : "You can view the run."} Nothing reaches the books until a slip is marked paid.
          </p>
        </div>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
          className="inp !w-auto shrink-0" />
      </div>

      {msg && <p className="t-small text-navy bg-surface border border-navy-line rounded-xl px-3 py-2">{msg}</p>}

      {d.canPrepare && d.missing.length > 0 && (
        <div className="dawn-card p-4 border-amber/30 flex items-center justify-between gap-3">
          <p className="t-small text-navy">{d.missing.length} {d.missing.length === 1 ? "person has" : "people have"} no payslip for {month} yet.</p>
          <button onClick={() => act({ action: "generate", month }, "gen")} disabled={!!busy}
            className="btn btn-primary btn-sm shrink-0">
            {busy === "gen" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Generate drafts"}
          </button>
        </div>
      )}

      {d.canApprove && drafts > 1 && (
        <button onClick={() => act({ action: "approve_all", month }, "all")} disabled={!!busy}
          className="btn btn-quiet btn-sm">
          {busy === "all" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : `Approve all ${drafts} drafts`}
        </button>
      )}

      <div className="space-y-2">
        {d.payslips.length === 0 && (
          <div className="dawn-card p-8 text-center">
            <IndianRupee className="w-8 h-8 text-navy/20 mx-auto mb-2" />
            <p className="t-small text-muted">No payslips for {month} yet{d.canPrepare ? " — generate the drafts to start the run." : "."}</p>
          </div>
        )}
        {d.payslips.map((s) => (
          <div key={s.id} className="dawn-card p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-navy min-w-0 truncate">{s.employee_name}</p>
              <span className={`t-micro px-2 py-0.5 rounded-full shrink-0 ${STATUS_TONE[s.status] || STATUS_TONE.draft}`}>{s.statusLabel || s.status}</span>
            </div>
            <p className="t-small text-muted mt-0.5">Net ₹{Number(s.net_amount).toLocaleString("en-IN")}{s.additions > 0 ? ` · +₹${Number(s.additions).toLocaleString("en-IN")} additions` : ""}</p>
            <div className="flex gap-2 mt-2.5">
              {s.status === "draft" && d.canApprove && (
                <>
                  <button onClick={() => act({ action: "set_status", id: s.id, status: "approved" }, s.id)} disabled={!!busy}
                    className="btn btn-primary btn-sm flex-1">
                    {busy === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Check className="w-3.5 h-3.5" /> Approve</>}
                  </button>
                  <button
                    onClick={() => { const note = window.prompt("Why is this going back to draft?") || ""; act({ action: "set_status", id: s.id, status: "rejected", note }, s.id); }}
                    disabled={!!busy} className="btn btn-quiet btn-sm text-red-600">
                    <X className="w-3.5 h-3.5" /> Reject
                  </button>
                </>
              )}
              {s.status === "approved" && d.canPay && (
                <button onClick={() => act({ action: "set_status", id: s.id, status: "paid" }, s.id)} disabled={!!busy}
                  className="btn btn-primary btn-sm flex-1">
                  {busy === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Mark paid"}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
