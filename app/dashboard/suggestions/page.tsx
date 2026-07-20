"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardShell } from "@/components/DashboardShell";
import { DashTopbar } from "@/components/DashTopbar";
import { useBrief } from "@/lib/use-brief";
import { ToastProvider, useToast } from "@/components/Toast";
import { ConvertModal } from "@/components/ConvertModal";
import { Loader2, Lightbulb, Check, X, MessageCircle, ShoppingBag, Clock, RotateCcw, AlertCircle } from "lucide-react";

type Suggestion = { id: string; type: string; message: string; contactId?: string; priority: string; phone?: string };

const typeIcon: Record<string, any> = {
  payment_proof: ShoppingBag, stale_lead: Clock, pending_payment: AlertCircle, win_back: RotateCcw, follow_up: MessageCircle,
};
const priColor: Record<string, string> = {
  high: "border-l-red-400", medium: "border-l-amber", low: "border-l-navy/20",
};

function SuggestionsInner() {
  const { data } = useBrief();
  const { toast } = useToast();
  const router = useRouter();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [convert, setConvert] = useState<any>(null);

  function load() {
    fetch("/api/suggestions").then((r) => r.json()).then((d) => { setSuggestions(d.suggestions || []); setLoading(false); }).catch(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  async function mark(id: string, status: string) {
    setSuggestions((s) => s.filter((x) => x.id !== id));
    await fetch("/api/suggestions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
  }

  async function accept(s: Suggestion) {
    if (s.type === "payment_proof" && s.contactId) {
      // Open convert modal pre-filled
      const c = await (await fetch(`/api/contacts/${s.contactId}`)).json();
      if (c.contact) setConvert(c.contact);
      mark(s.id, "accepted");
      return;
    }
    if ((s.type === "stale_lead" || s.type === "follow_up" || s.type === "pending_payment" || s.type === "win_back")) {
      if (s.phone) {
        const wa = s.phone.replace(/[^0-9]/g, "");
        let msg = "Hi! Just following up.";
        if (s.type === "pending_payment") msg = "Hi! Just a gentle reminder about the pending balance. Let me know if you have any questions.";
        if (s.type === "win_back") msg = "Hi! It's been a while — we'd love to have you back. Anything we can help with?";
        window.open(`https://wa.me/${wa}?text=${encodeURIComponent(msg)}`, "_blank");
      } else if (s.contactId) {
        router.push(`/dashboard/contacts/${s.contactId}`);
      }
      mark(s.id, "accepted");
      return;
    }
    if (s.contactId) router.push(`/dashboard/contacts/${s.contactId}`);
    mark(s.id, "accepted");
  }

  return (
    <DashboardShell>
      <DashTopbar account={data?.account} pageTitle="Suggestions" />
      <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-5">
        <div>
          <h1 className="font-display font-semibold text-2xl text-navy">Suggestions</h1>
          <p className="text-muted text-sm mt-1">What to do next — Dawn watches your pipeline so you don&apos;t have to.</p>
        </div>

        {loading ? (
          <div className="p-12 flex items-center justify-center text-muted"><Loader2 className="w-6 h-6 animate-spin mr-3" /> Checking your pipeline…</div>
        ) : suggestions.length === 0 ? (
          <div className="dawn-card p-12 text-center shadow-card">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4"><Check className="w-7 h-7 text-emerald-600" /></div>
            <h2 className="text-lg font-semibold text-navy mb-2">You&apos;re all caught up</h2>
            <p className="text-muted text-sm max-w-sm mx-auto">No follow-ups, pending payments, or stale leads need your attention right now. Dawn will nudge you when something does.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {suggestions.map((s) => {
              const Icon = typeIcon[s.type] || Lightbulb;
              return (
                <div key={s.id} className={`dawn-card border-l-4 ${priColor[s.priority] || "border-l-navy/20"} p-4 shadow-card`}>
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-amber/10 flex items-center justify-center shrink-0"><Icon className="w-4 h-4 text-amber-deep" /></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-navy leading-snug">{s.message}</p>
                      <div className="flex gap-2 mt-3">
                        <button onClick={() => accept(s)} className="flex items-center gap-1.5 text-xs font-semibold bg-navy text-white px-3 py-1.5 rounded-lg hover:bg-navy-soft">
                          <Check className="w-3.5 h-3.5" /> {s.type === "payment_proof" ? "Convert" : "Do it"}
                        </button>
                        <button onClick={() => mark(s.id, "dismissed")} className="flex items-center gap-1.5 text-xs font-medium text-muted hover:text-navy px-3 py-1.5">
                          <X className="w-3.5 h-3.5" /> Dismiss
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {convert && <ConvertModal contact={convert} onClose={() => setConvert(null)} onDone={() => { setConvert(null); load(); }} />}
    </DashboardShell>
  );
}

export default function Suggestions() {
  return <ToastProvider><SuggestionsInner /></ToastProvider>;
}
