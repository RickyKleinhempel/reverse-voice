"use client";

import { useEffect, useRef } from "react";

const SIZES = {
  lg: { canvas: 280, button: 128, line: 4 },
  md: { canvas: 200, button: 88, line: 3 },
} as const;

type Props = {
  recording: boolean;
  busy?: boolean;
  /** Liefert die Frequenzdaten für den Ring (Mikrofon beim Aufnehmen, Ausgang beim Abspielen). */
  analyser: AnalyserNode | null;
  onClick: () => void;
  label: string;
  size?: keyof typeof SIZES;
};

/** Großer Aufnahme-Knopf mit kreisförmigem Live-Visualizer drumherum. */
export function RecordButton({ recording, busy, analyser, onClick, label, size = "lg" }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { canvas: canvasSize, button: buttonSize, line } = SIZES[size];

  useEffect(() => {
    const canvas = canvasRef.current;
    const g = canvas?.getContext("2d");
    if (!canvas || !g) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasSize * dpr;
    canvas.height = canvasSize * dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    const center = canvasSize / 2;
    const inner = buttonSize / 2 + 14;
    const maxLen = center - inner - 8;
    const bars = 72;
    const half = bars / 2;
    const data = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
    let raf = 0;

    const draw = () => {
      g.clearRect(0, 0, canvasSize, canvasSize);
      if (analyser && data) analyser.getByteFrequencyData(data);
      g.lineCap = "round";
      g.lineWidth = line;

      for (let i = 0; i < bars; i++) {
        // Spiegelsymmetrisch: oben tiefe, unten hohe Frequenzen.
        const idx = i < half ? i : bars - 1 - i;
        const value = data ? data[1 + Math.floor(idx * 1.1)] / 255 : 0;
        const length = 2 + value ** 1.4 * maxLen;
        const angle = (i / bars) * Math.PI * 2 - Math.PI / 2;
        const hue = 320 - (idx / half) * 140;
        const color = `hsl(${hue} 95% 66% / ${data ? 0.35 + value * 0.65 : 0.22})`;
        g.strokeStyle = color;
        g.shadowColor = color;
        g.shadowBlur = data ? 14 : 0;

        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        g.beginPath();
        g.moveTo(center + cos * inner, center + sin * inner);
        g.lineTo(center + cos * (inner + length), center + sin * (inner + length));
        g.stroke();
      }

      if (analyser) raf = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(raf);
  }, [analyser, canvasSize, buttonSize, line]);

  return (
    <div
      className="relative grid shrink-0 place-items-center"
      style={{ width: canvasSize, height: canvasSize }}
    >
      <canvas ref={canvasRef} aria-hidden className="absolute inset-0 h-full w-full" />
      {recording && (
        <span
          aria-hidden
          className="absolute animate-ping rounded-full bg-rose-500/30"
          style={{ width: buttonSize, height: buttonSize }}
        />
      )}
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        aria-label={label}
        aria-pressed={recording}
        style={{ width: buttonSize, height: buttonSize }}
        className={`relative grid place-items-center rounded-full text-white transition duration-300 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/70 active:scale-95 disabled:cursor-wait disabled:opacity-60 ${
          recording
            ? "bg-linear-to-br from-rose-500 to-red-600 shadow-[0_0_70px_-5px_rgba(244,63,94,0.9)]"
            : "bg-linear-to-br from-fuchsia-500 via-pink-500 to-orange-400 shadow-[0_0_60px_-8px_rgba(236,72,153,0.9)] hover:scale-105"
        }`}
      >
        <span
          aria-hidden
          className="absolute inset-[3px] rounded-full bg-linear-to-b from-white/35 to-transparent to-60%"
        />
        {recording ? (
          <span className="relative size-[34%] rounded-xl bg-white shadow-lg" />
        ) : (
          <MicIcon className="relative size-[42%] drop-shadow-md" />
        )}
      </button>
    </div>
  );
}

function MicIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="9" y="2" width="6" height="12" rx="3" fill="currentColor" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v4" />
    </svg>
  );
}
