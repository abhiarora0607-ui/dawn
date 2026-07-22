"use client";

// My pay. What I earn, what I've been paid, and what's owed from encashment.
//
// Read-only by design: pay questions belong to a conversation with a manager,
// not an edit field. What this does is remove the need to ask "was I paid this
// month?" — a question people are often uncomfortable raising.

import { useApi } from "@/lib/use-api";
import { Loader2, Wallet, Calendar, TrendingUp } from "lucide-react";

export function TeamSalary() {
  const state = useApi<any>("/api/team/salary");
  if (state.loading) return <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-navy/30" /></div>;
  if (state.error) return (
    <div className="dawn-card p-6 text-center">
      <p className="t-small text-muted">{state.error}</p>
      <button onClick={state.retry} className="btn btn-quiet btn-sm mt-3">Try again</button>
    </div>
  );
  const d = state.data!;

  const pending = (d.encashments || []).filter((e: any) => e.status === "approved" && !e.paidInMonth);

  return (
    <div className="space-y-4">
      <div className="dawn-card p-5">
        <p className="t-micro text-muted flex items-center gap-1.5"><Wallet className="w-3.5 h-3.5" /> Monthly salary</p>
        <p className="font-display font-semibold text-3xl text-navy mt-1">₹{d.monthly.toLocaleString("en-IN")}</p>
        <p className="t-micro text-muted mt-1">
          About ₹{d.perDay.toLocaleString("en-IN")} a day
          {d.joiningDate && ` · joined ${new Date(d.joiningDate).toLocaleDateString()}`}
        </p>
      </div>

      {pending.length > 0 && (
        <div className="dawn-card p-4 border-amber/30">
          <p className="text-sm font-semibold text-navy flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-amber-deep" /> Coming in your next salary
          </p>
          {pending.map((e: any) => (
            <p key={e.id} className="text-sm text-navy/80 mt-1">
              ₹{Number(e.amount || 0).toLocaleString("en-IN")} — {e.days} {e.days === 1 ? "day" : "days"} of {e.label} encashed
            </p>
          ))}
        </div>
      )}

      <div>
        <p className="t-label mb-2">Payslips</p>
        {d.payslips?.length === 0 ? (
          <p className="dawn-empty">No payslips yet. They appear here once your employer has approved them.</p>
        ) : (
          <div className="space-y-2">
            {d.payslips.map((p: any) => (
              <div key={p.id} className="dawn-card p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-navy">
                      {new Date(`${p.month}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })}
                    </p>
                    <span className={`pill ${p.status === "paid" ? "pill-green" : "pill-sky"} mt-1`}>
                      {p.status === "paid" ? "Paid" : "Approved"}
                    </span>
                  </div>
                  <p className="font-display font-semibold text-xl text-navy">₹{p.net.toLocaleString("en-IN")}</p>
                </div>

                {p.lines?.length > 0 && (
                  <div className="dawn-card-inset p-3 mt-3 space-y-1">
                    {p.lines.map((l: any, i: number) => (
                      <div key={i} className="flex justify-between t-small">
                        <span className={l.kind === "deduction" ? "text-red-600" : "text-navy/70"}>{l.label}</span>
                        <span className={l.kind === "deduction" ? "text-red-600" : "text-navy"}>
                          {l.kind === "deduction" ? "−" : ""}₹{Math.abs(Number(l.amount)).toLocaleString("en-IN")}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {p.paidAt && <p className="t-micro text-muted mt-2">Paid {new Date(p.paidAt).toLocaleDateString()}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {d.encashments?.length > 0 && (
        <div>
          <p className="t-label mb-2">Encashment requests</p>
          <div className="dawn-card divide-y divide-navy-line/40">
            {d.encashments.map((e: any) => (
              <div key={e.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="text-sm text-navy">{e.days} {e.days === 1 ? "day" : "days"} · {e.label}</span>
                <span className={`pill ${e.status === "paid" ? "pill-green" : e.status === "approved" ? "pill-sky" : e.status === "rejected" ? "pill-red" : "pill-amber"}`}>
                  {e.status === "approved" ? "next salary" : e.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="t-micro text-muted text-center">
        Something look wrong? Talk to your manager — pay is set by the business, not here.
      </p>
    </div>
  );
}
