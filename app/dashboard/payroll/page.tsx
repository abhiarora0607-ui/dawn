"use client";

// Payroll. Draft the month, check the numbers, mark paid.
//
// The page is built around one fact that has to stay obvious: marking a
// payslip paid is the moment it enters the books. Everything before that is
// reversible; that step isn't.

import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { DashTopbar } from "@/components/DashTopbar";
import { ToastProvider, useToast } from "@/components/Toast";
import {
  Loader2, Wallet, Check, ChevronDown, ChevronRight, Plus, Gift, AlertTriangle,
} from "lucide-react";

const PILL: Record<string, string> = {
  draft: "pill-grey", approved: "pill-sky", paid: "pill-green", cancelled: "pill-red",
};

export default function PayrollPage() {
  return (
    <ToastProvider>
      <DashboardShell>
        <DashTopbar pageTitle="Payroll" />
        <Inner />
      </DashboardShell>
    </ToastProvider>
  );
}

function Inner() {
  const { toast } = useToast();
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [d, setD] = useState<any>(null);
  const [busy, setBusy] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [bonusFor, setBonusFor] = useState<any>(null);

  function load() { setD(null); fetch(`/api/payroll?month=${month}`).then((r) => r.json()).then(setD).catch(() => {}); }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [month]);

  async function act(body: any, label: string) {
    setBusy(label);
    const res = await fetch("/api/payroll", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month, ...body }),
    });
    const out = await res.json();
    setBusy("");
    if (out.ok) { toast(out.note || "Done"); load(); } else toast(out.error || "Couldn't do that", "error");
  }

  if (!d) return <div className="py-20 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-navy/30" /></div>;
  if (d.error) return <div className="dawn-page"><p className="dawn-empty">{d.error}</p></div>;

  const drafts = (d.payslips || []).filter((s: any) => s.status === "draft").length;
  const approved = (d.payslips || []).filter((s: any) => s.status === "approved").length;

  return (
    <div className="dawn-page space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display font-semibold t-display text-navy">Payroll</h1>
          <p className="text-muted text-sm mt-1">Draft the month, check it, then mark it paid.</p>
        </div>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="inp w-44" />
      </div>

      {/* Summary */}
      <div className="dawn-card p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="t-micro text-muted">Total for {new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })}</p>
            <p className="font-display font-semibold text-3xl text-navy mt-0.5">₹{Number(d.totals.net || 0).toLocaleString("en-IN")}</p>
            <p className="t-micro text-muted mt-0.5">
              {d.totals.count} payslip{d.totals.count === 1 ? "" : "s"}
              {d.totals.unpaid > 0 && ` · ${d.totals.unpaid} still to pay`}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {d.missing?.length > 0 && d.canPrepare && (
              <button onClick={() => act({ action: "generate" }, "gen")} disabled={!!busy} className="btn btn-primary">
                {busy === "gen" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Draft {d.missing.length} payslip{d.missing.length === 1 ? "" : "s"}
              </button>
            )}
            {drafts > 0 && d.canApprove && (
              <button onClick={() => act({ action: "approve_all" }, "appr")} disabled={!!busy} className="btn btn-quiet">
                {busy === "appr" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Approve all {drafts}
              </button>
            )}
          </div>
        </div>

        {approved > 0 && (
          <p className="t-micro text-amber-deep mt-3 flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            {approved} payslip{approved === 1 ? " is" : "s are"} approved but not paid. Nothing reaches your books until you mark them paid.
          </p>
        )}
      </div>

      {/* Bonuses waiting */}
      {d.pendingBonuses?.length > 0 && (
        <div className="dawn-card p-4">
          <p className="font-semibold text-navy text-sm flex items-center gap-1.5 mb-2">
            <Gift className="w-4 h-4 text-amber-deep" /> Bonuses waiting for you
          </p>
          {d.pendingBonuses.map((b: any) => (
            <BonusRow key={b.id} b={b} onDone={load} />
          ))}
        </div>
      )}

      {/* Payslips */}
      {d.payslips?.length === 0 ? (
        <p className="dawn-empty">
          No payslips for this month yet.{d.missing?.length > 0 && " Use “Draft payslips” above to start."}
        </p>
      ) : (
        <div className="dawn-card divide-y divide-navy-line/40">
          {d.payslips.map((s: any) => {
            const isOpen = open.has(s.id);
            return (
              <div key={s.id}>
                <div className="flex items-center gap-3 px-4 py-3">
                  <button onClick={() => setOpen((p) => { const n = new Set(p); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n; })}
                    className="btn-icon -ml-2" aria-label={isOpen ? "Collapse" : "Expand"}>
                    {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>

                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-navy truncate">{s.employee_name}</p>
                    <p className="t-micro text-muted">
                      ₹{Number(s.base_amount).toLocaleString("en-IN")} base
                      {Number(s.additions) > 0 && ` + ₹${Number(s.additions).toLocaleString("en-IN")}`}
                    </p>
                  </div>

                  <p className="font-semibold text-navy shrink-0">₹{Number(s.net_amount).toLocaleString("en-IN")}</p>
                  <span className={`pill ${PILL[s.status]} shrink-0`}>{s.statusLabel}</span>

                  <div className="flex gap-1.5 shrink-0">
                    {s.status === "draft" && d.canApprove && (
                      <button onClick={() => act({ action: "set_status", id: s.id, status: "approved" }, s.id)}
                        disabled={!!busy} className="btn btn-quiet btn-sm">Approve</button>
                    )}
                    {s.status === "approved" && d.canPay && (
                      <button onClick={() => act({ action: "set_status", id: s.id, status: "paid" }, s.id)}
                        disabled={!!busy} className="btn btn-primary btn-sm">
                        {busy === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Mark paid"}
                      </button>
                    )}
                  </div>
                </div>

                {isOpen && (
                  <div className="px-4 pb-3 pl-14">
                    <div className="dawn-card-inset p-3 space-y-1">
                      {s.lines?.map((l: any) => (
                        <div key={l.id} className="flex justify-between t-small">
                          <span className={l.kind === "deduction" ? "text-red-600" : "text-navy/70"}>{l.label}</span>
                          <span className={l.kind === "deduction" ? "text-red-600" : "text-navy"}>
                            {l.kind === "deduction" ? "−" : ""}₹{Math.abs(Number(l.amount)).toLocaleString("en-IN")}
                          </span>
                        </div>
                      ))}
                      <div className="flex justify-between text-sm font-semibold text-navy pt-1.5 border-t border-navy-line/60">
                        <span>Net</span><span>₹{Number(s.net_amount).toLocaleString("en-IN")}</span>
                      </div>
                    </div>
                    {s.paid_at && <p className="t-micro text-muted mt-1.5">Paid {new Date(s.paid_at).toLocaleDateString()}</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BonusRow({ b, onDone }: { b: any; onDone: () => void }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function decide(action: "approve" | "reject") {
    setBusy(true);
    const res = await fetch("/api/bonus", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, id: b.id }),
    });
    const out = await res.json();
    setBusy(false);
    if (out.ok) { toast(out.note || "Done"); onDone(); } else toast(out.error || "Couldn't do that", "error");
  }

  return (
    <div className="flex items-center justify-between gap-3 py-2 border-t border-navy-line/40 first:border-0 flex-wrap">
      <div className="min-w-0">
        <p className="text-sm text-navy">
          <strong>₹{Number(b.amount).toLocaleString("en-IN")}</strong> for {b.employee_name}
        </p>
        <p className="t-micro text-muted">
          {b.reason || "No reason given"} · proposed by {b.requested_by_name}
        </p>
      </div>
      <div className="flex gap-1.5 shrink-0">
        <button onClick={() => decide("approve")} disabled={busy} className="btn btn-primary btn-sm">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Approve"}
        </button>
        <button onClick={() => decide("reject")} disabled={busy} className="btn btn-quiet btn-sm">Reject</button>
      </div>
    </div>
  );
}
