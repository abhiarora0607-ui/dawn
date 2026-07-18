import Link from "next/link";
import { DawnLogo } from "@/components/DawnLogo";
import { PublicFooter } from "@/components/PublicFooter";

export const metadata = { title: "Refunds & Cancellation" };

// Required for Indian payment-gateway onboarding, and simply the fair policy.
export default function Refunds() {
  return (
    <>
      <main className="max-w-2xl mx-auto px-6 py-16">
        <Link href="/"><DawnLogo className="h-10 mb-10" /></Link>
        <h1 className="text-3xl font-bold text-navy mb-2">Refunds &amp; Cancellation</h1>
        <p className="text-navy/50 text-sm mb-8">Last updated: July 2026</p>

        <div className="space-y-6 text-navy/75 text-[15px] leading-relaxed">
          <div>
            <h2 className="text-lg font-semibold text-navy mb-2">Try before you pay</h2>
            <p>Every business gets a free trial with full access before any payment is required. We&rsquo;d rather you decide during the trial than pay for something that isn&rsquo;t right for you — and if you need longer to decide, ask us and we&rsquo;ll usually extend it.</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-navy mb-2">Cancelling</h2>
            <p>You can cancel any time from Settings → Billing. Cancellation stops future renewals; you keep full access until the end of the period you already paid for. There is no cancellation fee and no lock-in contract.</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-navy mb-2">Refunds</h2>
            <p>If something goes materially wrong on our side — the Service is unavailable for an extended period, or you were charged in error or charged twice — write to us and we will refund that payment in full.</p>
            <p className="mt-2">If you simply change your mind, we offer a full refund within <strong>7 days</strong> of a payment, provided the plan was not used substantially during that period. Beyond 7 days, we don&rsquo;t refund the current period, but you can cancel so you aren&rsquo;t charged again.</p>
            <p className="mt-2">Yearly plans: within 7 days, full refund. After that, we can refund the unused whole months at our discretion if you&rsquo;re leaving for a reason we could not fix.</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-navy mb-2">How to request</h2>
            <p>Contact us through our <Link href="/contact" className="text-amber-deep underline">contact page</Link> with your business name and the payment reference from Settings → Billing. We aim to respond within 2 working days, and approved refunds are returned to the original payment method within 5–7 working days.</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-navy mb-2">Your data, either way</h2>
            <p>Refund or not, your data stays yours: export everything from Settings at any time, including after cancellation.</p>
          </div>
        </div>
      </main>
      <PublicFooter />
    </>
  );
}
