"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buzz, getAudioContext, pickMimeType } from "@/lib/audio";

export type RecStatus = "idle" | "requesting" | "recording" | "processing";

/** Sicherheitsgrenze, damit der Speicher nicht explodiert. */
export const MAX_SECONDS = 120;

function describeError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Kein Zugriff aufs Mikrofon 🙈 Erlaube es in den Browser-Einstellungen und versuch's nochmal.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "Kein Mikrofon gefunden 🎤❓";
  }
  if (name === "NotReadableError") {
    return "Das Mikrofon wird gerade von einer anderen App benutzt.";
  }
  return err instanceof Error ? err.message : "Irgendwas ist schiefgelaufen.";
}

export function useRecorder() {
  const [status, setStatus] = useState<RecStatus>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const micNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const timerRef = useRef<number | null>(null);

  const release = useCallback(() => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    micNodeRef.current?.disconnect();
    micNodeRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

  const start = useCallback(
    async (onDone: (buffer: AudioBuffer) => void) => {
      setError(null);
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        setError("Dein Browser kann leider nicht aufnehmen (oder die Seite läuft nicht über HTTPS).");
        return;
      }

      try {
        const ctx = await getAudioContext();
        setStatus("requesting");

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true },
        });
        streamRef.current = stream;

        // Mikrofon → Analyser (nur für den Visualizer, nicht auf die Lautsprecher!)
        const micNode = ctx.createMediaStreamSource(stream);
        const micAnalyser = ctx.createAnalyser();
        micAnalyser.fftSize = 256;
        micAnalyser.smoothingTimeConstant = 0.7;
        micNode.connect(micAnalyser);
        micNodeRef.current = micNode;

        const mimeType = pickMimeType();
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        recorderRef.current = recorder;
        const chunks: Blob[] = [];

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunks.push(event.data);
        };

        recorder.onstop = async () => {
          release();
          setAnalyser(null);
          setStatus("processing");
          buzz([15, 40, 15]);
          try {
            const blob = new Blob(chunks, { type: recorder.mimeType || mimeType });
            const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
            if (decoded.duration < 0.2) throw new Error("zu kurz");
            onDone(decoded);
          } catch {
            setError("Das war zu kurz oder ging schief – nochmal! 🔁");
          } finally {
            setStatus("idle");
          }
        };

        recorder.start();
        const startedAt = performance.now();
        setElapsed(0);
        timerRef.current = window.setInterval(() => {
          const seconds = (performance.now() - startedAt) / 1000;
          setElapsed(seconds);
          if (seconds >= MAX_SECONDS && recorder.state === "recording") recorder.stop();
        }, 100);

        setAnalyser(micAnalyser);
        setStatus("recording");
        buzz(30);
      } catch (err) {
        release();
        setAnalyser(null);
        setError(describeError(err));
        setStatus("idle");
      }
    },
    [release],
  );

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }, []);

  // Beim Verlassen der Seite Mikrofon sicher freigeben.
  useEffect(() => {
    return () => {
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = null;
        recorder.stop();
      }
      release();
    };
  }, [release]);

  return { status, elapsed, error, analyser, start, stop, clearError: () => setError(null) };
}

export type Recorder = ReturnType<typeof useRecorder>;
