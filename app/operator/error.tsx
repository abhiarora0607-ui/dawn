"use client";

// The operator console's own boundary.
//
// This one is for us rather than a customer, so it shows the error digest —
// when something breaks here, the useful thing is the identifier that ties it
// to a log line, not reassurance.

export default function OperatorError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-6">
      <div className="dawn-card p-8 max-w-md w-full text-center">
        <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center mx-auto mb-4 text-2xl">⚠️</div>
        <h1 className="font-semibold text-lg text-navy mb-1">Operator console error</h1>
        <p className="text-sm text-muted mb-4">This view failed to render.</p>
        {error?.digest && (
          <p className="t-micro text-muted font-mono bg-surface rounded-lg px-3 py-2 mb-4 break-all">
            {error.digest}
          </p>
        )}
        <div className="flex gap-2">
          <button onClick={reset} className="btn btn-primary flex-1">Try again</button>
          <a href="/operator" className="btn btn-quiet flex-1">Back to Today</a>
        </div>
      </div>
    </div>
  );
}
