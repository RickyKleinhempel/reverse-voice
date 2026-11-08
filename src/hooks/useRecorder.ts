"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  buzz,
  getAudioContext,
  markAudioContextStale,
  pickMimeType,
  restartAudioContext,
  setAudioSession,
} from "@/lib/audio";
import { type Facing, type FrameCapture, startFrameCapture, type VideoFrames } from "@/lib/video";

export type RecStatus = "idle" | "requesting" | "countdown" | "recording" | "processing";

/** Sicherheitsgrenze, damit der Speicher nicht explodiert. */
export const MAX_SECONDS = 120;
/** Videos brauchen viel mehr Speicher (Einzelbilder) – daher kürzer. */
export const MAX_VIDEO_SECONDS = 30;
/** Vorlauf vor der Video-Aufnahme, um sich ins Bild zu rücken. */
export const COUNTDOWN_SECONDS = 3;

/** Live-Kamerabild während Countdown und Aufnahme. */
export type LivePreview = { video: HTMLVideoElement; mirrored: boolean };

type StartOptions = { video?: { facing: Facing } };

function describeError(err: unknown, withVideo: boolean): string {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return withVideo
      ? "Kein Zugriff auf Kamera oder Mikrofon 🙈 Erlaube beides in den Browser-Einstellungen und versuch's nochmal."
      : "Kein Zugriff aufs Mikrofon 🙈 Erlaube es in den Browser-Einstellungen und versuch's nochmal.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return withVideo ? "Keine Kamera oder kein Mikrofon gefunden 📷❓" : "Kein Mikrofon gefunden 🎤❓";
  }
  if (name === "NotReadableError") {
    return withVideo
      ? "Kamera oder Mikrofon werden gerade von einer anderen App benutzt."
      : "Das Mikrofon wird gerade von einer anderen App benutzt.";
  }
  return err instanceof Error ? err.message : "Irgendwas ist schiefgelaufen.";
}

