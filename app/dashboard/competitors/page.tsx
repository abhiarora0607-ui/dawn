"use client";

import { useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { DashTopbar } from "@/components/DashTopbar";
import { useBrief, fmt } from "@/lib/use-brief";
import { Loader2, Sparkles, Plus, X, Search, TrendingUp } from "lucide-react";

type Result = {
  handle: string; followers?: number | null; posts?: number; avgEngagement?: number;
  topPost?: string; topFormat?: string; insight?: string; error?: string;
};

export default function Competitors() {
  const { data } = useBrief();
  const [handles, setHandles] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [results, setResults] = useState<Result[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function addHandle() {
    const h = input.replace("@", "").trim();
    if (h && !handles.includes(h) && handles.length < 5) {
      setHandles([...handles, h]);
      setInput("");
    }
  }

  async function analyze() {
    if (!handles.length) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/competitors", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handles }),
      });
      const d = await res.json();
      if (res.ok) setResults(d.competitors);
      else setError(d.error || "Analysis failed.");
    } catch {
      setError("Network error. Try again.");
    }
    setLoading(false);
  }

  return (
    <DashboardShell>
      <DashTopbar account={data?.account} pageTitle="Competitors" />
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-navy">Competitor analysis</h1>
          <p className="text-navy/50 text-sm mt-1">Add competitor handles. Dawn analyzes their public data and tells you what&apos;s working.</p>
        </div>

        {/* Add handles */}
        <div className="bg-white rounded-2xl border border-navy/8 p-5">
          <p className="text-xs font-semibold text-navy/50 uppercase tracking-wide mb-3">Add competitors (up to 5)</p>
          <div className="flex gap-2">
            <div className="flex-1 flex items-center gap-2 border border-navy/12 rounded-xl px-3">
              <span className="text-navy/40">@</span>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addHandle()}
                placeholder="competitor_handle"
                className="flex-1 py-3 text-sm text-navy focus:outline-none"
              />
            </div>
            <button onClick={addHandle} className="flex items-center gap-1.5 bg-navy/5 text-navy font-medium px-4 py-3 rounded-xl hover:bg-navy/10 transition-colors">
              <Plus className="w-4 h-4" /> Add
            </button>
          </div>

          {handles.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {handles.map((h) => (
                <span key={h} className="flex items-center gap-1.5 text-sm bg-amber/10 text-navy px-3 py-1.5 rounded-full">
                  @{h}
                  <button onClick={() => setHandles(handles.filter((x) => x !== h))}><X className="w-3.5 h-3.5 text-navy/40 hover:text-navy" /></button>
                </span>
              ))}
            </div>
          )}

          <button
            onClick={analyze}
            disabled={loading || !handles.length}
            className="mt-4 flex items-center gap-2 bg-navy text-white font-medium px-6 py-3 rounded-xl hover:bg-navy-soft transition-colors disabled:opacity-50"
          >
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing…</> : <><Search className="w-4 h-4" /> Analyze competitors</>}
          </button>
          {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
        </div>

        <div className="flex items-start gap-2 text-xs text-navy/50 bg-surface rounded-lg px-4 py-3">
          <span className="bg-navy/5 px-2 py-0.5 rounded font-medium">public data only</span>
          <span>Instagram only exposes public info for business/creator accounts — followers, post count, and public engagement. Private analytics aren&apos;t accessible, and there&apos;s no legal way to auto-discover competitors, so you choose who to track.</span>
        </div>

        {/* Results */}
        {results && (
          <div className="grid md:grid-cols-2 gap-4">
            {results.map((c, i) => (
              <div key={i} className="bg-white rounded-2xl border border-navy/8 p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-semibold text-navy">@{c.handle}</span>
                  {c.followers != null && <span className="text-xs text-navy/50">{fmt(c.followers)} followers</span>}
                </div>
                {c.error ? (
                  <p className="text-sm text-navy/50">{c.error}</p>
                ) : (
                  <>
                    <div className="flex gap-4 text-xs text-navy/60 mb-3">
                      <span>{c.posts} posts</span>
                      <span className="flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5" /> ~{fmt(c.avgEngagement || 0)} avg engagement</span>
                    </div>
                    {c.topPost && (
                      <p className="text-sm text-navy/70 leading-snug mb-3">Top {c.topFormat}: &ldquo;{c.topPost}&rdquo;</p>
                    )}
                    <div className="flex items-start gap-2 bg-amber/5 rounded-lg p-3">
                      <Sparkles className="w-4 h-4 text-amber-deep shrink-0 mt-0.5" />
                      <span className="text-sm text-navy/70">{c.insight}</span>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
