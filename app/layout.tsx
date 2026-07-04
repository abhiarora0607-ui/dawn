import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dawn — Wake up knowing what to do",
  description:
    "Dawn is your AI Instagram manager. Every morning it tells you what happened on your account and exactly what to do about it.",
  icons: { icon: "/icon.svg" },
  openGraph: {
    title: "Dawn — Wake up knowing what to do",
    description: "Your AI Instagram manager. A daily plan of action, before breakfast.",
    type: "website",
  },
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
