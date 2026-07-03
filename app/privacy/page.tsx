import { DawnLogo } from "@/components/DawnLogo";
import Link from "next/link";

export const metadata = { title: "Privacy Policy — Dawn" };

export default function Privacy() {
  return (
    <main className="max-w-2xl mx-auto px-6 py-16">
      <Link href="/"><DawnLogo className="h-7 mb-10" /></Link>
      <h1 className="text-3xl font-bold text-navy mb-2">Privacy Policy</h1>
      <p className="text-navy/50 text-sm mb-8">Last updated: July 2026</p>

      <div className="space-y-6 text-navy/75 text-[15px] leading-relaxed">
        <p>Dawn (&ldquo;we&rdquo;, &ldquo;us&rdquo;) helps creators and businesses manage their Instagram presence. This policy explains what we collect and how we use it.</p>

        <div>
          <h2 className="text-lg font-semibold text-navy mb-2">What we access</h2>
          <p>When you connect your Instagram professional account, you grant Dawn permission — through Instagram&rsquo;s official login — to read your profile details, media, insights (reach, engagement), comments, and messages. We only access data for the account you connect. We never access accounts you don&rsquo;t own or authorize.</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-navy mb-2">How we use it</h2>
          <p>We use your Instagram data solely to generate your daily briefing and recommendations inside Dawn. We do not sell your data, and we do not share it with third parties except the AI service that generates your briefing text, which processes it transiently and does not retain it for training.</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-navy mb-2">Storage &amp; security</h2>
          <p>Your access token is stored securely and used only to fetch your data on your behalf. Tokens are encrypted in transit and access is restricted.</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-navy mb-2">Deleting your data</h2>
          <p>You can disconnect and delete all your data at any time by visiting our <Link href="/data-deletion" className="text-amber-deep underline">data deletion page</Link>, or by emailing us. On request, we remove your stored tokens and account data promptly.</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-navy mb-2">Contact</h2>
          <p>Questions about this policy? Email us at the address listed on our site. We&rsquo;ll respond promptly.</p>
        </div>
      </div>
    </main>
  );
}
