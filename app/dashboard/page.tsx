"use client";

import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { DashTopbar } from "@/components/DashTopbar";
import { Onboarding } from "@/components/Onboarding";
import {
  TrendingUp, TrendingDown, Loader2,
  Sparkles, Trophy, AlertTriangle, Eye, Bookmark, Clock, Target, Users,
} from "lucide-react";

type BriefAction = { priority: "high" | "medium" | "low"; title: string; detail: string };
type Brief = { greeting: string; headline: string; wins: string[]; watch: string[]; actions: BriefAction[]; source: "ai" | "rules" };
type Account = {
  handle: string; displayName: string; niche: string;
  followers: number; followersChange: number; reach: number; reachChangePct: number;
  profileVisits: number; engagementRate: number; responseRatePct: number; pendingDMs: number;
  topPost: { caption: string; format: string; reach: number; saves: number };
  worstPost: { caption: string; format: string; reach: number };
  audiencePrefers: string; bestTimeToPost: string;
};
type Competitor = { handle: string; postsLast7d: number; topFormat: string; standoutPost: string; standoutReach: number; note: string };
type Payload = { brief: Brief; account: Account; competitors: Competitor[] };

const priorityStyles: Record<string, string> = {
  high: "bg-amber-deep/10 text-amber-deep border-amber-deep/20",
  medium: "bg-navy/5 text-navy-soft border-navy/10",
  low: "bg-navy/5 text-navy-soft border-navy/10",
};

function fmt(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;
}

