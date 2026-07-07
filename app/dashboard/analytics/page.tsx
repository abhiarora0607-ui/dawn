"use client";

import { DashboardShell } from "@/components/DashboardShell";
import { DashTopbar } from "@/components/DashTopbar";
import { useBrief, fmt } from "@/lib/use-brief";
import { Loader2, TrendingUp, Eye, Users, Target, Bookmark, Trophy } from "lucide-react";

function Bar({ label, value, max, sub }: { label: string; value: number; max: number; sub?: string }) {
  const pct = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 4;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-navy/60 w-28 shrink-0 truncate">{label}</span>
      <div className="flex-1 bg-navy/5 rounded-full h-6 overflow-hidden">
        <div className="h-full bg-gradient-to-r from-amber to-amber-deep rounded-full flex items-center justify-end pr-2" style={{ width: `${pct}%` }}>
          <span className="text-[10px] font-semibold text-white">{fmt(value)}</span>
        </div>
      </div>
      {sub && <span className="text-[10px] text-navy/40 w-14 shrink-0">{sub}</span>}
    </div>
  );
}

export default function Analytics() {
  const { data, loading } = useBrief();

  return (
    <DashboardShell>
      <DashTopbar account={data?.account} pageTitle="Analytics" />
      {loading ? (
        <div className="p-10 sm:p-20 flex items-center justify-center text-navy/40"><Loader2 className="w-6 h-6 animate-spin mr-3" /> Crunching your numbers…</div>
      ) : data ? (
        <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
          <div>
            <h1 className="font-display font-semibold text-2xl text-navy">Analytics</h1>
            <p className="text-navy/50 text-sm mt-1">How your account is performing right now.</p>
          </div>

          {/* KPI grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Reach", value: fmt(data.account.reach), icon: Eye, chg: data.account.reachChangePct, unit: "%" },
              { label: "Followers", value: data.account.followers.toLocaleString(), icon: Users, chg: data.account.followersChange, invert: true },
              { label: "Profile visits", value: fmt(data.account.profileVisits), icon: Target },
              { label: "Engagement", value: `${data.account.engagementRate}%`, icon: TrendingUp },
            ].map((k) => (
              <div key={k.label} className="bg-white rounded-xl border border-navy/8 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-navy/50">{k.label}</span>
                  <k.icon className="w-4 h-4 text-navy/30" />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-navy">{k.value}</span>
                  {k.chg !== undefined && (
                    <span className={`text-xs font-semibold ${(k.invert ? k.chg < 0 : k.chg > 0) ? "text-emerald-600" : "text-red-500"}`}>
                      {k.chg > 0 ? "+" : ""}{k.chg}{k.unit || ""}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Content performance */}
          <section className="bg-white rounded-2xl border border-navy/8 p-6">
            <h2 className="text-sm font-semibold text-navy/50 uppercase tracking-wide mb-5">Content performance</h2>
            <div className="space-y-3">
              <Bar label="Top post" value={data.account.topPost.reach} max={data.account.topPost.reach} sub={data.account.topPost.format} />
              <Bar label="Worst post" value={data.account.worstPost.reach} max={data.account.topPost.reach} sub={data.account.worstPost.format} />
            </div>
            <div className="grid sm:grid-cols-2 gap-4 mt-6">
              <div className="border border-navy/8 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2"><Trophy className="w-4 h-4 text-amber-deep" /><span className="text-xs font-semibold text-navy/50 uppercase">Best</span></div>
                <p className="text-sm font-medium text-navy leading-snug">&ldquo;{data.account.topPost.caption}&rdquo;</p>
                <div className="flex gap-4 mt-2 text-xs text-navy/60">
                  <span className="flex items-center gap-1"><Eye className="w-3.5 h-3.5" /> {fmt(data.account.topPost.reach)}</span>
                  <span className="flex items-center gap-1"><Bookmark className="w-3.5 h-3.5" /> {fmt(data.account.topPost.saves)}</span>
                </div>
              </div>
              <div className="border border-navy/8 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2"><span className="text-xs font-semibold text-navy/50 uppercase">Needs work</span></div>
                <p className="text-sm font-medium text-navy leading-snug">&ldquo;{data.account.worstPost.caption}&rdquo;</p>
                <p className="text-xs text-navy/60 mt-2">{data.account.worstPost.format} · {fmt(data.account.worstPost.reach)} reach</p>
              </div>
            </div>
          </section>

          {/* Insight */}
          <section className="bg-navy rounded-2xl p-6 text-white">
            <h2 className="text-xs font-semibold text-amber uppercase tracking-wide mb-3">What this means</h2>
            <p className="text-white/85 leading-relaxed">
              Your audience currently prefers <span className="font-semibold text-amber">{data.account.audiencePrefers}</span>.
              Your engagement rate is {data.account.engagementRate}%. Lean into your best-performing format and post around {data.account.bestTimeToPost} to compound reach.
            </p>
          </section>

          <p className="text-center text-xs text-navy/30 py-4">
            {data.account.niche === "Your account" ? "Live data from your connected Instagram." : "Connect your Instagram to see your own analytics."}
          </p>
        </div>
      ) : (
        <div className="p-10 sm:p-20 text-center text-navy/40">Couldn&apos;t load analytics. Refresh to try again.</div>
      )}
    </DashboardShell>
  );
}
