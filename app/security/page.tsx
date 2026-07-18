import Link from "next/link";
import { DawnLogo } from "@/components/DawnLogo";
import { PublicFooter } from "@/components/PublicFooter";
import { ShieldCheck, Lock, RotateCcw, Download, Eye, CheckCircle2 } from "lucide-react";

export const metadata = { title: "Security & Data Protection" };

// The trust story Dawn already earned in code (uid isolation, the invariant
// suite, soft-delete, exports) — finally told where buyers can read it.
export default function Security() {
  const points = [
    { icon: Lock, title: "Every business is isolated", body: "Each business's data is scoped to its own account on every single database query, enforced on the server — not just hidden in the interface. One business can never see another's contacts, orders or finances, even if they share a customer." },
    { icon: CheckCircle2, title: "The rules are machine-tested", body: "An automated invariant suite runs before every release and verifies the guarantees that must never break: account isolation, permission checks on every team endpoint, cancelled orders excluded from money, deleted records hidden everywhere, and secrets never exposed to the browser." },
    { icon: Eye, title: "Staff see only what you allow", body: "Team members sign in to a separate portal with their own passwords and permissions. Every restriction is enforced on the server, so a hidden button can't be bypassed." },
    { icon: RotateCcw, title: "Deletes are recoverable for 30 days", body: "Deleting a contact, order, item or expense hides it everywhere but keeps it recoverable for 30 days from Recently Deleted. After that it's permanently purged." },
    { icon: Download, title: "Your data is portable, always", body: "Export your entire business — contacts, orders, items, expenses, team, history — as a single file from Settings, at any time, including after a trial or subscription ends. No hostage-taking." },
    { icon: ShieldCheck, title: "Sensible infrastructure", body: "Data is stored with an established managed database provider with encryption in transit and at rest, row-level security enabled, and access limited to server-side keys that never reach your browser. Instagram access uses Instagram's official login — we never see your password." },
  ];
  return (
    <>
      <main className="max-w-3xl mx-auto px-6 py-16">
        <Link href="/"><DawnLogo className="h-10 mb-10" /></Link>
        <h1 className="text-3xl font-bold text-navy mb-2">Security &amp; data protection</h1>
        <p className="text-navy/60 mb-10 max-w-xl">You&rsquo;re trusting Dawn with your customers and your money. Here&rsquo;s exactly how that&rsquo;s protected — in plain language.</p>

        <div className="grid sm:grid-cols-2 gap-3">
          {points.map((p) => (
            <div key={p.title} className="dawn-card p-5">
              <p.icon className="w-5 h-5 text-amber-deep mb-2" />
              <p className="font-semibold text-navy mb-1">{p.title}</p>
              <p className="text-sm text-navy/60 leading-relaxed">{p.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 pt-8 border-t border-navy-line text-sm text-navy/70 space-y-2">
          <p><strong className="text-navy">Found a vulnerability?</strong> Please tell us privately through the <Link href="/contact" className="text-amber-deep underline">contact page</Link> before disclosing it publicly. We&rsquo;ll respond quickly and credit you if you&rsquo;d like.</p>
          <p>See also our <Link href="/privacy" className="text-amber-deep underline">privacy policy</Link> and <Link href="/terms" className="text-amber-deep underline">terms</Link>.</p>
        </div>
      </main>
      <PublicFooter />
    </>
  );
}
