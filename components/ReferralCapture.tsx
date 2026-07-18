"use client";

// Captures ?ref=<code> from a "Powered by Dawn" link and remembers it in a
// cookie until signup, so the referring business gets credited. No tracking
// beyond this one code — no third-party analytics, no fingerprinting.

import { useEffect } from "react";

export function ReferralCapture() {
  useEffect(() => {
    try {
      const ref = new URLSearchParams(window.location.search).get("ref");
      if (ref && /^[A-Za-z0-9_-]{2,40}$/.test(ref)) {
        document.cookie = `dawn_ref=${encodeURIComponent(ref)}; path=/; max-age=${60 * 60 * 24 * 60}; SameSite=Lax`;
      }
    } catch { /* never break the page for analytics */ }
  }, []);
  return null;
}
