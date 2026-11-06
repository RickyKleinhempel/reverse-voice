"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { formatTime } from "@/lib/audio";
import { type EffectId, getEffect, renderWithEffect } from "@/lib/effects";
import {
  canShareFile,
  downloadBlob,
  encodeMp3,
  encodeWav,
  fileStamp,
  pickVideoType,
  renderVideo,
  shareFile,
} from "@/lib/export";
import type { Clip } from "./ReverseStudio";
import { glassButton, primaryButton } from "./ui";

type Format = "mp3" | "wav" | "video";

const FORMATS: { id: Format; label: string; hint: string }[] = [
  { id: "mp3", label: "🎵 MP3", hint: "Klein & überall abspielbar – perfekt für WhatsApp, Telegram, Signal & Discord." },
  { id: "wav", label: "💎 WAV", hint: "Unkomprimiert in bester Qualität – dafür deutlich größer." },
  { id: "video", label: "🎬 Video", hint: "Hochkant-Video mit Visualizer – für TikTok, Insta-Story, Snapchat & WhatsApp-Status." },
];

const subscribeNothing = () => () => {};
let videoTypeCache: string | null | undefined;
const getVideoType = () => (videoTypeCache === undefined ? (videoTypeCache = pickVideoType()) : videoTypeCache);
let isIosCache: boolean | undefined;
const getIsIos = () =>
  (isIosCache ??=
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

function cssFont(variable: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return value ? `${value}, ${fallback}` : fallback;
}

type Props = {
  clip: Clip;
  effect: EffectId;
  rate: number;
  onClose: () => void;
};

export function ShareSheet({ clip, effect, rate, onClose }: Props) {
  const fx = getEffect(effect);
  const [format, setFormat] = useState<Format>("mp3");
  const [files, setFiles] = useState<Partial<Record<Format, File>>>({});
  const [working, setWorking] = useState<Format | null>("mp3");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [baseName] = useState(() => `rueckwaerts-${effect}-${fileStamp()}`);
  const videoType = useSyncExternalStore(subscribeNothing, getVideoType, () => null);
  const isIos = useSyncExternalStore(subscribeNothing, getIsIos, () => false);

  const renderedRef = useRef<Promise<AudioBuffer> | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const busy = working !== null;

  const getRendered = () => (renderedRef.current ??= renderWithEffect(clip.reversed, effect, rate));

  const build = async (fmt: Format): Promise<File> => {
    const audio = await getRendered();
    if (fmt === "mp3") {
      return new File([await encodeMp3(audio, setProgress)], `${baseName}.mp3`, { type: "audio/mpeg" });
    }
    if (fmt === "wav") {
      return new File([encodeWav(audio)], `${baseName}.wav`, { type: "audio/wav" });
    }
    const body = cssFont("--font-body", "sans-serif");
    const display = cssFont("--font-display-face", body);
    await Promise.all([document.fonts.load(`800 58px ${display}`), document.fonts.load(`700 34px ${body}`)]);
    const video = await renderVideo({
      audio,
      emoji: fx.emoji,
      effectLabel: fx.label,
      rate,
      displayFont: display,
      bodyFont: body,
      onProgress: setProgress,
    });
    return new File([video.blob], `${baseName}.${video.name.split(".").pop()}`, { type: video.type });
  };

  const prepare = async (fmt: Format) => {
    if (busy || files[fmt]) return;
    setWorking(fmt);
    setProgress(0);
    setError(null);
    try {
      const file = await build(fmt);
      setFiles((current) => ({ ...current, [fmt]: file }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Das hat nicht geklappt 😕");
    } finally {
      setWorking(null);
    }
  };

  // MP3 gleich beim Öffnen vorbereiten – dann geht das Teilen sofort.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const audio = await getRendered();
        const blob = await encodeMp3(audio, (p) => !cancelled && setProgress(p));
        if (!cancelled) setFiles({ mp3: new File([blob], `${baseName}.mp3`, { type: "audio/mpeg" }) });
      } catch {
        if (!cancelled) setError("MP3 konnte nicht erstellt werden 😕");
      } finally {
        if (!cancelled) setWorking(null);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nur einmal beim Öffnen
  }, []);

  // Escape schließt, Seite dahinter scrollt nicht mit.
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const chooseFormat = (fmt: Format) => {
    setFormat(fmt);
    setNotice(null);
    if (fmt === "wav") void prepare("wav");
  };

  const share = async (file: File) => {
    setNotice(null);
    try {
      if (await shareFile(file)) setNotice("Geteilt! 🎉");
    } catch {
      downloadBlob(file, file.name);
      setNotice("Teilen ging nicht – die Datei wurde stattdessen gespeichert 📁");
    }
  };

  const download = (file: File) => {
    downloadBlob(file, file.name);
    setNotice(isIos ? "Gespeichert! Du findest sie in der Dateien-App unter Downloads 📁" : "Gespeichert! Schau in deinen Downloads 📁");
  };

  const formats = FORMATS.filter((f) => f.id !== "video" || videoType);
  const current = FORMATS.find((f) => f.id === format) ?? FORMATS[0];
  const file = files[format];
  const shareable = file ? canShareFile(file) : false;
  const size = file
    ? file.size < 1024 * 1024
      ? `${Math.max(1, Math.round(file.size / 1024))} KB`
      : `${(file.size / 1024 / 1024).toFixed(1).replace(".", ",")} MB`
    : null;
  const duration = clip.reversed.duration / rate;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="presentation">
      <button
        type="button"
        aria-label="Schließen"
        onClick={onClose}
        className="absolute inset-0 animate-fade-in bg-black/60 backdrop-blur-sm"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-title"
        tabIndex={-1}
        className="relative max-h-[90dvh] w-full animate-sheet-up overflow-y-auto rounded-t-[2rem] bg-[#140a24]/95 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-[0_-20px_80px_-20px_rgba(168,85,247,0.6)] ring-1 ring-white/10 outline-none backdrop-blur-2xl sm:max-w-md sm:rounded-[2rem] sm:pb-6"
      >
        <div aria-hidden className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-white/20 sm:hidden" />
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="share-title" className="font-display text-xl font-bold">
              Teilen & Speichern
            </h2>
            <p className="mt-1 text-sm text-white/60">
              {fx.emoji} {fx.label}
              {Math.abs(rate - 1) > 0.01 && ` · ${rate.toFixed(2)}×`} · ⏪ rückwärts · {formatTime(duration)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            className="grid size-10 shrink-0 place-items-center rounded-full bg-white/10 text-lg transition hover:bg-white/20"
          >
            ✕
          </button>
        </div>

        <div role="radiogroup" aria-label="Format" className={`mt-5 grid gap-2 ${formats.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
          {formats.map((f) => (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={format === f.id}
              onClick={() => chooseFormat(f.id)}
              className={`rounded-2xl py-3 text-sm font-bold ring-1 transition active:scale-95 ${
                format === f.id
                  ? "bg-linear-to-br from-fuchsia-500/35 to-cyan-400/20 ring-fuchsia-400/80"
                  : "bg-white/[0.04] ring-white/10"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <p className="mt-3 min-h-10 text-sm text-white/60">{current.hint}</p>

        <div className="mt-4 flex flex-col gap-3">
          {working === format ? (
            <div className="rounded-2xl bg-white/[0.04] p-4 ring-1 ring-white/10" aria-live="polite">
              <div className="flex justify-between text-sm font-semibold">
                <span>{format === "video" ? "🎬 Video wird aufgenommen …" : "⏳ Wird erstellt …"}</span>
                <span className="font-mono tabular-nums">{Math.round(progress * 100)}%</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-linear-to-r from-fuchsia-500 to-cyan-400 transition-[width]"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
              {format === "video" && (
                <p className="mt-2 text-xs text-white/50">Bleib solange auf dieser Seite – das Video läuft in Echtzeit.</p>
              )}
            </div>
          ) : file ? (
            <>
              {shareable && (
                <button type="button" onClick={() => share(file)} className={`${primaryButton} text-lg`}>
                  📤 An WhatsApp & Co. schicken
                </button>
              )}
              <button type="button" onClick={() => download(file)} className={glassButton}>
                💾 Herunterladen <span className="font-normal text-white/50">({size})</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => prepare(format)}
              disabled={busy}
              className={`${primaryButton} text-lg`}
            >
              {format === "video" ? `🎬 Video erstellen (${formatTime(duration)})` : "✨ Datei erstellen"}
            </button>
          )}
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-2xl bg-rose-500/15 px-4 py-3 text-sm text-rose-200 ring-1 ring-rose-400/30">
            {error}
          </p>
        )}
        {notice && (
          <p aria-live="polite" className="mt-4 animate-pop rounded-2xl bg-emerald-500/15 px-4 py-3 text-sm text-emerald-200 ring-1 ring-emerald-400/30">
            {notice}
          </p>
        )}

        <p className="mt-5 text-center text-xs text-white/40">
          {file && !shareable
            ? "Am PC: Datei speichern und in WhatsApp Web per 📎 anhängen."
            : isIos
              ? "Tipp: Im Teilen-Menü findest du auch „In Dateien sichern“."
              : "Im Teilen-Menü findest du WhatsApp, Telegram, Insta, Snapchat, Discord & mehr."}
        </p>
      </div>
    </div>
  );
}
