"use client";

// One place that decides what "loading", "failed" and "empty" look like.
//
// Before this, each of ~90 fetch sites invented its own — some showed a
// spinner, some showed nothing, most showed nothing on error because the error
// was swallowed. This makes the three states consistent and, more importantly,
// makes the failure state impossible to skip: a component wrapped in ApiState
// literally cannot render its children while data is null.

import { Loader2, AlertTriangle } from "lucide-react";
import type { ApiState as ApiStateType } from "@/lib/use-api";

export function ApiGate<T>({
  state,
  children,
  loadingLabel,
  emptyWhen,
  empty,
}: {
  state: ApiStateType<T>;
  children: (data: T) => React.ReactNode;
  loadingLabel?: string;
  /** Treat a successful-but-empty response as its own state. */
  emptyWhen?: (data: T) => boolean;
  empty?: React.ReactNode;
}) {
  if (state.loading) {
    return (
      <div className="py-16 flex flex-col items-center justify-center gap-2 text-navy/40">
        <Loader2 className="w-6 h-6 animate-spin" />
        {loadingLabel && <p className="t-small">{loadingLabel}</p>}
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="dawn-card p-6 text-center max-w-sm mx-auto my-6">
        <span className="w-11 h-11 rounded-2xl bg-amber-100 flex items-center justify-center mx-auto mb-3">
          <AlertTriangle className="w-5 h-5 text-amber-deep" />
        </span>
        <p className="font-semibold text-navy text-sm">Couldn&apos;t load this</p>
        <p className="t-small text-muted mt-1">{state.error}</p>
        <button onClick={state.retry} className="btn btn-quiet btn-sm mt-4">Try again</button>
      </div>
    );
  }

  if (state.data == null) return null;   // shouldn't happen — the hook forbids it — but never render null.map()

  if (emptyWhen && emptyWhen(state.data)) {
    return <>{empty ?? <p className="dawn-empty">Nothing here yet.</p>}</>;
  }

  return <>{children(state.data)}</>;
}
