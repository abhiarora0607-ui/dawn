import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://dawn-jet.vercel.app"),
  title: {
    default: "Dawn — Run your Instagram business in one place",
    template: "%s · Dawn",
  },
  description:
    "Dawn is an AI-powered tool for Instagram-first businesses: a daily plan for your account plus a built-in CRM for leads, orders, and money.",
  applicationName: "Dawn",
  keywords: ["Instagram CRM", "small business CRM", "Instagram business tool", "lead management", "order tracking"],
  icons: { icon: "/icon.svg" },
  alternates: { canonical: "/" },
  openGraph: {
    title: "Dawn — Run your Instagram business in one place",
    description: "A daily AI plan for your Instagram, plus a built-in CRM for leads, orders, and money.",
    type: "website",
    url: "/",
    siteName: "Dawn",
  },
  twitter: {
    card: "summary_large_image",
    title: "Dawn — Run your Instagram business in one place",
    description: "A daily AI plan for your Instagram, plus a built-in CRM for leads, orders, and money.",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans antialiased bg-surface text-ink">{children}</body>
    </html>
  );
}
