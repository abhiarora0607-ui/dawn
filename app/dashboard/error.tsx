"use client";

// Section-level recovery: if a single dashboard page throws, the user gets a
// tidy retry card instead of the whole app blanking.

export default function DashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="dawn-card p-8 max-w-sm w-full text-center">
        <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center mx-auto mb-4 text-2xl">⚠️</div>
        <h1 className="font-semibold text-lg text-navy mb-1">This page hit a snag</h1>
        <p className="text-sm text-muted mb-5">Your data is safe. Try loading it again.</p>
        <div className="flex gap-2">
          <button onClick={() => reset()} className="flex-1 bg-navy text-white font-medium py-2.5 rounded-xl text-sm">Try again</button>
          <a href="/dashboard/business" className="flex-1 border border-navy-line text-navy font-medium py-2.5 rounded-xl text-sm">Dashboard</a>
        </div>
      </div>
    </div>
  );
}
