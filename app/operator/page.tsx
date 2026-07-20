"use client";

// TODAY — the only tab you should need most mornings.
// One line telling you how many businesses need you, then a single prioritised
// worklist. No stat grids, no charts: every row is a person to talk to, a
// reason in plain words, and one action.

import { useEffect, useState } from "react";
import Link from "next/link";
import { OperatorGate } from "@/components/OperatorGate";
import { Hero, HealthPill, PlanPill, Empty } from "@/components/OperatorTabs";
import { Loader2, MessageCircle, Clock, ArrowRight, Check } from "lucide-react";

export default function TodayPage() {
  return <OperatorGate><Today /></OperatorGate>;
}

const URGENCY: Record<string, { label: string; cls: string }> = {
  now: { label: "Now", cls: "bg-red-50 text-red-600 border-red-200" },
  soon: { label: "Soon", cls: "bg-amber/10 text-amber-deep border-amber/30" },
  watch: { label: "Watch", cls: "bg-navy/5 text-navy/60 border-navy/15" },
};

function Today() {
  const [d, setD] = useState<any>(null);
  const [done, setDone] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch("/api/operator/overview").then((r) => r.json()).then(setD).catch(() => {});
  }, []);

  if (!d) return <div className="py-20 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-navy/30" /></div>;

  const work = (d.worklist || []).filter((w: any) => !done[w.uid]);
  const nowCount = work.filter((w: any) => w.urgency === "now").length;
  const byUid: Record<string, any> = {};
  for (const b of d.businesses || []) byUid[b.uid] = b;

  const line = work.length === 0
    ? "Nothing needs you today"
    : nowCount > 0
      ? `${nowCount} ${nowCount === 1 ? "business needs" : "businesses need"} you today`
      : `${work.length} to keep an eye on`;

  const sub = work.length === 0
    ? "No trials ending, no renewals due, nobody drifting. Go build something."
    : "Sorted by urgency. Tap Nudge to message them on WhatsApp.";

  return (
    <>
      <Hero line={line} sub={sub} />

      {work.length === 0 ? (
        <div className="dawn-card p-10 text-center">
          <Check className="w-8 h-8 text-emerald-500 mx-auto mb-3" />
          <p className="text-navy font-medium">All clear</p>
        </div>
      ) : (
        <div className="space-y-2">
          {work.map((w: any) => {
            const b = byUid[w.uid] || {};
            const u = URGENCY[w.urgency] || URGENCY.watch;
            return (
              <div key={w.uid} className="dawn-card p-4 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[12px] font-bold uppercase tracking-wide px-2 py-0.5 rounded border ${u.cls}`}>{u.label}</span>
                    <Link href={`/operator/b/${encodeURIComponent(w.uid)}`} className="font-semibold text-navy hover:text-amber-deep truncate">
                      {w.name || "Unnamed business"}
                    </Link>
                    {b.healthLabel && <HealthPill label={b.healthLabel} tone={b.healthTone} />}
                    <PlanPill status={b.billingStatus} plan={b.billingPlan} />
                  </div>
                  <p className="text-sm text-muted mt-1 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> {w.reason}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {w.wa && (
                    <a href={`https://wa.me/${String(w.wa).replace(/[^0-9]/g, "")}?text=${encodeURIComponent(w.message || "")}`} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-sm font-medium text-emerald-700 border border-emerald-200 px-3 py-2 rounded-xl hover:bg-emerald-50">
                      <MessageCircle className="w-4 h-4" /> Nudge
                    </a>
                  )}
                  <Link href={`/operator/b/${encodeURIComponent(w.uid)}`} className="flex items-center gap-1 text-sm font-medium text-navy border border-navy-line px-3 py-2 rounded-xl hover:bg-surface">
                    Open <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                  <button onClick={() => setDone({ ...done, [w.uid]: true })} title="Handled — hide for now"
                    className="text-navy/30 hover:text-navy p-2"><Check className="w-4 h-4" /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-center text-[12px] text-muted pt-2">
        {d.countsLive === false && d.countsAsOf
          ? `Counts summarised ${new Date(d.countsAsOf).toLocaleString()} · `
          : ""}
        Counts and dates only — never anything inside a business&apos;s CRM.
      </p>
    </>
  );
}
