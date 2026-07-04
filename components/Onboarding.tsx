"use client";

import { useState, useEffect } from "react";
import { Sunrise, Instagram, Mic, Sparkles, ArrowRight, Check, X } from "lucide-react";

type Account = { niche: string } | undefined;

export function Onboarding({ account }: { account: Account }) {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    // Show only if not previously dismissed this session/local
    try {
      const seen = document.cookie.includes("dawn_onboarded=1");
      if (!seen) setDismissed(false);
    } catch {}
  }, []);

  function close() {
    setDismissed(true);
    try { document.cookie = "dawn_onboarded=1; max-age=31536000; path=/"; } catch {}
  }

  if (dismissed) return null;

  const connected = account?.niche === "Your account";

  const steps = [
    {
      icon: Instagram,
      title: "Connect your Instagram",
      body: "Link your Business or Creator account so Dawn can read your real numbers and posts.",
      done: connected,
      cta: connected ? null : { label: "Connect Instagram", href: "/api/instagram/connect" },
    },
    {
      icon: Mic,
      title: "Teach Dawn your voice",
      body: "Let Dawn analyze your account to learn your style — or set it yourself. Everything it writes will sound like you.",
      done: false,
      cta: { label: "Set brand voice", href: "/dashboard/brand-voice" },
    },
    {
      icon: Sparkles,
      title: "Get your daily briefing",
      body: "Every morning, Dawn tells you what changed and exactly what to do. That's your home screen.",
      done: false,
      cta: null,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-navy/50 backdrop-blur-sm" onClick={close} />
      <div className="relative bg-cream rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-rise">
        <div className="bg-navy px-6 py-7 text-center relative">
          <button onClick={close} className="absolute top-4 right-4 text-white/50 hover:text-white"><X className="w-5 h-5" /></button>
          <div className="w-14 h-14 rounded-2xl bg-amber flex items-center justify-center mx-auto mb-3">
            <Sunrise className="w-7 h-7 text-navy" />
          </div>
          <h2 className="font-display font-semibold text-2xl text-white">Welcome to Dawn</h2>
          <p className="text-white/60 text-sm mt-1">Three quick steps to your first briefing.</p>
        </div>

        <div className="p-5 space-y-3">
          {steps.map((s, i) => (
            <div key={i} className={`flex items-start gap-3 p-4 rounded-2xl border ${s.done ? "border-emerald-200 bg-emerald-50/50" : "border-navy-line bg-white"}`}>
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${s.done ? "bg-emerald-100" : "bg-amber/15"}`}>
                {s.done ? <Check className="w-5 h-5 text-emerald-600" /> : <s.icon className="w-5 h-5 text-amber-deep" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-navy">{s.title}</p>
                <p className="text-xs text-muted leading-snug mt-0.5">{s.body}</p>
                {s.cta && (
                  <a href={s.cta.href} className="inline-flex items-center gap-1 text-xs font-semibold text-amber-deep mt-2 hover:gap-1.5 transition-all">
                    {s.cta.label} <ArrowRight className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            </div>
          ))}
          <button onClick={close} className="w-full text-sm font-medium text-muted hover:text-navy py-2">
            I&apos;ll explore on my own
          </button>
        </div>
      </div>
    </div>
  );
}
