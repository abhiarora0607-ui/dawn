"use client";

// The front door.
//
// V30 redesign. The old version was a bare email box that never said what Dawn
// was and buried Instagram — the primary path and the identity spine — below
// the fold as an afterthought. This version leads with Instagram, explains the
// product in one line, shows both halves, states the trial terms pulled live
// from billing settings, and is honest at the consent moment about what Dawn
// reads and what it never touches.

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { DawnLogo } from "@/components/DawnLogo";
import { Loader2, Mail, Check, ArrowRight, Instagram, ShieldCheck, AlertCircle, Contact, Sparkles } from "lucide-react";

export default function SignIn() {
  return (
    <main className="min-h-screen bg-cream flex flex-col">
      <header className="h-16 flex items-center justify-between px-5 sm:px-6 max-w-5xl mx-auto w-full">
        <Link href="/"><DawnLogo className="h-10" /></Link>
        <Link href="/pricing" className="text-sm font-medium text-navy/60 hover:text-navy">Pricing</Link>
      </header>
      <Suspense fallback={<div className="flex-1 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-navy/30" /></div>}>
        <SignInBody />
      </Suspense>
      <footer className="py-8 px-5">
        <p className="text-center text-[11px] text-muted">
          <Link href="/privacy" className="hover:text-navy">Privacy</Link>
          <span className="mx-2">·</span>
          <Link href="/terms" className="hover:text-navy">Terms</Link>
          <span className="mx-2">·</span>
          <Link href="/security" className="hover:text-navy">Security</Link>
          <span className="mx-2">·</span>
          <Link href="/contact" className="hover:text-navy">Help</Link>
        </p>
      </footer>
    </main>
  );
}

function SignInBody() {
  const params = useSearchParams();
  const oauthError = params?.get("error");

  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "sent" | "link">("idle");
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const [showEmail, setShowEmail] = useState(false);
  const [trialDays, setTrialDays] = useState<number | null>(null);

  useEffect(() => {
    // Trial length is operator-editable — never hardcode it in marketing copy.
    fetch("/api/public-plans").then((r) => r.json()).then((d) => setTrialDays(d?.trialDays ?? null)).catch(() => {});
  }, []);

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
    <div className="flex-1 flex items-center justify-center px-5 py-8">
      <div className="w-full max-w-md">

        {/* What this is — a cold visitor should know in one line */}
        <div className="text-center mb-6">
          <h1 className="font-display font-semibold text-[26px] sm:text-3xl text-navy leading-tight">
            Run your Instagram business<br className="hidden sm:block" /> in one place
          </h1>
          <p className="text-muted text-sm mt-2 max-w-sm mx-auto">
            A daily AI plan for your account, and a CRM for your leads, orders and money.
          </p>
        </div>

        {/* The two halves, stated plainly */}
        <div className="grid grid-cols-2 gap-2 mb-5">
          <div className="bg-white/70 border border-navy-line rounded-xl px-3 py-2.5">
            <Sparkles className="w-4 h-4 text-amber-deep mb-1" />
            <p className="text-[13px] font-semibold text-navy leading-tight">Instagram &amp; AI</p>
            <p className="text-[11px] text-muted leading-snug mt-0.5">Briefings, ideas, captions</p>
          </div>
          <div className="bg-white/70 border border-navy-line rounded-xl px-3 py-2.5">
            <Contact className="w-4 h-4 text-amber-deep mb-1" />
            <p className="text-[13px] font-semibold text-navy leading-tight">CRM &amp; Business</p>
            <p className="text-[11px] text-muted leading-snug mt-0.5">Leads, orders, money, team</p>
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-navy-line shadow-card p-6 sm:p-7">

          {/* An OAuth round-trip that fails used to dead-end silently */}
          {oauthError && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 mb-4">
              <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-[13px] text-red-700">
                Instagram sign-in didn&apos;t complete. That usually means the connection was cancelled or the account isn&apos;t a professional one. Try again, or use email below.
              </p>
            </div>
          )}

          {state === "sent" ? (
            <div className="text-center py-6">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto mb-3">
                <Check className="w-6 h-6 text-emerald-600" />
              </div>
              <p className="font-semibold text-navy">Check your email</p>
              <p className="text-sm text-muted mt-1">We sent a sign-in link to {email}.</p>
              <button onClick={() => { setState("idle"); setShowEmail(true); }} className="text-xs text-muted underline mt-4">Use a different email</button>
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
              {/* PRIMARY: Instagram — the identity spine, not an afterthought */}
              <a
                href="/api/instagram/connect"
                className="w-full flex items-center justify-center gap-2.5 bg-navy text-white font-semibold py-3.5 rounded-2xl hover:bg-navy-soft transition-colors"
              >
                <Instagram className="w-[18px] h-[18px] text-amber" /> Continue with Instagram
              </a>
              <p className="text-[11px] text-muted text-center mt-2">
                Uses Instagram&apos;s own login — we never see your password.
              </p>

              {/* Honest about the permission moment */}
              <div className="flex items-start gap-2 bg-surface rounded-xl px-3 py-2.5 mt-3">
                <ShieldCheck className="w-4 h-4 text-navy/40 mt-0.5 shrink-0" />
                <p className="text-[11px] text-navy/60 leading-relaxed">
                  Dawn reads your professional account&apos;s profile, posts and insights to build your daily briefing. Your CRM data stays private to your business, and you can export or delete everything at any time.
                </p>
              </div>

              <div className="flex items-center gap-3 my-5">
                <div className="flex-1 h-px bg-navy-line" />
                <span className="text-xs text-muted">or</span>
                <div className="flex-1 h-px bg-navy-line" />
              </div>

              {/* SECONDARY: email magic link */}
              {!showEmail ? (
                <button onClick={() => setShowEmail(true)} className="w-full flex items-center justify-center gap-2 border border-navy-line text-navy font-medium py-3 rounded-2xl hover:border-navy/30 transition-colors">
                  <Mail className="w-4 h-4 text-navy/50" /> Continue with email
                </button>
              ) : (
                <>
                  <div className="flex items-center gap-2 border border-navy-line rounded-xl px-3 mb-2.5 focus-within:border-amber">
                    <Mail className="w-4 h-4 text-navy/40" />
                    <input
                      type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && submit()}
                      placeholder="you@business.com" autoFocus
                      className="flex-1 py-3 text-sm text-navy focus:outline-none bg-transparent"
                    />
                  </div>
                  {error && <p className="text-red-500 text-sm mb-2">{error}</p>}
                  <button onClick={submit} disabled={state === "loading"} className="w-full flex items-center justify-center gap-2 border border-navy-line text-navy font-medium py-3 rounded-2xl hover:border-navy/30 transition-colors disabled:opacity-60">
                    {state === "loading" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Email me a sign-in link"}
                  </button>
                  <p className="text-[11px] text-muted text-center mt-2">No password — we email you a one-tap link.</p>
                </>
              )}
            </>
          )}
        </div>

        {/* Trial terms, live from billing settings */}
        <p className="text-center text-xs text-muted mt-4">
          {trialDays ? `${trialDays} days free · no card needed · cancel any time` : "Free trial · no card needed · cancel any time"}
        </p>
      </div>
    </div>
  );
}