function StatCard({ label, value, change, unit = "", icon: Icon, invert = false }: { label: string; value: string; change?: number; unit?: string; icon: any; invert?: boolean }) {
  const positive = change === undefined ? null : invert ? change < 0 : change > 0;
  return (
    <div className="bg-white rounded-xl border border-navy/8 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-navy/50">{label}</span>
        <Icon className="w-4 h-4 text-navy/30" />
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold text-navy">{value}</span>
        {change !== undefined && (
          <span className={`flex items-center text-xs font-semibold ${positive ? "text-emerald-600" : "text-red-500"}`}>
            {positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {change > 0 ? "+" : ""}{change}{unit}
          </span>
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/brief").then((r) => r.json()).then((d) => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  return (
    <DashboardShell>
      <main className="flex-1">
        <DashTopbar account={data?.account} pageTitle="Briefing" />
        <Onboarding account={data?.account} />

        {loading ? (
          <div className="p-10 sm:p-20 flex items-center justify-center text-navy/40">
            <Loader2 className="w-6 h-6 animate-spin mr-3" /> Reading your account…
          </div>
        ) : data ? (
          <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
            {/* Briefing hero */}
            <section className="bg-navy rounded-2xl p-6 sm:p-8 text-white relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-amber/10 rounded-full blur-3xl -mr-20 -mt-20" />
              <div className="relative">
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles className="w-4 h-4 text-amber" />
                  <span className="text-xs font-semibold text-amber uppercase tracking-wide">
                    {data.brief.source === "ai" ? "AI briefing" : "Today's briefing"}
                  </span>
                </div>
                <h1 className="font-display font-semibold text-2xl sm:text-3xl mb-3">{data.brief.greeting}</h1>
                <p className="text-white/80 text-lg leading-relaxed max-w-2xl">{data.brief.headline}</p>

                {(data.brief.wins.length > 0 || data.brief.watch.length > 0) && (
                  <div className="grid sm:grid-cols-2 gap-3 mt-6">
                    {data.brief.wins.slice(0, 2).map((w, i) => (
                      <div key={`w${i}`} className="flex items-start gap-2 bg-white/5 rounded-lg p-3">
                        <Trophy className="w-4 h-4 text-amber shrink-0 mt-0.5" />
                        <span className="text-sm text-white/85">{w}</span>
                      </div>
                    ))}
                    {data.brief.watch.slice(0, 2).map((w, i) => (
                      <div key={`wa${i}`} className="flex items-start gap-2 bg-white/5 rounded-lg p-3">
                        <AlertTriangle className="w-4 h-4 text-amber shrink-0 mt-0.5" />
                        <span className="text-sm text-white/85">{w}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* Stats */}
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="Reach" value={fmt(data.account.reach)} change={data.account.reachChangePct} unit="%" icon={Eye} />
              <StatCard label="Followers" value={data.account.followers.toLocaleString()} change={data.account.followersChange} icon={Users} invert />
              <StatCard label="Profile visits" value={fmt(data.account.profileVisits)} icon={Target} />
              <StatCard label="Engagement" value={`${data.account.engagementRate}%`} icon={TrendingUp} />
            </section>

            <div className="grid lg:grid-cols-3 gap-6">
              {/* Actions - takes 2 cols */}
              <section className="lg:col-span-2 bg-white rounded-2xl border border-navy/8 p-6">
                <h2 className="text-sm font-semibold text-navy/50 uppercase tracking-wide mb-4">Do this today</h2>
                <div className="space-y-3">
                  {data.brief.actions.map((a, i) => (
                    <div key={i} className="flex items-start gap-3 p-4 rounded-xl border border-navy/8 hover:border-amber/40 hover:bg-surface transition-colors group">
                      <span className={`mt-0.5 text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${priorityStyles[a.priority]}`}>{a.priority}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-navy">{a.title}</p>
                        <p className="text-sm text-navy/55 leading-snug mt-1">{a.detail}</p>
                      </div>
                      <button className="opacity-0 group-hover:opacity-100 transition-opacity text-xs font-medium text-amber-deep bg-amber/10 px-3 py-1.5 rounded-lg whitespace-nowrap self-center">
                        Do it →
                      </button>
                    </div>
                  ))}
                </div>
              </section>

              {/* Right column */}
              <div className="space-y-6">
                {/* Best time */}
                <section className="bg-white rounded-2xl border border-navy/8 p-6">
                  <h2 className="text-sm font-semibold text-navy/50 uppercase tracking-wide mb-4">Post timing</h2>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-amber/15 flex items-center justify-center">
                      <Clock className="w-6 h-6 text-amber-deep" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-navy">{data.account.bestTimeToPost}</p>
                      <p className="text-xs text-navy/50">best time today</p>
                    </div>
                  </div>
                  <p className="text-sm text-navy/60 mt-4 leading-snug">
                    Audience prefers <span className="font-medium text-navy">{data.account.audiencePrefers}</span>.
                  </p>
                </section>

                {/* Top post */}
                <section className="bg-white rounded-2xl border border-navy/8 p-6">
                  <h2 className="text-sm font-semibold text-navy/50 uppercase tracking-wide mb-4">Your top post</h2>
                  <p className="text-sm font-medium text-navy leading-snug">&ldquo;{data.account.topPost.caption}&rdquo;</p>
                  <div className="flex items-center gap-4 mt-3 text-xs text-navy/60">
                    <span className="flex items-center gap-1"><Eye className="w-3.5 h-3.5" /> {fmt(data.account.topPost.reach)}</span>
                    <span className="flex items-center gap-1"><Bookmark className="w-3.5 h-3.5" /> {fmt(data.account.topPost.saves)}</span>
                    <span className="ml-auto bg-navy/5 px-2 py-0.5 rounded font-medium">{data.account.topPost.format}</span>
                  </div>
                </section>
              </div>
            </div>

            {/* Competitor intelligence */}
            {data.competitors.length > 0 && (
            <section className="bg-white rounded-2xl border border-navy/8 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-navy/50 uppercase tracking-wide">Competitor signals</h2>
                <span className="text-[10px] text-navy/40 bg-navy/5 px-2 py-1 rounded">public data only</span>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                {data.competitors.map((c, i) => (
                  <div key={i} className="border border-navy/8 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-navy text-sm">{c.handle}</span>
                      <span className="text-xs text-navy/50">{c.postsLast7d} posts / 7d</span>
                    </div>
                    <p className="text-sm text-navy/70 leading-snug">
                      Top {c.topFormat}: &ldquo;{c.standoutPost}&rdquo; — {fmt(c.standoutReach)} reach
                    </p>
                    <div className="flex items-start gap-2 mt-3 bg-amber/5 rounded-lg p-2.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-deep shrink-0 mt-0.5" />
                      <span className="text-xs text-navy/70">{c.note}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
            )}
            <p className="text-center text-xs text-navy/30 py-4">
              {data.account.niche === "Your account"
                ? "Connected to your Instagram. Dawn refreshes your briefing every morning."
                : "Dawn refreshes your briefing every morning. This is a live demo on sample data — connect Instagram to see yours."}
            </p>
          </div>
        ) : (
          <div className="p-10 sm:p-20 text-center text-navy/40">Couldn&apos;t load the dashboard. Refresh to try again.</div>
        )}
      </main>
    </DashboardShell>
  );
}
