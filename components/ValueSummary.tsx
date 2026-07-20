"use client";

import { useEffect, useState } from "react";
import { Clock, TrendingUp, TrendingDown, MousePointerClick, Bookmark, Eye } from "lucide-react";

type Trend = { now: number; change: number; pct: number };
type Value = {
  available: boolean;
  actionsThisWeek: number;
  hoursSaved: number;
  trends: null | {
    reach: Trend; profileVisits: Trend; websiteClicks: Trend; saves: Trend; followers: Trend;
  };
};

function fmt(n: number) { return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`; }

function TrendPill({ label, t, icon: Icon }: { label: string; t: Trend; icon: any }) {
  const up = t.change > 0;
  const flat = t.change === 0;
  return (
    <div className="flex items-center gap-2.5 bg-white/5 rounded-xl px-3 py-2.5">
      <Icon className="w-4 h-4 text-amber shrink-0" />
      <div className="min-w-0">
        <p className="text-[12px] text-white/50 leading-none">{label}</p>
        <div className="flex items-baseline gap-1.5 mt-1">
          <span className="text-sm font-semibold text-white">{fmt(t.now)}</span>
          {!flat && (
            <span className={`text-[12px] font-medium flex items-center gap-0.5 ${up ? "text-emerald-400" : "text-red-400"}`}>
              {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {up ? "+" : ""}{t.pct}%
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function ValueSummary() {
  const [v, setV] = useState<Value | null>(null);

  useEffect(() => {
    fetch("/api/value").then((r) => r.json()).then((d) => { if (d.available) setV(d); }).catch(() => {});
  }, []);

  if (!v) return null;

  const hasWork = v.actionsThisWeek > 0;
  const hasTrends = !!v.trends;
  if (!hasWork && !hasTrends) return null;

  return (
    <section className="bg-gradient-to-br from-navy to-navy-soft rounded-2xl p-5 sm:p-6 text-white">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs font-semibold text-amber uppercase tracking-wide">Your week with Dawn</span>
      </div>

      <div className="grid sm:grid-cols-3 gap-3 mb-4">
        <div className="bg-amber rounded-xl px-4 py-3 text-navy">
          <div className="flex items-center gap-1.5 mb-1"><Clock className="w-4 h-4" /><span className="text-[12px] font-semibold uppercase">Time saved</span></div>
          <p className="text-2xl font-bold">~{v.hoursSaved}h</p>
        </div>
        <div className="bg-white/5 rounded-xl px-4 py-3 sm:col-span-2 flex items-center">
          <p className="text-sm text-white/80 leading-snug">
            Dawn prepared <span className="font-semibold text-amber">{v.actionsThisWeek}</span> posts, replies &amp; ideas for you this week — the drafting, hashtags, and strategy done for you.
          </p>
        </div>
      </div>

      {hasTrends && v.trends && (
        <div>
          <p className="text-[12px] text-white/40 uppercase tracking-wide mb-2">This week vs last</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <TrendPill label="Link clicks" t={v.trends.websiteClicks} icon={MousePointerClick} />
            <TrendPill label="Saves" t={v.trends.saves} icon={Bookmark} />
            <TrendPill label="Profile visits" t={v.trends.profileVisits} icon={Eye} />
            <TrendPill label="Reach" t={v.trends.reach} icon={TrendingUp} />
          </div>
        </div>
      )}
    </section>
  );
}
