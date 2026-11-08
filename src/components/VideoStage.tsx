"use client";

import { type Ref, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import type { LivePreview } from "@/hooks/useRecorder";
import { type ClipVideo, createFrameCache, type FrameCache, frameIndexAt } from "@/lib/video";

export type VideoStageHandle = {
  /** Zeigt das Bild zur Zeit `t` (Sekunden ab Aufnahmestart). */
  show: (t: number) => void;
};

type Props = {
  ref?: Ref<VideoStageHandle>;
  /** Live-Kamera (Countdown & Aufnahme) – hat Vorrang vor dem Clip. */
  live: LivePreview | null;
  video?: ClipVideo;
  /** Bild, das im Stillstand gezeigt wird (Sekunden ab Aufnahmestart). */
  posterTime: number;
  countdown: number | null;
  recording: boolean;
};

/** 9:16-Bühne: Live-Kamerabild beim Aufnehmen, danach der Clip Bild für Bild. */
export function VideoStage({ ref, live, video, posterTime, countdown, recording }: Props) {
  const liveHostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cacheRef = useRef<FrameCache | null>(null);
  const wantedRef = useRef(-1);
  const drawnRef = useRef(-1);
  const frames = video?.frames;

  // Kamera-Video der Aufnahme sichtbar einhängen (nur sichtbare Videos liefern zuverlässig Bilder).
  useEffect(() => {
    const host = liveHostRef.current;
    if (!host || !live) return;
    const el = live.video;
    host.appendChild(el);
    void el.play().catch(() => {});
    return () => {
      if (el.parentNode === host) host.removeChild(el);
    };
  }, [live]);

  useEffect(() => {
    if (!frames) return;
    const cache = createFrameCache(frames);
    cacheRef.current = cache;
    wantedRef.current = -1;
    drawnRef.current = -1;
    return () => {
      cache.dispose();
      if (cacheRef.current === cache) cacheRef.current = null;
    };
  }, [frames]);

  const show = useCallback(
    (t: number) => {
      const cache = cacheRef.current;
      if (!cache || !frames) return;
      const index = frameIndexAt(frames, t);
      if (index < 0) return;
      const direction = index < wantedRef.current ? -1 : 1;
      wantedRef.current = index;
      cache.prefetch(index, direction);
      if (drawnRef.current === index) return;

      const paint = (bitmap: ImageBitmap) => {
        const g = canvasRef.current?.getContext("2d");
        if (!g) return;
        try {
          g.drawImage(bitmap, 0, 0, frames.width, frames.height);
          drawnRef.current = index;
        } catch {
          // Bild wurde inzwischen freigegeben – das nächste kommt gleich.
        }
      };
      const bitmap = cache.get(index);
      if (bitmap) paint(bitmap);
      else {
        // Noch nicht dekodiert: altes Bild stehen lassen und nachziehen, falls es dann noch passt.
        void cache.load(index).then((loaded) => {
          if (loaded && wantedRef.current === index && cacheRef.current === cache) paint(loaded);
        });
      }
    },
    [frames],
  );

  useImperativeHandle(ref, () => ({ show }), [show]);

  // Standbild: Anfang der Rückwärts-Version (= Ende des Originals).
  useEffect(() => {
    if (live) return;
    drawnRef.current = -1; // Canvas kann neu eingehängt (also leer) sein
    show(posterTime);
  }, [show, posterTime, live]);

  return (
    <div className="relative mx-auto aspect-[9/16] h-[min(52dvh,32rem)] max-w-full overflow-hidden rounded-[1.75rem] bg-black/60 shadow-[0_20px_70px_-20px_rgba(217,70,239,0.7)] ring-1 ring-white/15">
      {live ? (
        <div
          ref={liveHostRef}
          className="absolute inset-0 [&>video]:h-full [&>video]:w-full [&>video]:object-cover"
          style={live.mirrored ? { transform: "scaleX(-1)" } : undefined}
        />
      ) : frames ? (
        <canvas
          ref={canvasRef}
          width={frames.width}
          height={frames.height}
          aria-label="Video-Vorschau"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-linear-to-br from-fuchsia-500/15 via-transparent to-cyan-400/15 p-6 text-center">
          <div>
            <p className="text-6xl">🎥</p>
            <p className="mt-3 text-sm font-semibold text-white/70">
              Tipp auf Aufnahme –<br />
              nach 3 · 2 · 1 geht&apos;s los
            </p>
          </div>
        </div>
      )}

      {live && countdown !== null && countdown > 0 && (
        <div className="absolute inset-0 grid place-items-center bg-black/25">
          <span
            key={countdown}
            className="animate-pop font-display text-8xl font-extrabold text-white drop-shadow-[0_0_30px_rgba(217,70,239,0.9)]"
          >
            {countdown}
          </span>
        </div>
      )}

      {live && recording && (
        <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1 text-xs font-bold tracking-wider backdrop-blur">
          <span className="size-2.5 animate-pulse rounded-full bg-rose-500" />
          REC
        </span>
      )}
    </div>
  );
}
