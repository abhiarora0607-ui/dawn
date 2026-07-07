"use client";

import { useEffect, useState } from "react";

export type BriefAction = { priority: "high" | "medium" | "low"; title: string; detail: string };
export type Brief = { greeting: string; headline: string; wins: string[]; watch: string[]; actions: BriefAction[]; source: "ai" | "rules" };
export type Account = {
  handle: string; displayName: string; niche: string;
  followers: number; followersChange: number; reach: number; reachChangePct: number;
  profileVisits: number; engagementRate: number; responseRatePct: number; pendingDMs: number;
  topPost: { caption: string; format: string; reach: number; saves: number };
  worstPost: { caption: string; format: string; reach: number };
  audiencePrefers: string; bestTimeToPost: string;
};
export type Competitor = { handle: string; postsLast7d: number; topFormat: string; standoutPost: string; standoutReach: number; note: string };
export type Payload = { brief: Brief; account: Account; competitors: Competitor[]; fallback?: boolean; cached?: boolean };

export function useBrief() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/brief").then((r) => r.json()).then((d) => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);
  return { data, loading };
}

export function fmt(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;
}
