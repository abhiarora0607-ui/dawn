import Link from "next/link";
import { DawnLogo } from "@/components/DawnLogo";
import { PublicFooter } from "@/components/PublicFooter";

export const metadata = { title: "Terms & Conditions" };

// Plain-language terms for an Indian SaaS. Reviewed by the operator before
// publishing; required for payment-gateway onboarding.
export default function Terms() {
  return (
    <>
      <main className="max-w-2xl mx-auto px-6 py-16">
        <Link href="/"><DawnLogo className="h-10 mb-10" /></Link>
        <h1 className="text-3xl font-bold text-navy mb-2">Terms &amp; Conditions</h1>
        <p className="text-navy/50 text-sm mb-8">Last updated: July 2026</p>

        <div className="space-y-6 text-navy/75 text-[15px] leading-relaxed">
          <p>These terms govern your use of Dawn (&ldquo;the Service&rdquo;). By creating an account or using the Service, you agree to them.</p>

          <div>
            <h2 className="text-lg font-semibold text-navy mb-2">The Service</h2>
            <p>Dawn provides business software for Instagram-first businesses: a customer relationship manager (contacts, orders, finances, team management) and Instagram/AI assistance (daily briefings, content suggestions). Features available to you depend on the plan you choose.</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-navy mb-2">Your account</h2>
            <p>You sign in with your Instagram professional account. You are responsible for activity under your account and for the accuracy of the business data you enter. You must be at least 18 and authorised to act for the business you register.</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-navy mb-2">Free trial and subscriptions</h2>
            <p>New businesses receive a free trial with full access. When the trial ends, a paid plan is required to continue adding or editing data; your existing data remains viewable and exportable. Subscriptions are billed in advance for the period you select (monthly or yearly) and do not renew automatically until you choose to renew. Prices may change for future periods, but never for a period you have already paid for.</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-navy mb-2">Your data</h2>
            <p>Your business data belongs to you. We store it to provide the Service, keep each business&rsquo;s data isolated from every other business, and never sell it. You can export everything at any time — including after a trial or subscription ends. Deleted records are recoverable for 30 days, after which they are permanently removed.</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-navy mb-2">Acceptable use</h2>
            <p>Don&rsquo;t use Dawn to break the law, send spam, infringe someone&rsquo;s rights, upload malicious code, attempt to access another business&rsquo;s data, or violate Instagram&rsquo;s own platform terms. We may suspend accounts that do.</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-navy mb-2">Availability and third parties</h2>
            <p>We work to keep Dawn available and accurate, but the Service is provided &ldquo;as is&rdquo; without warranty. Dawn relies on third-party platforms (including Instagram and our hosting and AI providers); changes on their side can affect features. AI-generated suggestions are drafts for your judgement, not professional advice.</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-navy mb-2">Liability</h2>
            <p>To the extent permitted by law, Dawn&rsquo;s total liability for any claim is limited to the amount you paid us in the three months before the claim arose. We are not liable for indirect or consequential losses, including lost profits or lost data where you had the ability to export it.</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-navy mb-2">Ending your use</h2>
            <p>You may stop using Dawn at any time and cancel from Settings → Billing. We may end or suspend access for breach of these terms, with notice where practical. Export your data before you go — we&rsquo;re happy to help.</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-navy mb-2">Governing law</h2>
            <p>These terms are governed by the laws of India, with courts at Delhi NCR having jurisdiction.</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-navy mb-2">Contact</h2>
            <p>Questions about these terms: see our <Link href="/contact" className="text-amber-deep underline">contact page</Link>.</p>
          </div>
        </div>
      </main>
      <PublicFooter />
    </>
  );
}
