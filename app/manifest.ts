// app/manifest.ts
// PWA manifest — lets owners and employees install Dawn to the home screen.
// Uses the existing SVG icon (scales at any size), so no new assets needed.

import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Dawn — Instagram business manager",
    short_name: "Dawn",
    description: "A daily AI plan for your Instagram and a CRM for your leads, orders and money.",
    start_url: "/dashboard/business",
    display: "standalone",
    background_color: "#F8F9FC",
    theme_color: "#16233F",
    orientation: "portrait",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
