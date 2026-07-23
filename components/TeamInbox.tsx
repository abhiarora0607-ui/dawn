"use client";

// The portal's unified approvals inbox (V52).
//
// One surface for every pending decision. What you can act on sits on top,
// oldest first (FIFO — nothing rots at the bottom). What escalated past you
// stays visible, greyed, with the name of whose queue it landed in — the
// V48b rule that nothing ever silently vanishes. Buttons only render on
// actionable items; the server would refuse anyway, but a dead button is a
// broken promise, so it never appears.

import { useState } from "react";
import { useApi } from "@/lib/use-api";
import { Loader2, Check, X, Inbox, ShieldQuestion } from "lucide-react";

const DECIDE_URL: Record<string, string> = {
  leave: "/api/leave",
  fix: "/api/attendance/requests",
  salary: "/api/salary-change",
  bonus: "/api/bonus",
  expense: "/api/team/expense",
};

export function TeamInbox({ onChange }: { onChange?: () => void }) {
  const state = useApi<any>("/api/team/inbox");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  async function decide(kind: string, id: string, action: "approve" | "reject") {
    setBusy(id); setMsg("");
    const res = await fetch(DECIDE_URL[kind] || "/api/leave", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    const out = await res.json();
    setBusy("");
    if (out.ok) { setMsg(out.note || "Done"); state.retry(); onChange?.(); }
    else setMsg(out.error || "Couldn't do that");
  }

  if (state.loading) {
    return <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-navy/30" /></div>;
  }
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

  const actionable = (d.items || []).filter((i: any) => i.actionable);
  const watching = (d.items || []).filter((i: any) => !i.actionable);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display font-semibold text-2xl text-navy flex items-center gap-2">
          <Inbox className="w-6 h-6 text-amber-deep" /> Inbox
        </h1>
        <p className="text-muted text-sm mt-1">
          {actionable.length > 0
            ? `${actionable.length} waiting for your decision.`
            : "Nothing needs your decision right now."}
        </p>
      </div>

      {msg && <p className="t-small text-navy bg-surface border border-navy-line rounded-xl px-3 py-2">{msg}</p>}

      {actionable.length > 0 && (
        <div className="space-y-2">
          {actionable.map((i: any) => (
            <div key={`${i.kind}-${i.id}`} className="dawn-card p-4">
              <p className="text-sm font-semibold text-navy">{i.title}</p>
              {i.sub && <p className="t-small text-muted mt-0.5">{i.sub}</p>}
              {i.receiptUrl && (
                <a href={i.receiptUrl} target="_blank" className="t-small text-amber-deep underline inline-block mt-1">View receipt →</a>
              )}
              <div className="flex gap-2 mt-3">
                <button onClick={() => decide(i.kind, i.id, "approve")} disabled={!!busy}
                  className="btn btn-primary btn-sm flex-1">
                  {busy === i.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Check className="w-3.5 h-3.5" /> Approve</>}
                </button>
                <button onClick={() => decide(i.kind, i.id, "reject")} disabled={!!busy}
                  className="btn btn-quiet btn-sm text-red-600">
                  <X className="w-3.5 h-3.5" /> Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {watching.length > 0 && (
        <div>
          <p className="t-label text-muted mb-2">In your team, being handled elsewhere</p>
          <div className="space-y-2">
            {watching.map((i: any) => (
              <div key={`${i.kind}-${i.id}`} className="dawn-card p-4 opacity-70">
                <p className="text-sm font-medium text-navy">{i.title}</p>
                {i.sub && <p className="t-small text-muted mt-0.5">{i.sub}</p>}
                {i.receiptUrl && (
                  <a href={i.receiptUrl} target="_blank" className="t-small text-amber-deep underline inline-block mt-1">View receipt →</a>
                )}
                <p className="t-micro text-muted mt-1.5">
                  {i.mine ? `Your proposal — waiting with ${i.withName || "the approver"}.` : `Waiting with ${i.withName || "the approver"}.`}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {actionable.length === 0 && watching.length === 0 && (
        <div className="dawn-card p-8 text-center">
          <Inbox className="w-8 h-8 text-navy/20 mx-auto mb-2" />
          <p className="t-small text-muted">All clear. Requests from your team will appear here the moment they're raised.</p>
        </div>
      )}

      {Array.isArray(d.review) && d.review.length > 0 && (
        <div className="dawn-card p-4 border-amber/25">
          <p className="text-sm font-semibold text-navy flex items-center gap-1.5">
            <ShieldQuestion className="w-4 h-4 text-amber-deep" /> Access worth reviewing
          </p>
          <p className="t-micro text-muted mt-1 mb-2">
            These people hold an approval permission but manage nobody, so it can never fire. Reassign their team, or remove the permission in Access.
          </p>
          <div className="space-y-1">
            {d.review.map((r: any, i: number) => (
              <p key={i} className="t-small text-navy">{r.name} · <span className="text-muted">{r.permission}</span></p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
