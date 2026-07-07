"use client";

import { useState } from "react";
import Link from "next/link";
import { DawnLogo } from "@/components/DawnLogo";
import { Loader2, Mail, Check, ArrowRight, Instagram } from "lucide-react";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "sent" | "link">("idle");
  const [link, setLink] = useState("");
  const [error, setError] = useState("");

  async function submit() {
    setError("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError("Enter a valid email."); return; }
    setState("loading");
    try {
      const res = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const d = await res.json();
      if (!res.ok) { setError(d.error || "Something went wrong."); setState("idle"); return; }
      if (d.sent) setState("sent");
      else { setLink(d.link); setState("link"); }
    } catch {
      setError("Network error. Try again."); setState("idle");
    }
  }

  return (
    <main className="min-h-screen bg-cream flex flex-col">
      <header className="h-16 flex items-center px-5 sm:px-6 max-w-6xl mx-auto w-full">
        <Link href="/"><DawnLogo className="h-7" /></Link>
      </header>

      <div className="flex-1 flex items-center justify-center px-5 pb-20">
        <div className="w-full max-w-sm">
          <div className="bg-white rounded-3xl border border-navy-line shadow-card p-7">
            <h1 className="font-display font-semibold text-2xl text-navy mb-1">Sign in to Dawn</h1>
            <p className="text-muted text-sm mb-6">No password. We&apos;ll email you a one-tap sign-in link.</p>

            {state === "sent" ? (
              <div className="text-center py-6">
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto mb-3">
                  <Check className="w-6 h-6 text-emerald-600" />
                </div>
                <p className="font-semibold text-navy">Check your email</p>
                <p className="text-sm text-muted mt-1">We sent a sign-in link to {email}.</p>
              </div>
            ) : state === "link" ? (
              <div className="text-center py-4">
                <div className="w-12 h-12 rounded-2xl bg-amber/15 flex items-center justify-center mx-auto mb-3">
                  <Mail className="w-6 h-6 text-amber-deep" />
                </div>
                <p className="font-semibold text-navy mb-2">Your sign-in link</p>
                <p className="text-xs text-muted mb-3">Email delivery isn&apos;t set up yet, so here&apos;s your link directly:</p>
                <a href={link} className="inline-flex items-center gap-2 bg-navy text-white font-medium px-5 py-3 rounded-xl hover:bg-navy-soft transition-colors text-sm">
                  Continue to Dawn <ArrowRight className="w-4 h-4" />
                </a>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 border border-navy-line rounded-xl px-3 mb-3 focus-within:border-amber">
                  <Mail className="w-4 h-4 text-navy/40" />
                  <input
                    type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submit()}
                    placeholder="you@business.com"
                    className="flex-1 py-3 text-sm text-navy focus:outline-none bg-transparent"
                  />
                </div>
                {error && <p className="text-red-500 text-sm mb-2">{error}</p>}
                <button onClick={submit} disabled={state === "loading"} className="w-full flex items-center justify-center gap-2 bg-navy text-white font-medium py-3 rounded-xl hover:bg-navy-soft transition-colors disabled:opacity-60">
                  {state === "loading" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Email me a link"}
                </button>

                <div className="flex items-center gap-3 my-5">
                  <div className="flex-1 h-px bg-navy-line" /><span className="text-xs text-muted">or</span><div className="flex-1 h-px bg-navy-line" />
                </div>

                <a href="/api/instagram/connect" className="w-full flex items-center justify-center gap-2 border border-navy-line text-navy font-medium py-3 rounded-xl hover:border-navy/30 transition-colors">
                  <Instagram className="w-4 h-4" /> Continue with Instagram
                </a>
              </>
            )}
          </div>
          <p className="text-center text-xs text-muted mt-4">
            Dawn works with or without Instagram. Your business data stays private to you.
          </p>
        </div>
      </div>
    </main>
  );
}
