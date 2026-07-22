"use client";

// Pending salary proposals, for finance or an admin to approve.
//
// A lead proposed these; they don't take effect until someone here signs off.
// The proposer is never the approver — the same maker-checker rule as payroll.
// Shows nothing (and fetches nothing actionable) for anyone who isn't finance
// or admin, so it's safe to place on a shared page.

import { useApi } from "@/lib/use-api";
import { useState } from "react";
import { Loader2, Check, X } from "lucide-react";
import { useToast } from "@/components/Toast";

export function SalaryProposals() {
  const { toast } = useToast();
  const state = useApi<any>("/api/salary-change");
  const [busy, setBusy] = useState("");

  const requests = state.data?.requests || [];
  if (state.loading || state.error) return null;      // quiet on a shared page
  if (requests.length === 0) return null;

  async function decide(id: string, action: "approve" | "reject") {
    setBusy(id);
    const res = await fetch("/api/salary-change", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, id }),
    });
    const out = await res.json();
    setBusy("");
    if (out.ok) { toast(out.note || "Done"); state.retry(); }
    else toast(out.error || "Couldn't do that", "error");
  }

  return (
    <div className="dawn-card p-4 border-amber/30 mb-4">
      <p className="font-semibold text-navy text-sm mb-1">
        Salary changes waiting for you ({requests.length})
      </p>
      <p className="t-micro text-muted mb-3">
        Proposed by a team lead. Approving updates the salary; nothing changes until you do.
      </p>
      <div className="space-y-2">
        {requests.map((r: any) => (
          <div key={r.id} className="dawn-card-inset p-3">
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-medium text-navy text-sm">{r.employee_name}</p>
              <p className="t-small">
                <span className="text-muted line-through mr-1">
                  ₹{Number(r.current_salary || 0).toLocaleString("en-IN")}
                </span>
                <span className="text-navy font-semibold">
                  ₹{Number(r.proposed_salary).toLocaleString("en-IN")}
                </span>
              </p>
            </div>
            {r.reason && <p className="t-micro text-muted mt-1">{r.reason}</p>}
            <p className="t-micro text-muted mt-0.5">Proposed by {r.proposer_name}</p>
            <div className="flex gap-2 mt-2">
              <button onClick={() => decide(r.id, "approve")} disabled={!!busy}
                className="btn btn-primary btn-sm flex-1">
                {busy === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Check className="w-3.5 h-3.5" /> Approve</>}
              </button>
              <button onClick={() => decide(r.id, "reject")} disabled={!!busy}
                className="btn btn-quiet btn-sm text-red-600">
                <X className="w-3.5 h-3.5" /> Reject
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
