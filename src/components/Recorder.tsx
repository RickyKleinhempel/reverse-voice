"use client";

import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { audioBufferToWav, drawWaveform, formatTime, pickMimeType, reverseBuffer } from "@/lib/audio";

type Status = "idle" | "requesting" | "recording" | "processing" | "ready";
type Direction = "forward" | "reverse";

function createAudioContext(): AudioContext {
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) throw new Error("Web Audio API wird nicht unterstützt.");
  return new Ctor();
}

function describeError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Der Mikrofon-Zugriff wurde verweigert. Erlaube ihn in den Browser-Einstellungen und versuche es erneut.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "Es wurde kein Mikrofon gefunden.";
  }
  if (name === "NotReadableError") {
    return "Das Mikrofon wird gerade von einer anderen Anwendung benutzt.";
  }
  return err instanceof Error ? err.message : "Unbekannter Fehler.";
}

export default function Recorder() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [original, setOriginal] = useState<AudioBuffer | null>(null);
  const [reversed, setReversed] = useState<AudioBuffer | null>(null);
  const [playing, setPlaying] = useState<Direction | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<number | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);

  const originalCanvasRef = useRef<HTMLCanvasElement>(null);
  const reversedCanvasRef = useRef<HTMLCanvasElement>(null);
  const originalHeadRef = useRef<HTMLDivElement>(null);
  const reversedHeadRef = useRef<HTMLDivElement>(null);

  const getContext = useCallback(async () => {
    if (!ctxRef.current) ctxRef.current = createAudioContext();
    if (ctxRef.current.state === "suspended") await ctxRef.current.resume();
    return ctxRef.current;
  }, []);

  const hidePlayheads = () => {
    for (const head of [originalHeadRef.current, reversedHeadRef.current]) {
      if (head) head.style.opacity = "0";
    }
  };

  const stopPlayback = useCallback(() => {
    const source = sourceRef.current;
    if (source) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        // war schon beendet
      }
      source.disconnect();
      sourceRef.current = null;
    }
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    hidePlayheads();
    setPlaying(null);
  }, []);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const clearTimer = () => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const startRecording = async () => {
    setError(null);
    stopPlayback();

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError(
        "Dein Browser unterstützt keine Audioaufnahme, oder die Seite wird nicht über HTTPS geladen.",
      );
      return;
    }

    try {
      // AudioContext im Klick-Handler erzeugen, sonst blockiert v. a. iOS die spätere Wiedergabe.
      const ctx = await getContext();
      setStatus("requesting");

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      const chunks: Blob[] = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };

      recorder.onstop = async () => {
        clearTimer();
        stopStream();
        recorderRef.current = null;
        setStatus("processing");
        try {
          const blob = new Blob(chunks, { type: recorder.mimeType || mimeType });
          const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
          setOriginal(decoded);
          setReversed(reverseBuffer(ctx, decoded));
          setStatus("ready");
        } catch {
          setError("Die Aufnahme konnte nicht verarbeitet werden. War sie vielleicht zu kurz?");
          setStatus(original ? "ready" : "idle");
        }
      };

      recorder.start();
      const startedAt = performance.now();
      setElapsed(0);
      timerRef.current = window.setInterval(() => {
        setElapsed((performance.now() - startedAt) / 1000);
      }, 100);
      setStatus("recording");
    } catch (err) {
      stopStream();
      clearTimer();
      setError(describeError(err));
      setStatus(original ? "ready" : "idle");
    }
  };

  const stopRecording = () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  };

  const play = async (direction: Direction) => {
    const buffer = direction === "reverse" ? reversed : original;
    if (!buffer) return;

    stopPlayback();
    const ctx = await getContext();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const head = direction === "reverse" ? reversedHeadRef.current : originalHeadRef.current;
    const startAt = ctx.currentTime;
    const tick = () => {
      const progress = Math.min(1, (ctx.currentTime - startAt) / buffer.duration);
      if (head) {
        head.style.opacity = "1";
        head.style.left = `${progress * 100}%`;
      }
      if (progress < 1) rafRef.current = requestAnimationFrame(tick);
    };

    source.onended = () => {
      if (sourceRef.current !== source) return;
      sourceRef.current = null;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      hidePlayheads();
      setPlaying(null);
    };

    source.start();
    sourceRef.current = source;
    rafRef.current = requestAnimationFrame(tick);
    setPlaying(direction);
  };

  const downloadReversed = () => {
    if (!reversed) return;
    const url = URL.createObjectURL(audioBufferToWav(reversed));
    const link = document.createElement("a");
    link.href = url;
    link.download = `rueckwaerts-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.wav`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Wellenformen zeichnen (und bei Größenänderung neu zeichnen).
  useEffect(() => {
    if (!original || !reversed) return;
    const draw = () => {
      for (const [canvas, buffer] of [
        [originalCanvasRef.current, original],
        [reversedCanvasRef.current, reversed],
      ] as const) {
        if (canvas) drawWaveform(canvas, buffer, getComputedStyle(canvas).color);
      }
    };
    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, [original, reversed]);

  // Beim Verlassen der Seite alles freigeben.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      try {
        sourceRef.current?.stop();
      } catch {
        // ignorieren
      }
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.onstop = null;
        recorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      void ctxRef.current?.close();
    };
  }, []);

  const isRecording = status === "recording";
  const isBusy = status === "requesting" || status === "processing";
  const hasRecording = original !== null && reversed !== null;

  let statusText = "Bereit für eine Aufnahme.";
  if (status === "requesting") statusText = "Warte auf Mikrofon-Freigabe …";
  else if (isRecording) statusText = "Aufnahme läuft …";
  else if (status === "processing") statusText = "Aufnahme wird umgedreht …";
  else if (hasRecording) statusText = `Aufnahme: ${formatTime(original.duration)}`;

  return (
    <section className="w-full rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-col items-center gap-4">
        <button
          type="button"
          onClick={isRecording ? stopRecording : startRecording}
          disabled={isBusy}
          aria-pressed={isRecording}
          aria-label={isRecording ? "Aufnahme stoppen" : "Aufnahme starten"}
          className={`relative flex h-28 w-28 items-center justify-center rounded-full text-white shadow-lg transition focus:outline-none focus-visible:ring-4 focus-visible:ring-red-300 disabled:cursor-wait disabled:opacity-60 ${
            isRecording ? "bg-red-600 hover:bg-red-700" : "bg-red-500 hover:bg-red-600"
          }`}
        >
          {isRecording && (
            <span className="absolute inset-0 animate-ping rounded-full bg-red-500 opacity-40" />
          )}
          {isRecording ? (
            <span className="relative h-9 w-9 rounded-md bg-white" />
          ) : (
            <span className="relative h-10 w-10 rounded-full bg-white" />
          )}
        </button>

        <div className="text-center" aria-live="polite">
          <p className="font-mono text-3xl tabular-nums">{formatTime(isRecording ? elapsed : original?.duration ?? 0)}</p>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{statusText}</p>
        </div>

        {error && (
          <p
            role="alert"
            className="w-full rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300"
          >
            {error}
          </p>
        )}
      </div>

      {hasRecording && (
        <div className="mt-8 flex flex-col gap-6">
          <Waveform
            label="Rückwärts"
            canvasRef={reversedCanvasRef}
            headRef={reversedHeadRef}
            colorClass="text-violet-600 dark:text-violet-400"
          />
          <Waveform
            label="Original"
            canvasRef={originalCanvasRef}
            headRef={originalHeadRef}
            colorClass="text-zinc-400 dark:text-zinc-500"
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => (playing === "reverse" ? stopPlayback() : play("reverse"))}
              disabled={isRecording || isBusy}
              className="rounded-xl bg-violet-600 px-5 py-3 font-semibold text-white transition hover:bg-violet-700 disabled:opacity-50"
            >
              {playing === "reverse" ? "■ Stopp" : "◀ Rückwärts abspielen"}
            </button>
            <button
              type="button"
              onClick={() => (playing === "forward" ? stopPlayback() : play("forward"))}
              disabled={isRecording || isBusy}
              className="rounded-xl border border-zinc-300 px-5 py-3 font-semibold transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              {playing === "forward" ? "■ Stopp" : "▶ Normal abspielen"}
            </button>
          </div>

          <button
            type="button"
            onClick={downloadReversed}
            disabled={isRecording || isBusy}
            className="self-center text-sm font-medium text-violet-700 underline-offset-4 hover:underline disabled:opacity-50 dark:text-violet-300"
          >
            Rückwärts-Version als WAV herunterladen
          </button>
        </div>
      )}
    </section>
  );
}

function Waveform({
  label,
  canvasRef,
  headRef,
  colorClass,
}: {
  label: string;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  headRef: RefObject<HTMLDivElement | null>;
  colorClass: string;
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <div className="relative h-20 overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-800">
        <canvas ref={canvasRef} className={`h-full w-full ${colorClass}`} />
        <div
          ref={headRef}
          className="pointer-events-none absolute inset-y-0 w-0.5 bg-zinc-900 opacity-0 dark:bg-white"
          style={{ left: 0 }}
        />
      </div>
    </div>
  );
}
