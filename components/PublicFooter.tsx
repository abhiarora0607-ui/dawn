// components/PublicFooter.tsx
// One footer for every public page — carries the legal set Razorpay requires
// and Meta expects, plus the support door. Server component; no client JS.

import Link from "next/link";
import { DawnLogo } from "@/components/DawnLogo";

export function PublicFooter() {
  return (
    <footer className="border-t border-navy-line bg-white/60">
      <div className="max-w-6xl mx-auto px-5 sm:px-6 py-10">
        <div className="flex flex-wrap items-start justify-between gap-8">
          <div>
            <DawnLogo className="h-9" />
            <p className="text-sm text-navy/50 mt-2 max-w-xs">Instagram-first business software — a daily AI plan for your account and a CRM for leads, orders and money.</p>
          </div>
          <div className="flex flex-wrap gap-x-12 gap-y-6 text-sm">
            <div>
              <p className="font-semibold text-navy mb-2">Product</p>
              <ul className="space-y-1.5 text-navy/60">
                <li><Link href="/pricing" className="hover:text-navy">Pricing</Link></li>
                <li><Link href="/security" className="hover:text-navy">Security</Link></li>
                <li><Link href="/status" className="hover:text-navy">Status</Link></li>
                <li><Link href="/signin" className="hover:text-navy">Sign in</Link></li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-navy mb-2">Legal</p>
              <ul className="space-y-1.5 text-navy/60">
                <li><Link href="/terms" className="hover:text-navy">Terms &amp; Conditions</Link></li>
                <li><Link href="/privacy" className="hover:text-navy">Privacy Policy</Link></li>
                <li><Link href="/refunds" className="hover:text-navy">Refunds &amp; Cancellation</Link></li>
                <li><Link href="/data-deletion" className="hover:text-navy">Data deletion</Link></li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-navy mb-2">Company</p>
              <ul className="space-y-1.5 text-navy/60">
                <li><Link href="/contact" className="hover:text-navy">Contact &amp; support</Link></li>
              </ul>
            </div>
          </div>
        </div>
        <p className="text-xs text-navy/35 mt-8">© {new Date().getFullYear()} Dawn. Made in India.</p>
      </div>
    </footer>
  );
}
