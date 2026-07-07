"use client";

import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";

export function TrialBanner() {
  const [plan, setPlan] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const t = params.get("trial");
      if (t) {
        document.cookie = `dawn_plan=${t}; max-age=31536000; path=/`;
        setPlan(t);
      } else {
        const m = document.cookie.match(/dawn_plan=(\w+)/);
        if (m) setPlan(m[1]);
      }
      if (document.cookie.includes("dawn_trial_dismissed=1")) setHidden(true);
    } catch {}
  }, []);

  if (!plan || hidden) return null;

  const label = plan.charAt(0).toUpperCase() + plan.slice(1);

  return (
    <div className="bg-navy text-white px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3 text-sm">
      <div className="flex items-center gap-2 min-w-0">
        <Sparkles className="w-4 h-4 text-amber shrink-0" />
        <span className="truncate">
          You&apos;re on the <span className="font-semibold text-amber">{label}</span> free trial — 14 days, all features unlocked.
        </span>
      </div>
      <button
        onClick={() => { try { document.cookie = "dawn_trial_dismissed=1; max-age=604800; path=/"; } catch {}; setHidden(true); }}
        className="text-white/50 hover:text-white shrink-0"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