export function useRecorder() {
  const [status, setStatus] = useState<RecStatus>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [preview, setPreview] = useState<LivePreview | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const micNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const timerRef = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const captureRef = useRef<FrameCapture | null>(null);
  const cancelCountdownRef = useRef<(() => void) | null>(null);

  const release = useCallback(() => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    void captureRef.current?.stop();
    micNodeRef.current?.disconnect();
    micNodeRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    const video = videoRef.current;
    videoRef.current = null;
    if (video) {
      video.pause();
      video.srcObject = null;
      video.remove();
    }
    setPreview(null);
    setAudioSession("playback");
  }, []);

  const start = useCallback(
    async (onDone: (buffer: AudioBuffer, frames?: VideoFrames) => void, options: StartOptions = {}) => {
      const withVideo = Boolean(options.video);
      setError(null);
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        setError("Dein Browser kann leider nicht aufnehmen (oder die Seite läuft nicht über HTTPS).");
        return;
      }

      try {
        setAudioSession("play-and-record");
        const ctx = await getAudioContext();
        setStatus("requesting");

        const facing = options.video?.facing ?? "user";
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true },
          video: withVideo
            ? {
                facingMode: { ideal: facing },
                width: { ideal: 720 },
                height: { ideal: 1280 },
                frameRate: { ideal: 30 },
              }
            : false,
        });
        streamRef.current = stream;

        // Mikrofon → Analyser (nur für den Visualizer, nicht auf die Lautsprecher!)
        const micNode = ctx.createMediaStreamSource(stream);
        const micAnalyser = ctx.createAnalyser();
        micAnalyser.fftSize = 256;
        micAnalyser.smoothingTimeConstant = 0.7;
        micNode.connect(micAnalyser);
        micNodeRef.current = micNode;

        // Kamera: ein <video>, das die Bühne sichtbar einhängt – davon werden die Bilder abgegriffen.
        let mirrored = false;
        if (withVideo) {
          const track = stream.getVideoTracks()[0];
          const reported = track?.getSettings().facingMode;
          mirrored = reported ? reported === "user" : facing === "user";
          const video = document.createElement("video");
          video.muted = true;
          video.playsInline = true;
          video.autoplay = true;
          video.setAttribute("playsinline", "");
          video.srcObject = stream;
          videoRef.current = video;
          await video.play().catch(() => {});
          setPreview({ video, mirrored });
          setAnalyser(micAnalyser);
          setStatus("countdown");

          const go = await new Promise<boolean>((resolve) => {
            let left = COUNTDOWN_SECONDS;
            setCountdown(left);
            buzz(10);
            const id = window.setInterval(() => {
              left -= 1;
              if (left <= 0) {
                window.clearInterval(id);
                cancelCountdownRef.current = null;
                resolve(true);
              } else {
                setCountdown(left);
                buzz(10);
              }
            }, 1000);
            cancelCountdownRef.current = () => {
              window.clearInterval(id);
              cancelCountdownRef.current = null;
              resolve(false);
            };
          });
          if (!go || streamRef.current !== stream) return; // abgebrochen – stop() hat schon aufgeräumt
        }

        const mimeType = pickMimeType();
        // Beim Video nimmt der MediaRecorder nur den Ton auf – die Bilder kommen aus startFrameCapture.
        const audioStream = withVideo ? new MediaStream(stream.getAudioTracks()) : stream;
        const recorder = new MediaRecorder(audioStream, mimeType ? { mimeType } : undefined);
        recorderRef.current = recorder;
        const chunks: Blob[] = [];
        const maxSeconds = withVideo ? MAX_VIDEO_SECONDS : MAX_SECONDS;

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunks.push(event.data);
        };

        recorder.onstart = () => {
          // Bilder ab dem Moment, ab dem auch Ton aufgenommen wird → beides bleibt synchron.
          const video = videoRef.current;
          if (withVideo && video) captureRef.current = startFrameCapture(video, { mirror: mirrored });
        };

        recorder.onstop = async () => {
          const framesPromise = captureRef.current?.stop();
          captureRef.current = null;
          release();
          setAnalyser(null);
          setStatus("processing");
          buzz([15, 40, 15]);
          try {
            const blob = new Blob(chunks, { type: recorder.mimeType || mimeType });
            // Kontext wurde beim Stoppen ggf. neu gestartet – daher frisch holen
            const decodeCtx = await getAudioContext();
            const decoded = await decodeCtx.decodeAudioData(await blob.arrayBuffer());
            if (decoded.duration < 0.2) throw new Error("zu kurz");
            const frames = await framesPromise;
            if (withVideo && (!frames || frames.blobs.length < 2)) throw new Error("keine Bilder");
            onDone(decoded, frames);
          } catch {
            setError(
              withVideo
                ? "Das Video war zu kurz oder ging schief – nochmal! 🔁"
                : "Das war zu kurz oder ging schief – nochmal! 🔁",
            );
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
          if (seconds >= maxSeconds && recorder.state === "recording") {
            // Zeitlimit: kein Tipp → Context kann hier nicht neu starten, das passiert beim nächsten Tipp.
            markAudioContextStale();
            void captureRef.current?.stop();
            recorder.stop();
          }
        }, 100);

        setAnalyser(micAnalyser);
        setStatus("recording");
        buzz(30);
      } catch (err) {
        cancelCountdownRef.current = null;
        release();
        setAnalyser(null);
        setError(describeError(err, withVideo));
        setStatus("idle");
      }
    },
    [release],
  );

  const stop = useCallback(() => {
    // Tipp während des Countdowns: abbrechen, nichts aufnehmen.
    if (cancelCountdownRef.current) {
      cancelCountdownRef.current();
      release();
      setAnalyser(null);
      setStatus("idle");
      restartAudioContext();
      return;
    }
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    // Bilder sofort anhalten – sonst landen schwarze Bilder der beendeten Kamera am Ende.
    void captureRef.current?.stop();
    recorder.stop();
    // Mikro sofort freigeben und Audio neu starten – noch im Tipp, damit der Browser es erlaubt.
    // So kommt die Wiedergabe danach über den Lautsprecher (Freisprechen) statt leise über den Hörer.
    streamRef.current?.getTracks().forEach((track) => track.stop());
    setAudioSession("playback");
    restartAudioContext();
  }, [release]);

  // Beim Verlassen der Seite Mikrofon und Kamera sicher freigeben.
  useEffect(() => {
    return () => {
      cancelCountdownRef.current?.();
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = null;
        recorder.stop();
      }
      release();
    };
  }, [release]);

  return {
    status,
    elapsed,
    countdown,
    error,
    analyser,
    preview,
    start,
    stop,
    clearError: () => setError(null),
  };
}

export type Recorder = ReturnType<typeof useRecorder>;
