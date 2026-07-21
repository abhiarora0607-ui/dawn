"use client";

// "What does this person see?"
//
// Banded in amber and labelled read-only throughout, because the failure mode
// here is an owner believing they're acting as someone and being surprised
// later. Nothing on this screen can change anything.

import { useEffect, useState } from "react";
import { Loader2, Eye, X, Phone, Mail, Wallet, CalendarClock } from "lucide-react";

export function ViewAs({ employeeId, onClose }: { employeeId: string; onClose: () => void }) {
  const [d, setD] = useState<any>(null);

  useEffect(() => {
    fetch(`/api/view-as?employeeId=${employeeId}`).then((r) => r.json()).then(setD).catch(() => {});
  }, [employeeId]);

  return (
    <div className="dawn-scrim" onClick={onClose}>
      <div className="dawn-sheet dawn-sheet-wide" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <span className="w-9 h-9 rounded-xl bg-amber/15 flex items-center justify-center shrink-0">
              <Eye className="w-4 h-4 text-amber-deep" />
            </span>
            <div>
              <p className="font-semibold text-navy">{d?.employee?.name || "Loading…"}</p>
              <p className="t-micro text-amber-deep font-medium">Read-only view — nothing here can be changed</p>
            </div>
          </div>
          <button onClick={onClose} className="btn-icon" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>

        {!d ? (
          <div className="py-12 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-navy/30" /></div>
        ) : d.error ? (
          <p className="dawn-empty">{d.error}</p>
        ) : (
          <div className="space-y-4">
            <div className="dawn-card-inset p-3">
              <p className="t-small text-navy">
                {d.employee.jobTitle || d.employee.role}
                {d.employee.department && ` · ${d.employee.department}`}
              </p>
              {d.employee.manager && <p className="t-micro text-muted mt-0.5">Reports to {d.employee.manager}</p>}
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                {d.employee.phone && (
                  <a href={`tel:${d.employee.phone}`} aria-label="Call" className="t-micro text-navy/70 flex items-center gap-1">
                    <Phone className="w-3 h-3" />{d.employee.phone}
                  </a>
                )}
                {d.employee.email && (
                  <span className="t-micro text-navy/70 flex items-center gap-1 truncate">
                    <Mail className="w-3 h-3" />{d.employee.email}
                  </span>
                )}
              </div>
              {!d.employee.hasLogin && (
                <p className="t-micro text-amber-deep mt-2">
                  No portal login yet — they can&apos;t sign in to see any of this.
                </p>
              )}
            </div>

            <div>
              <p className="t-label mb-1.5">This month</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Stat label="Full days" value={d.thisMonth.present} />
                <Stat label="Half days" value={d.thisMonth.half} />
                <Stat label="Absent" value={d.thisMonth.absent} />
                <Stat label="Hours" value={d.thisMonth.hours} />
              </div>
              {d.thisMonth.flagged > 0 && (
                <p className="t-micro text-amber-deep mt-1.5">{d.thisMonth.flagged} day(s) flagged for review</p>
              )}
            </div>

            {d.balances?.length > 0 && (
              <div>
                <p className="t-label mb-1.5">Leave left</p>
                <div className="flex flex-wrap gap-1.5">
                  {d.balances.map((b: any) => (
                    <span key={b.label} className="pill pill-grey">{b.label.replace(" Leave", "")}: {b.available}</span>
                  ))}
                </div>
              </div>
            )}

            {d.payslips?.length > 0 && (
              <div>
                <p className="t-label mb-1.5 flex items-center gap-1.5"><Wallet className="w-3 h-3" /> Recent payslips</p>
                <div className="dawn-card-inset divide-y divide-navy-line/40">
                  {d.payslips.map((p: any) => (
                    <div key={p.month} className="flex justify-between px-3 py-2 t-small">
                      <span className="text-navy/70">
                        {new Date(`${p.month}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" })}
                      </span>
                      <span className="text-navy">
                        ₹{p.net.toLocaleString("en-IN")}
                        <span className={`pill ${p.status === "paid" ? "pill-green" : "pill-sky"} ml-2`}>{p.status}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {d.recentLeave?.length > 0 && (
              <div>
                <p className="t-label mb-1.5 flex items-center gap-1.5"><CalendarClock className="w-3 h-3" /> Recent leave</p>
                <div className="dawn-card-inset divide-y divide-navy-line/40">
                  {d.recentLeave.map((r: any) => (
                    <div key={r.id} className="flex justify-between px-3 py-2 t-small">
                      <span className="text-navy/70">{r.label} · {r.days}d</span>
                      <span className={`pill ${r.status === "approved" ? "pill-green" : r.status === "rejected" ? "pill-red" : "pill-amber"}`}>{r.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="t-micro text-muted text-center">
              Opening this view is recorded in your audit log.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="dawn-card-inset p-2.5 text-center">
      <p className="font-display font-semibold text-lg text-navy leading-none">{value}</p>
      <p className="t-micro text-muted mt-1">{label}</p>
    </div>
  );
}
