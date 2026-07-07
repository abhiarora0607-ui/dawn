"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Lightbulb, ArrowRight } from "lucide-react";

export function BriefingSuggestions() {
  const [suggestions, setSuggestions] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/suggestions").then((r) => r.json()).then((d) => setSuggestions((d.suggestions || []).slice(0, 3))).catch(() => {});
  }, []);

  if (suggestions.length === 0) return null;

  return (
    <section className="bg-white rounded-2xl border border-navy-line p-5 shadow-card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-amber-deep" />
          <p className="text-xs font-semibold text-navy/50 uppercase tracking-wide">Needs your attention</p>
        </div>
        <Link href="/dashboard/suggestions" className="text-xs font-medium text-amber-deep flex items-center gap-1 hover:gap-1.5 transition-all">
          All suggestions <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
      <div className="space-y-2">
        {suggestions.map((s) => (
          <Link key={s.id} href="/dashboard/suggestions" className="flex items-start gap-2.5 p-2.5 rounded-xl hover:bg-surface transition-colors">
            <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${s.priority === "high" ? "bg-red-400" : s.priority === "medium" ? "bg-amber" : "bg-navy/20"}`} />
            <span className="text-sm text-navy/80 leading-snug">{s.message}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
