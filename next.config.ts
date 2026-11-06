import type { NextConfig } from "next";

// Auf GitHub Pages liegt die Seite unter /<repo-name>/.
// Der Deploy-Workflow setzt PAGES_BASE_PATH (z. B. "/reverse-voice"), lokal bleibt er leer.
const basePath = process.env.PAGES_BASE_PATH || "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  // cacheComponents/partialPrefetching (PPR) sind mit output: "export" nicht kompatibel.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
