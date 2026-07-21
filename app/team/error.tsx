"use client";

// When the portal itself breaks.
//
// Employees reach this screen mid-shift, often needing to punch in. The
// dashboard's boundary offers "try again" and "go home"; here home *is* this
// page, so a failed retry would trap someone in a loop. A sign-out escape
// matters more: a stale session or a half-applied permission change is a
// plausible cause, and signing back in genuinely clears it.

export default function TeamError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  async function signOut() {
    try { await fetch("/api/employee-login", { method: "DELETE" }); } catch {}
    window.location.href = "/team-login";
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-6">
      <div className="dawn-card p-8 max-w-sm w-full text-center">
        <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center mx-auto mb-4 text-2xl">⚠️</div>
        <h1 className="font-semibold text-lg text-navy mb-1">This didn&apos;t load properly</h1>
        <p className="text-sm text-muted mb-5">
          Nothing you&apos;ve recorded is lost. Try again — and if it keeps happening, sign out and back in.
        </p>
        <div className="flex flex-col gap-2">
          <button onClick={reset} className="btn btn-primary w-full">Try again</button>
          <button onClick={signOut} className="btn btn-quiet w-full">Sign out and back in</button>
        </div>
        <p className="t-micro text-muted mt-4">
          Still stuck? Tell your manager — they can check your access.
        </p>
      </div>
    </div>
  );
}
