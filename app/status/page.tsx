"use client";

// A status page so "is Dawn down?" has an answer that isn't a WhatsApp message
// to you at 11pm.

import { useEffect, useState } from "react";
import Link from "next/link";
import { DawnLogo } from "@/components/DawnLogo";
import { PublicFooter } from "@/components/PublicFooter";
import { Loader2, CheckCircle2, XCircle, MinusCircle } from "lucide-react";

const LABELS: Record<string, string> = {
  app: "Dawn app",
  database: "Your business data",
  email: "Email delivery",
  instagram: "Instagram connection",
};

export default function StatusPage() {
  const [d, setD] = useState<any>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch("/api/status").then((r) => r.json()).then(setD).catch(() => setFailed(true));
  }, []);

  return (
    <>
      <main className="min-h-[70vh] bg-cream">
        <header className="h-16 flex items-center px-5 sm:px-6 max-w-3xl mx-auto w-full">
          <Link href="/"><DawnLogo className="h-10" /></Link>
        </header>
        <div className="max-w-2xl mx-auto px-5 py-10">
          <h1 className="font-display font-semibold text-3xl text-navy">Status</h1>

          {failed ? (
            <p className="text-red-600 mt-4">We couldn&apos;t reach Dawn to check. That itself suggests something is wrong — please try again shortly.</p>
          ) : !d ? (
            <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-navy/30" /></div>
          ) : (
            <>
              <p className={`mt-2 font-medium ${d.ok ? "text-emerald-600" : "text-red-600"}`}>
                {d.ok ? "All systems normal" : "Some parts of Dawn are having trouble"}
              </p>
              <div className="dawn-card mt-6 overflow-hidden">
                {Object.entries(d.checks).map(([k, v]: any) => (
                  <div key={k} className="flex items-center justify-between px-4 py-3 border-b border-navy-line/40 last:border-0">
                    <span className="text-navy text-sm">{LABELS[k] || k}</span>
                    <span className="flex items-center gap-1.5 text-sm">
                      {v === "ok" ? <><CheckCircle2 className="w-4 h-4 text-emerald-500" /> <span className="text-emerald-700">Normal</span></>
                        : v === "down" ? <><XCircle className="w-4 h-4 text-red-500" /> <span className="text-red-600">Trouble</span></>
                        : <><MinusCircle className="w-4 h-4 text-navy/25" /> <span className="text-muted">Not configured</span></>}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted mt-4">Checked {new Date(d.at).toLocaleString()}. Refresh for the latest.</p>
            </>
          )}

          <p className="text-sm text-muted mt-8">
            Something wrong that isn&apos;t listed here? <Link href="/contact" className="text-amber-deep underline">Tell us</Link> — include your business name and what you were doing.
          </p>
        </div>
      </main>
      <PublicFooter />
    </>
  );
}
