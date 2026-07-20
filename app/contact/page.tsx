import Link from "next/link";
import { DawnLogo } from "@/components/DawnLogo";
import { PublicFooter } from "@/components/PublicFooter";
import { MessageCircle, Mail, MapPin, Clock } from "lucide-react";

export const metadata = { title: "Contact & Support" };

// A real, reachable support door — required for gateway onboarding and the
// difference between a product people trust and one they don't.
export default function Contact() {
  const wa = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP || "";
  const email = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@dawn.app";
  return (
    <>
      <main className="max-w-2xl mx-auto px-5 sm:px-6 py-12 sm:py-16">
        <Link href="/"><DawnLogo className="h-10 mb-10" /></Link>
        <h1 className="text-3xl font-bold text-navy mb-2">Contact &amp; support</h1>
        <p className="text-navy/60 mb-8">Real people, quick replies. Tell us the business name and what happened.</p>

        <div className="grid sm:grid-cols-2 gap-3 mb-10">
          {wa && (
            <a href={`https://wa.me/${wa.replace(/[^0-9]/g, "")}`} target="_blank" rel="noopener noreferrer" className="dawn-card dawn-card-hover p-5 block">
              <MessageCircle className="w-5 h-5 text-emerald-500 mb-2" />
              <p className="font-semibold text-navy">WhatsApp</p>
              <p className="text-sm text-muted">Fastest — usually same day</p>
            </a>
          )}
          <a href={`mailto:${email}`} className="dawn-card dawn-card-hover p-5 block">
            <Mail className="w-5 h-5 text-amber-deep mb-2" />
            <p className="font-semibold text-navy">Email</p>
            <p className="text-sm text-muted">{email}</p>
          </a>
        </div>

        <div className="space-y-4 text-navy/75 text-[15px] leading-relaxed">
          <p className="flex items-start gap-2"><Clock className="w-4 h-4 mt-1 text-navy/40 shrink-0" /> <span><strong className="text-navy">Support hours:</strong> Monday–Saturday, 10am–7pm IST. We aim to reply within 2 working days.</span></p>
          <p className="flex items-start gap-2"><MapPin className="w-4 h-4 mt-1 text-navy/40 shrink-0" /> <span><strong className="text-navy">Based in:</strong> Delhi NCR, India.</span></p>
        </div>

        <div className="mt-10 pt-8 border-t border-navy-line space-y-3 text-sm text-navy/70">
          <p><strong className="text-navy">Billing questions</strong> — include the payment reference from Settings → Billing.</p>
          <p><strong className="text-navy">Want your data?</strong> Export it yourself any time from Settings → &ldquo;Export all my data&rdquo;, or see <Link href="/data-deletion" className="text-amber-deep underline">data deletion</Link>.</p>
          <p><strong className="text-navy">Feature requests</strong> — genuinely welcome. Dawn is shaped by what shop owners actually ask for.</p>
        </div>
      </main>
      <PublicFooter />
    </>
  );
}
