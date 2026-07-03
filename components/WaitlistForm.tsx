"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";

export default function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("loading");
    setError("");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (res.ok) {
        setState("done");
      } else {
        setState("error");
        setError(data.error || "Something went wrong.");
      }
    } catch {
      setState("error");
      setError("Network error. Try again.");
    }
  }

  if (state === "done") {
    return (
      <div className="mt-8 max-w-md mx-auto flex items-center justify-center gap-3 bg-amber/15 border border-amber/30 rounded-xl px-5 py-4 animate-rise">
        <span className="w-7 h-7 rounded-full bg-amber flex items-center justify-center shrink-0">
          <Check className="w-4 h-4 text-navy" />
        </span>
        <p className="text-white font-medium text-sm">
          You&apos;re on the list. We&apos;ll email you when your briefing is ready.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-8 max-w-md mx-auto">
      <form onSubmit={submit} className="flex flex-col sm:flex-row gap-3">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@brand.com"
          className="flex-1 px-4 py-3 rounded-xl bg-white/10 border border-white/15 text-white placeholder:text-white/40 focus:outline-none focus:border-amber"
        />
        <button
          type="submit"
          disabled={state === "loading"}
          className="bg-amber text-navy font-semibold px-6 py-3 rounded-xl hover:bg-amber-deep hover:text-white transition-colors disabled:opacity-70 flex items-center justify-center gap-2"
        >
          {state === "loading" ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Joining…
            </>
          ) : (
            "Join waitlist"
          )}
        </button>
      </form>
      {state === "error" && <p className="mt-2 text-amber text-xs">{error}</p>}
      <p className="mt-3 text-white/30 text-xs">No spam. Just your spot in line.</p>
    </div>
  );
}
