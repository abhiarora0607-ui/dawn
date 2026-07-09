// app/sitemap.ts
import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://dawn-jet.vercel.app";
  const now = new Date();
  // Public, indexable marketing/legal pages only.
  return [
    { url: `${base}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/pricing`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/data-deletion`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
