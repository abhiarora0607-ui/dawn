"use client";

// Resetting the business.
//
// Deliberately unfriendly. Every other screen in Dawn tries to reduce friction;
// this one adds it. The counts are exact, what survives is stated plainly, and
// the confirmation is the business name typed by hand — a checkbox can be
// clicked without reading, a name cannot.

import { useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { Loader2, AlertTriangle, Trash2 } from "lucide-react";

export function ResetOrg() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [d, setD] = useState<any>(null);
  const [typed, setTyped] = useState("");
  const [keepEmployees, setKeepEmployees] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setD(null); setTyped("");
    fetch("/api/reset").then((r) => r.json()).then(setD).catch(() => {});
  }, [open]);

  async function run() {
    setBusy(true);
    const res = await fetch("/api/reset", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: typed, keepEmployees }),
    });
    const out = await res.json();
    setBusy(false);
    if (out.ok) {
      toast(out.note || "Reset complete");
      setOpen(false);
      // A full reload rather than a re-fetch: half the app is holding state
      // about records that no longer exist.
      setTimeout(() => window.location.reload(), 900);
    } else toast(out.error || "Couldn't reset", "error");
  }

  const nameMatches = d?.businessName && typed.trim().toLowerCase() === d.businessName.toLowerCase();

  return (
    <>
      <div className="dawn-card p-5 border-red-200">
        <p className="font-semibold text-navy flex items-center gap-1.5">
          <AlertTriangle className="w-4 h-4 text-red-500" /> Reset this business
        </p>
        <p className="text-sm text-muted mt-1">
          Deletes every record — contacts, orders, expenses, employees, attendance, leave and payroll — and leaves you with an empty business. Your login, subscription and settings stay.
        </p>
        <button onClick={() => setOpen(true)} className="btn btn-quiet btn-sm mt-3 text-red-600 border-red-200 hover:bg-red-50">
          <Trash2 className="w-4 h-4" /> Reset everything
        </button>
      </div>

      {open && (
        <div className="dawn-scrim z-50" onClick={() => !busy && setOpen(false)}>
          <div className="dawn-sheet dawn-sheet-wide" onClick={(e) => e.stopPropagation()}>
            <p className="font-semibold text-navy flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-red-500" /> This cannot be undone
            </p>

            {!d ? (
              <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-navy/30" /></div>
            ) : (
              <>
                <p className="text-sm text-muted mt-1">
                  {d.total > 0
                    ? `${d.total.toLocaleString("en-IN")} records will be permanently deleted.`
                    : "There's nothing to delete — this business is already empty."}
                </p>

                {d.breakdown?.length > 0 && (
                  <div className="dawn-card-inset p-3 mt-3 max-h-48 overflow-y-auto">
                    {d.breakdown.map((b: any) => (
                      <div key={b.table} className="flex justify-between t-small py-0.5">
                        <span className="text-navy/70">{b.label}</span>
                        <span className="text-navy font-medium">{b.count.toLocaleString("en-IN")}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-3">
                  <p className="t-label mb-1">What stays</p>
                  <ul className="t-small text-muted space-y-0.5">
                    {d.preserved?.map((x: string) => <li key={x}>· {x}</li>)}
                  </ul>
                </div>

                <label className="flex items-start gap-2 mt-3 cursor-pointer">
                  <input type="checkbox" checked={keepEmployees}
                    onChange={(e) => setKeepEmployees(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-amber-deep shrink-0" />
                  <span className="t-small text-navy">
                    Keep my employees
                    <span className="block t-micro text-muted">
                      Their attendance, leave and payslips are kept too. Useful if you only want to clear the business side.
                    </span>
                  </span>
                </label>

                {d.total > 0 && (
                  <div className="mt-4">
                    <label className="t-label block mb-1.5">
                      Type <strong className="text-navy">{d.businessName}</strong> to confirm
                    </label>
                    <input value={typed} onChange={(e) => setTyped(e.target.value)}
                      placeholder={d.businessName} className="inp" autoComplete="off" />
                  </div>
                )}

                <div className="flex gap-2 mt-4">
                  <button onClick={run} disabled={!nameMatches || busy || d.total === 0}
                    className="btn btn-sm flex-1 bg-red-600 text-white border-red-600 hover:bg-red-700 disabled:opacity-40">
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    Delete everything
                  </button>
                  <button onClick={() => setOpen(false)} disabled={busy} className="btn btn-quiet btn-sm flex-1">
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
