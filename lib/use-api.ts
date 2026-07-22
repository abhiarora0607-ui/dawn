"use client";

// useApi — the one way components load data.
//
// This exists because the same three-line pattern was copied into ~90 places:
//
//   const [d, setD] = useState(null);
//   fetch(url).then(r => r.json()).then(setD).catch(() => {});
//   ...
//   {d.rows.map(...)}          // ← crashes when the API returned {error}
//
// Two failure modes fell out of that, both real and both found in the audit:
//
//   · The catch swallowed the error and left `d` null forever, so a dropped
//     network showed a spinner that never resolved and never explained itself.
//     57 of these.
//
//   · When the API returned {error} instead of {rows}, the component still did
//     d.rows.map() and white-screened. 74 unguarded accesses, and one of them
//     took My Team down on any server error — the same class as the V41 crash.
//
// The fix isn't 74 guards a person has to remember. It's making the guarded
// path the ONLY path: this hook never hands back a half-loaded object. Either
// data is present, or error is, or it's still loading. There is no fourth
// state where `data` is null but the component renders anyway.

import { useState, useEffect, useCallback, useRef } from "react";

export type ApiState<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
  /** Re-run the request. Safe to pass straight to an onClick. */
  retry: () => void;
};

/**
 * Fetch JSON from an internal endpoint, with loading and error handled once.
 *
 * The component reads `data` only after checking `loading` and `error`, which
 * the standard render shape below makes automatic. A response carrying an
 * `error` field is treated as an error even on a 200 — several routes return
 * `{ error }` with a 200 status, and the old code rendered straight through it.
 */
export function useApi<T = any>(url: string | null, deps: any[] = []): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!url);
  const [nonce, setNonce] = useState(0);

  // Guards against a slow response landing after the component moved on, or
  // after a newer request was fired — the stale-write bug that makes lists
  // flicker back to old data.
  const activeUrl = useRef(url);
  activeUrl.current = url;

  useEffect(() => {
    if (!url) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(url, { cache: "no-store" })
      .then(async (r) => {
        let body: any = null;
        try { body = await r.json(); } catch { /* non-JSON error page */ }
        if (cancelled || activeUrl.current !== url) return;

        if (!r.ok) {
          setError(body?.error || `Something went wrong (${r.status}).`);
          setData(null);
        } else if (body && typeof body === "object" && body.error) {
          // A 200 that still reports an error — treat it as one.
          setError(body.error);
          setData(null);
        } else {
          setData(body as T);
          setError(null);
        }
      })
      .catch(() => {
        if (cancelled) return;
        // The case the old code swallowed: network down, request never
        // completed. Say so, and offer a way out.
        setError("Couldn't reach the server. Check your connection and try again.");
        setData(null);
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, nonce, ...deps]);

  const retry = useCallback(() => setNonce((n) => n + 1), []);
  return { data, error, loading, retry };
}

/**
 * For POST/PATCH/DELETE — an action, not a load. Returns a runner that reports
 * success or a message, so callers stop hand-rolling the same try/catch.
 */
export function useApiAction() {
  const [running, setRunning] = useState(false);

  const run = useCallback(async (
    url: string,
    body: any,
    method: "POST" | "PATCH" | "DELETE" = "POST",
  ): Promise<{ ok: boolean; data?: any; error?: string }> => {
    setRunning(true);
    try {
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      let data: any = null;
      try { data = await r.json(); } catch {}
      if (!r.ok || data?.error) {
        return { ok: false, error: data?.error || `Something went wrong (${r.status}).` };
      }
      return { ok: true, data };
    } catch {
      return { ok: false, error: "Couldn't reach the server. Try again." };
    } finally {
      setRunning(false);
    }
  }, []);

  return { run, running };
}
