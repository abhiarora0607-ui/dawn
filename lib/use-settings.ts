// lib/use-settings.ts
"use client";

import { useEffect, useState } from "react";

const DEFAULT_STAGES = ["New Lead", "Contacted", "Negotiating", "Customer (Won)", "Lost"];

export type BizSettings = {
  currency: string;
  stage_names: string[];
  business_name?: string;
};

let cache: BizSettings | null = null;

// Clear the cached settings (call after saving settings so other mounted
// pages pick up changes without a full reload).
export function invalidateSettingsCache() { cache = null; }

export function useSettings() {
  const [settings, setSettings] = useState<BizSettings>(cache || { currency: "₹", stage_names: DEFAULT_STAGES });
  const [loaded, setLoaded] = useState(!!cache);

  useEffect(() => {
    if (cache) return;
    fetch("/api/settings").then((r) => r.json()).then((d) => {
      const s = d.settings || {};
      const resolved: BizSettings = {
        currency: s.currency || "₹",
        // Pipeline stages are FIXED product-wide. Stored renames are ignored
        // so every business (and every employee) sees the same stable stages.
        stage_names: DEFAULT_STAGES,
        business_name: s.business_name,
      };
      cache = resolved;
      setSettings(resolved);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  return { settings, loaded, currency: settings.currency, stages: settings.stage_names };
}

// The "won" stage is always the 4th (index 3) even if renamed.
export function wonStage(stages: string[]) { return stages[3] || "Customer (Won)"; }
export function lostStage(stages: string[]) { return stages[4] || "Lost"; }

// Format money with the user's currency symbol.
export function money(n: number, currency = "₹") {
  const v = Number(n) || 0;
  if (v >= 100000) return `${currency}${(v / 100000).toFixed(1)}L`;
  if (v >= 1000) return `${currency}${(v / 1000).toFixed(1)}k`;
  return `${currency}${v}`;
}
