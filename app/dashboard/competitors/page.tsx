"use client";

import { DashboardShell } from "@/components/DashboardShell";
import { DashTopbar } from "@/components/DashTopbar";
import { useBrief, fmt } from "@/lib/use-brief";
import { Loader2, Sparkles, Users } from "lucide-react";

export default function Competitors() {
  const { data, loading } = useBrief();

  return (
    <DashboardShell>
      <DashTopbar account={data?.account} pageTitle="Competitors" />
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-navy">Competitor signals</h1>
          <p className="text-navy/50 text-sm mt-1">What similar accounts are publicly doing — and what to learn from it.</p>
        </div>

        {loading ? (
          <div className="p-20 flex items-center justify-center text-navy/40"><Loader2 className="w-6 h-6 animate-spin mr-3" /> Scanning competitors…</div>
        ) : data && data.competitors.length > 0 ? (
          <>
            <div className="flex items-center gap-2 text-xs text-navy/50 bg-white border border-navy/8 rounded-lg px-4 py-3">
              <span className="bg-navy/5 px-2 py-0.5 rounded font-medium">public data only</span>
              <span>Instagram only exposes public signals for accounts you don&apos;t own — post cadence, hooks, and public engagement. We never access their private analytics.</span>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              {data.competitors.map((c, i) => (
                <div key={i} className="bg-white rounded-2xl border border-navy/8 p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-semibold text-navy">{c.handle}</span>
                    <span className="text-xs text-navy/50">{c.postsLast7d} posts / 7d</span>
                  </div>
                  <p className="text-sm text-navy/70 leading-snug">
                    Top {c.topFormat}: &ldquo;{c.standoutPost}&rdquo; — {fmt(c.standoutReach)} reach
                  </p>
                  <div className="flex items-start gap-2 mt-4 bg-amber/5 rounded-lg p-3">
                    <Sparkles className="w-4 h-4 text-amber-deep shrink-0 mt-0.5" />
                    <span className="text-sm text-navy/70">{c.note}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="bg-white rounded-2xl border border-navy/8 p-12 text-center">
            <div className="w-14 h-14 rounded-2xl bg-amber/15 flex items-center justify-center mx-auto mb-4">
              <Users className="w-7 h-7 text-amber-deep" />
            </div>
            <h2 className="text-lg font-semibold text-navy mb-2">Add competitors to track</h2>
            <p className="text-navy/55 text-sm max-w-md mx-auto">
              Dawn monitors what similar accounts publicly post — their cadence, hooks, and top content — so you always know what&apos;s working in your niche. Competitor tracking activates once your account is connected and you add handles to watch.
            </p>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
