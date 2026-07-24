"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DawnLogo } from "@/components/DawnLogo";
import { Loader2, Lock } from "lucide-react";

export default function EmployeeLogin() {
  const router = useRouter();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!loginId || !password) { setError("Enter your login ID and password."); return; }
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/employee-login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ loginId, password }) });
      const d = await res.json();
      if (res.ok) router.push("/dashboard");
      else setError(d.error || "Login failed.");
    } catch { setError("Network error."); }
    setBusy(false);
  }

  return (
    <main className="min-h-screen bg-cream flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8"><DawnLogo className="h-10 mx-auto" /></div>
        <div className="bg-white rounded-2xl border border-navy-line shadow-card p-6">
          <div className="w-11 h-11 rounded-xl bg-amber/15 flex items-center justify-center mb-4"><Lock className="w-5 h-5 text-amber-deep" /></div>
          <h1 className="font-display font-semibold text-xl text-navy">Team sign in</h1>
          <p className="text-muted text-sm mt-1 mb-5">Sign in with the login your admin gave you.</p>

          <div className="space-y-3">
            <input value={loginId} onChange={(e) => setLoginId(e.target.value)} placeholder="Login ID" autoCapitalize="none" className="w-full px-3 py-2.5 rounded-xl border border-navy-line text-sm text-navy focus:outline-none focus:border-amber" />
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="Password" className="w-full px-3 py-2.5 rounded-xl border border-navy-line text-sm text-navy focus:outline-none focus:border-amber" />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button onClick={submit} disabled={busy} className="w-full flex items-center justify-center gap-2 bg-navy text-white font-medium py-3 rounded-xl hover:bg-navy-soft disabled:opacity-60">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Sign in
            </button>
          </div>
        </div>
        <p className="text-center text-xs text-muted mt-4">Business owner? <a href="/dashboard" className="text-amber-deep font-medium">Admin sign in</a></p>
      </div>
    </main>
  );
}
