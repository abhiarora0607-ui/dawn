import { DawnLogo } from "@/components/DawnLogo";
import Link from "next/link";

export const metadata = { title: "Data Deletion — Dawn" };

export default function DataDeletion() {
  return (
    <main className="max-w-2xl mx-auto px-6 py-16">
      <Link href="/"><DawnLogo className="h-10 mb-10" /></Link>
      <h1 className="text-3xl font-bold text-navy mb-2">Delete your data</h1>
      <p className="text-navy/50 text-sm mb-8">You&rsquo;re always in control of your data.</p>

      <div className="space-y-6 text-navy/75 text-[15px] leading-relaxed">
        <p>If you&rsquo;ve connected your Instagram account to Dawn and want everything removed, here&rsquo;s how:</p>

        <div className="bg-surface rounded-xl p-5 border border-navy/8">
          <h2 className="text-lg font-semibold text-navy mb-3">Two ways to delete</h2>
          <ol className="list-decimal list-inside space-y-2 text-navy/75">
            <li>Remove Dawn from your Instagram: <span className="text-navy/60">Instagram → Settings → Apps and Websites → remove Dawn.</span> This revokes our access immediately.</li>
            <li>Request full deletion: email us and we&rsquo;ll delete your stored access token and all associated data from our systems, typically within a few days.</li>
          </ol>
        </div>

        <p>Once deleted, Dawn no longer has any access to your Instagram account, and your stored data is permanently removed. If you reconnect later, you start fresh.</p>

        <p className="text-sm text-navy/50">
          This page also serves as Dawn&rsquo;s data deletion instructions as required by Meta&rsquo;s platform policies.
        </p>
      </div>
    </main>
  );
}
