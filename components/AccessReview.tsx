"use client";

// Access review — the whole access picture on one screen.
//
// Built because access granted one person at a time becomes impossible to hold
// in your head. This answers the questions an owner actually has: who can
// approve leave, who can see pay, and — using the real escalation walk — whose
// desk each person's request lands on. Plus which permissions nobody holds, so
// the list can be trimmed rather than growing forever.

import { useApi } from "@/lib/use-api";
import { Loader2, ShieldCheck, ArrowUpRight, AlertTriangle } from "lucide-react";

export function AccessReview() {
  const state = useApi<any>("/api/access-review");

  if (state.loading) return <div className="py-12 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-navy/30" /></div>;
  if (state.error) return (
    <div className="dawn-card p-6 text-center">
      <p className="t-small text-muted">{state.error}</p>
      <button onClick={state.retry} className="btn btn-quiet btn-sm mt-3">Try again</button>
    </div>
  );
  const d = state.data!;
  const people = d.people || [];

  return (
    <div className="space-y-4">
      <div>
        <p className="font-semibold text-navy flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-amber-deep" /> Who can do what
        </p>
        <p className="t-small text-muted mt-0.5">
          Access for everyone with a portal login, and where each person&apos;s requests are decided.
        </p>
      </div>

      {people.length === 0 ? (
        <p className="dawn-empty">No portal logins yet.</p>
      ) : (
        <div className="space-y-2">
          {people.map((p: any) => (
            <div key={p.id} className="dawn-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-navy truncate">
                    {p.name}
                    {p.isAdmin && <span className="ml-2 pill pill-sky t-micro">Admin</span>}
                    {!p.active && <span className="ml-2 pill pill-grey t-micro">Login off</span>}
                  </p>
                  {p.jobTitle && <p className="t-micro text-muted">{p.jobTitle}</p>}
                </div>
              </div>

              {/* Where their requests go — the escalation made visible. */}
              <p className="t-micro text-muted mt-2 flex items-center gap-1">
                <ArrowUpRight className="w-3.5 h-3.5" />
                Leave requests decided by <strong className="text-navy">{p.leaveApprover}</strong>
              </p>

              {/* What they can approve for others. */}
              <div className="flex flex-wrap gap-1.5 mt-2">
                {p.canApproveLeave && <span className="pill pill-green t-micro">Approves leave</span>}
                {p.canApproveAttendance && <span className="pill pill-green t-micro">Approves attendance</span>}
                {p.permissions.includes("salary_view") && <span className="pill pill-amber t-micro">Sees salaries</span>}
                {p.permissions.length === 0 && !p.canApproveLeave && (
                  <span className="t-micro text-muted">Basic access only</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Permissions nobody holds — trim candidates. */}
      {d.unusedPermissions?.length > 0 && (
        <div className="dawn-card-inset p-3">
          <p className="t-micro text-muted flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            {d.unusedPermissions.length} of {d.totalPortalPermissions} permissions are held by nobody:
          </p>
          <p className="t-micro text-navy/60 mt-1">
            {d.unusedPermissions.map((u: any) => u.label).join(" · ")}
          </p>
        </div>
      )}
    </div>
  );
}
