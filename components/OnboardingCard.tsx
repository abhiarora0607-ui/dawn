"use client";

// First-run guide. Shows on the dashboard until the business finishes core
// setup, then disappears on its own. Dismissible if they'd rather explore.
// Uses in-memory dismiss (no browser storage) — reappears next session if not
// complete, which is the gentle nudge we want.

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, X, Rocket } from "lucide-react";

export function OnboardingCard() {
  const [d, setD] = useState<any>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetch("/api/onboarding").then((r) => r.json()).then(setD).catch(() => {});
  }, []);

  if (dismissed || !d?.available || d.complete) return null;

  return (
    <div className="dawn-card p-5 border-amber/30 bg-gradient-to-br from-amber/5 to-transparent">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="w-9 h-9 rounded-xl bg-amber/15 flex items-center justify-center"><Rocket className="w-4.5 h-4.5 text-amber-deep" /></span>
          <div>
            <p className="font-semibold text-navy">Get set up</p>
            <p className="text-xs text-muted">{d.doneCount} of {d.total} essentials done{d.doneCount >= d.total - 1 ? " — you're almost there" : ""}</p>
          </div>
        </div>
        <button onClick={() => setDismissed(true)} className="text-navy/30 hover:text-navy" title="Hide"><X className="w-4 h-4" /></button>
      </div>

      {/* progress bar */}
      <div className="h-1.5 bg-navy-line rounded-full overflow-hidden mb-4">
        <div className="h-full bg-amber-deep rounded-full transition-all" style={{ width: `${(d.doneCount / d.total) * 100}%` }} />
      </div>

      <div className="space-y-1">
        {d.steps.map((s: any) => (
          <Link key={s.key} href={s.href} className={`flex items-center gap-2.5 py-2 px-2 rounded-lg text-sm ${s.done ? "text-muted" : "text-navy hover:bg-white"}`}>
            {s.done ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> : <Circle className="w-4 h-4 text-navy/25 shrink-0" />}
            <span className={s.done ? "line-through" : "font-medium"}>{s.label}</span>
            {s.optional && !s.done && <span className="text-[12px] text-muted ml-auto">optional</span>}
            {!s.done && !s.optional && <span className="text-amber-deep ml-auto text-xs">Start →</span>}
          </Link>
        ))}
      </div>
    </div>
  );
}
