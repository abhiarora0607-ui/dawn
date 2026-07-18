// A 404 that looks like Dawn and offers a way out, instead of the stock
// Next.js "This page could not be found" dead end.

import Link from "next/link";
import { DawnLogo } from "@/components/DawnLogo";
import { PublicFooter } from "@/components/PublicFooter";
import { ArrowRight, Compass } from "lucide-react";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <>
      <main className="min-h-[70vh] bg-cream flex flex-col">
        <header className="h-16 flex items-center px-5 sm:px-6 max-w-5xl mx-auto w-full">
          <Link href="/"><DawnLogo className="h-10" /></Link>
        </header>
        <div className="flex-1 flex items-center justify-center px-5 py-16">
          <div className="text-center max-w-sm">
            <span className="w-14 h-14 rounded-2xl bg-white border border-navy-line flex items-center justify-center mx-auto mb-4">
              <Compass className="w-6 h-6 text-amber-deep" />
            </span>
            <h1 className="font-display font-semibold text-2xl text-navy">This page doesn&apos;t exist</h1>
            <p className="text-muted text-sm mt-2">
              The link may be old, or the page may have moved. Nothing is broken on your side.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2 mt-6">
              <Link href="/" className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 bg-navy text-white font-medium px-5 py-2.5 rounded-xl hover:bg-navy-soft">
                Go home <ArrowRight className="w-4 h-4" />
              </Link>
              <Link href="/dashboard/business" className="w-full sm:w-auto inline-flex items-center justify-center border border-navy-line text-navy font-medium px-5 py-2.5 rounded-xl hover:border-navy/30">
                Open Dawn
              </Link>
            </div>
            <p className="text-xs text-muted mt-5">
              Still stuck? <Link href="/contact" className="text-amber-deep underline">Tell us</Link> and we&apos;ll fix it.
            </p>
          </div>
        </div>
      </main>
      <PublicFooter />
    </>
  );
}
