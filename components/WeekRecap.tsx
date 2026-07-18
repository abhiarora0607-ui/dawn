"use client";

// The weekly recap, in-app. The email version reaches people who've left; this
// reaches everyone. Shown Mondays and Tuesdays — a nudge at the start of the
// week, then it gets out of the way.

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, ArrowRight } from "lucide-react";

export function WeekRecap({ money }: { money?: (n: number) => string }) {
  const [d, setD] = useState<any>(null);
  const day = new Date().getDay();

  useEffect(() => {
    if (day !== 1 && day !== 2) return;
    fetch("/api/week-recap").then((r) => r.json()).then(setD).catch(() => {});
  }, [day]);

  if (!d || !d.available) return null;
  const fmt = money || ((n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`);

  return (
    <div className="dawn-card p-4 border-amber/25">
      <p className="dawn-section-title text-sm mb-2"><CalendarDays className="w-4 h-4 text-amber-deep" /> Last week at a glance</p>
      <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-sm">
        <span className="text-navy"><strong>{d.leads}</strong> <span className="text-muted">new lead{d.leads === 1 ? "" : "s"}</span></span>
        <span className="text-navy"><strong>{d.orders}</strong> <span className="text-muted">order{d.orders === 1 ? "" : "s"}</span></span>
        <span className="text-navy"><strong>{fmt(d.collected)}</strong> <span className="text-muted">collected</span></span>
        {d.overdue > 0 && <Link href="/dashboard/attention" className="text-amber-deep font-medium flex items-center gap-1">{d.overdue} follow-up{d.overdue === 1 ? "" : "s"} overdue <ArrowRight className="w-3.5 h-3.5" /></Link>}
      </div>
    </div>
  );
}
