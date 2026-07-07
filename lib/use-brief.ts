"use client";

import { useEffect, useState } from "react";

export type BriefAction = { priority: "high" | "medium" | "low"; title: string; detail: string };
export type Brief = { greeting: string; headline: string; wins: string[]; watch: string[]; actions: BriefAction[]; source: "ai" | "rules" };
export type Account = {
  handle: string; displayName: string; niche: string;
  followers: number; followersChange: number; reach: number; reachChangePct: number;
  profileVisits: number; engagementRate: number; responseRatePct: number; pendingDMs: number;
  websiteClicks?: number; totalSaves?: number;
  topPost: { caption: string; format: string; reach: number; saves: number };
  worstPost: { caption: string; format: string; reach: number };
  audiencePrefers: string; bestTimeToPost: string;
};
export type Competitor = { handle: string; postsLast7d: number; topFormat: string; standoutPost: string; standoutReach: number; note: string };
export type Payload = { brief: Brief; account: Account; competitors: Competitor[]; fallback?: boolean; cached?: boolean };

export function useBrief() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  function load() {
    setLoading(true);
    setError(false);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000); // never hang past 25s
    fetch("/api/brief", { signal: controller.signal })
      .then((r) => r.json())
      .then((d) => {
        clearTimeout(timeout);
        if (d?.error) { setError(true); setLoading(false); }
        else { setData(d); setLoading(false); }
      })
      .catch(() => { clearTimeout(timeout); setError(true); setLoading(false); });
  }

  useEffect(() => { load(); }, []);
  return { data, loading, error, reload: load };
}

export function fmt(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;
}
