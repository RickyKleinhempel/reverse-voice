"use client";

import { type ReactNode, type Ref, useEffect, useRef } from "react";
import { drawWaveform } from "@/lib/audio";

type Props = {
  buffer: AudioBuffer;
  /** Muss eine stabile Referenz sein (Konstante), sonst wird ständig neu gezeichnet. */
  colors: readonly string[];
  label: ReactNode;
  playheadRef?: Ref<HTMLDivElement>;
};

export function Waveform({ buffer, colors, label, playheadRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draw = () => drawWaveform(canvas, buffer, [...colors]);
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [buffer, colors]);

  return (
    <div>
      <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.2em] text-white/50">{label}</p>
      <div className="relative h-20 overflow-hidden rounded-2xl bg-white/[0.04] ring-1 ring-white/10">
        <canvas ref={canvasRef} className="h-full w-full" />
        <div
          ref={playheadRef}
          aria-hidden
          className="pointer-events-none absolute inset-y-1 -ml-px w-[3px] rounded-full bg-white opacity-0 shadow-[0_0_14px_3px_rgba(255,255,255,0.7)] transition-opacity"
          style={{ left: 0 }}
        />
      </div>
    </div>
  );
}
