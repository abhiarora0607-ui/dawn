"use client";

import { useEffect, useState } from "react";
import { Sunrise, TrendingUp, TrendingDown, AlertCircle, ArrowRight, Loader2, Sparkles } from "lucide-react";

type BriefAction = { priority: "high" | "medium" | "low"; title: string; detail: string };
type Brief = {
  greeting: string;
  headline: string;
  wins: string[];
  watch: string[];
  actions: BriefAction[];
  source: "ai" | "rules";
};
type Account = {
  displayName: string;
  handle: string;
  followers: number;
  followersChange: number;
  reach: number;
  reachChangePct: number;
  pendingDMs: number;
  responseRatePct: number;
};

const priorityStyles: Record<string, string> = {
  high: "bg-amber-deep/10 text-amber-deep border-amber-deep/20",
  medium: "bg-navy/5 text-navy-soft border-navy/10",
  low: "bg-navy/5 text-navy-soft border-navy/10",
};

function Stat({ label, value, change, invert = false }: { label: string; value: string; change?: number; invert?: boolean }) {
  const positive = change === undefined ? null : invert ? change < 0 : change > 0;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-navy/50 font-medium">{label}</span>
      <div className="flex items-baseline gap-1.5">
        <span className="text-lg font-semibold text-navy">{value}</span>
        {change !== undefined && (
          <span className={`flex items-center text-xs font-medium ${positive ? "text-emerald-600" : "text-red-500"}`}>
            {positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {change > 0 ? "+" : ""}
            {change}
            {label === "Reach" ? "%" : ""}
          </span>
        )}
      </div>
    </div>
  );
}

export default function BriefingDemo() {
  const [data, setData] = useState<{ brief: Brief; account: Account } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/brief")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="w-full max-w-lg rounded-2xl border border-navy/10 bg-white shadow-2xl shadow-navy/10 overflow-hidden animate-rise">
      {/* header */}
      <div className="bg-navy px-6 py-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-amber flex items-center justify-center">
          <Sunrise className="w-5 h-5 text-navy" />
        </div>
        <div className="flex-1">
          <p className="text-white font-semibold text-sm leading-tight">
            {data ? data.brief.greeting : "Good morning"}
          </p>
          <p className="text-white/50 text-xs">
            {data ? data.account.handle : "@your.account"} · today's briefing
          </p>
        </div>
        {data && (
          <span className="flex items-center gap-1 text-[12px] font-medium text-amber bg-amber/10 px-2 py-1 rounded-full">
            <Sparkles className="w-3 h-3" />
            {data.brief.source === "ai" ? "AI" : "Live"}
          </span>
        )}
      </div>

      {loading ? (
        <div className="p-10 flex items-center justify-center text-navy/40">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Reading your account…
        </div>
      ) : data ? (
        <div className="p-6 space-y-5">
          {/* headline */}
          <p className="text-navy font-medium text-[15px] leading-snug">{data.brief.headline}</p>

          {/* stats row */}
          <div className="grid grid-cols-4 gap-3 py-3 border-y border-navy/5">
            <Stat label="Reach" value={`${(data.account.reach / 1000).toFixed(1)}k`} change={data.account.reachChangePct} />
            <Stat label="Followers" value={data.account.followers.toLocaleString()} change={data.account.followersChange} />
            <Stat label="Reply rate" value={`${data.account.responseRatePct}%`} />
            <Stat label="DMs" value={`${data.account.pendingDMs}`} />
          </div>

          {/* actions */}
          <div className="space-y-2.5">
            <p className="text-xs font-semibold text-navy/50 uppercase tracking-wide">Do this today</p>
            {data.brief.actions.slice(0, 4).map((a, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-3 rounded-xl border border-navy/5 hover:border-amber/40 hover:bg-surface transition-colors group"
              >
                <span className={`mt-0.5 text-[12px] font-bold px-1.5 py-0.5 rounded border uppercase ${priorityStyles[a.priority]}`}>
                  {a.priority}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-navy leading-snug">{a.title}</p>
                  <p className="text-xs text-navy/55 leading-snug mt-0.5">{a.detail}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-navy/20 group-hover:text-amber transition-colors mt-0.5 shrink-0" />
              </div>
            ))}
          </div>

          {/* watch */}
          {data.brief.watch.length > 0 && (
            <div className="flex items-start gap-2 text-xs text-navy/60 bg-surface rounded-lg p-3">
              <AlertCircle className="w-4 h-4 text-amber-deep shrink-0 mt-0.5" />
              <span>{data.brief.watch[0]}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="p-10 text-center text-navy/40 text-sm">Couldn't load the briefing. Refresh to try again.</div>
      )}
    </div>
  );
}
