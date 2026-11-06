"use client";

import { useState } from "react";

const TEXT = "Probier mal den Rückwärts-Rekorder 🔁 – nimm was auf und hör's dir rückwärts an 🤯";

/** Link zur App weiterschicken – per Teilen-Menü oder direkt per WhatsApp. */
export function ShareApp() {
  const [copied, setCopied] = useState(false);

  const shareLink = async () => {
    const url = window.location.href.split("#")[0];
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "Rückwärts-Rekorder", text: TEXT, url });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(`${TEXT} ${url}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Zwischenablage nicht verfügbar
    }
  };

  const openWhatsApp = () => {
    const url = window.location.href.split("#")[0];
    window.open(`https://wa.me/?text=${encodeURIComponent(`${TEXT} ${url}`)}`, "_blank", "noopener");
  };

  return (
    <div className="flex w-full flex-col items-center gap-3 rounded-3xl bg-white/[0.03] p-5 text-center ring-1 ring-white/10">
      <p className="font-display text-base font-bold">Zeig&apos;s deinen Freunden 👀</p>
      <div className="grid w-full grid-cols-2 gap-2">
        <button
          type="button"
          onClick={openWhatsApp}
          className="rounded-2xl bg-[#25d366]/20 px-3 py-3 text-sm font-bold text-[#a7f3c5] ring-1 ring-[#25d366]/40 transition hover:bg-[#25d366]/30 active:scale-95"
        >
          💬 Per WhatsApp
        </button>
        <button
          type="button"
          onClick={shareLink}
          className="rounded-2xl bg-white/[0.06] px-3 py-3 text-sm font-bold ring-1 ring-white/15 transition hover:bg-white/[0.12] active:scale-95"
        >
          {copied ? "✅ Link kopiert" : "🔗 Link teilen"}
        </button>
      </div>
    </div>
  );
}
