// app/robots.ts
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = "https://dawn-jet.vercel.app";
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Keep private/app surfaces out of the index.
      disallow: ["/dashboard", "/team", "/team-login", "/signin", "/api/", "/receipt/", "/p/", "/operator"],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
