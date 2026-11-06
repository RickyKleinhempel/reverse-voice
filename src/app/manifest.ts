import type { MetadataRoute } from "next";

export const dynamic = "force-static";

// Auf GitHub Pages liegt alles unter /<repo-name>/ – die Pfade im Manifest brauchen das Präfix.
const base = process.env.PAGES_BASE_PATH || "";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Rückwärts-Rekorder",
    short_name: "Rückwärts",
    description: "Aufnehmen, rückwärts abspielen, Stimme verzerren und teilen.",
    lang: "de",
    start_url: `${base}/`,
    scope: `${base}/`,
    display: "standalone",
    orientation: "portrait",
    background_color: "#07030f",
    theme_color: "#07030f",
    icons: [
      { src: `${base}/icon-192.png`, sizes: "192x192", type: "image/png" },
      { src: `${base}/icon-512.png`, sizes: "512x512", type: "image/png" },
      { src: `${base}/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
