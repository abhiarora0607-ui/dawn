"use client";

// The one-tap mood pulse. Sits quietly at the bottom of the dashboard; one
// answer per session, optional note, straight to the operator.

import { useState } from "react";
import { Check } from "lucide-react";

export function FeedbackPulse() {
  const [sent, setSent] = useState(false);
  const [mood, setMood] = useState("");
  const [note, setNote] = useState("");

  async function send(m: string) {
    setMood(m);
    if (m === "happy") { await post(m, ""); return; }
  }
  async function post(m: string, n: string) {
    await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mood: m, note: n }) }).catch(() => {});
    setSent(true);
  }

  if (sent) return <p className="text-center text-xs text-muted py-2 flex items-center justify-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-500" /> Thanks — this genuinely shapes Dawn.</p>;

  return (
    <div className="text-center py-2">
      <span className="text-xs text-muted mr-2">How&apos;s Dawn working for you?</span>
      {[["sad", "😞"], ["neutral", "😐"], ["happy", "😍"]].map(([m, e]) => (
        <button key={m} onClick={() => send(m)} className={`text-lg mx-1 transition-transform hover:scale-125 ${mood && mood !== m ? "opacity-30" : ""}`}>{e}</button>
      ))}
      {(mood === "sad" || mood === "neutral") && (
        <span className="inline-flex items-center gap-1.5 ml-2">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What would make it better?" className="text-xs border border-navy-line rounded-lg px-2.5 py-1.5 w-52 focus:outline-none focus:border-amber" />
          <button onClick={() => post(mood, note)} className="text-xs font-medium bg-navy text-white px-3 py-1.5 rounded-lg">Send</button>
        </span>
      )}
    </div>
  );
}
