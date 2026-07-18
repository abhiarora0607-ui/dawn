"use client";

// One auth gate for all five operator tabs. Each tab renders inside this, so
// the login screen and the tab chrome live in exactly one place.

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { OperatorTabs } from "@/components/OperatorTabs";

export function OperatorGate({ children, testMode }: { children: React.ReactNode; testMode?: boolean }) {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/operator/overview").then((r) => setAuthed(r.status !== 401)).catch(() => setAuthed(false));
  }, []);

  if (authed === null) {
    return <div className="min-h-screen dawn-app-bg flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-navy/30" /></div>;
  }
  if (!authed) return <div className="min-h-screen dawn-app-bg"><Login onDone={() => setAuthed(true)} /></div>;

  return (
    <div className="min-h-screen dawn-app-bg">
      <OperatorTabs testMode={testMode} />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-5">{children}</div>
    </div>
  );
}

function Login({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setErr(""); setBusy(true);
    const res = await fetch("/api/operator/auth", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, passphrase }),
    });
    if (res.ok) { onDone(); return; }
    const data = await res.json().catch(() => ({}));
    setErr(data.error || "Couldn't sign in."); setBusy(false);
  }

  return (
    <div className="max-w-sm mx-auto pt-24 px-4">
      <div className="dawn-card p-6">
        <h1 className="font-display font-semibold text-xl text-navy mb-1">Operator</h1>
        <p className="text-sm text-muted mb-5">Dawn&apos;s owner console. This door is yours alone.</p>
        <div className="space-y-3">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your email" className="w-full px-3 py-2.5 rounded-xl border border-navy-line text-sm text-navy focus:outline-none focus:border-amber" />
          <input type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="Passphrase" className="w-full px-3 py-2.5 rounded-xl border border-navy-line text-sm text-navy focus:outline-none focus:border-amber" />
          {err && <p className="text-sm text-red-600">{err}</p>}
          <button onClick={submit} disabled={busy} className="w-full flex items-center justify-center gap-2 bg-navy text-white font-medium py-3 rounded-xl hover:bg-navy-soft disabled:opacity-60">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Enter
          </button>
        </div>
      </div>
    </div>
  );
}
