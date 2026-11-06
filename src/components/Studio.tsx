"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import type { Player } from "@/hooks/usePlayer";
import { MAX_SECONDS, type Recorder } from "@/hooks/useRecorder";
import { audioBufferToWav, formatTime } from "@/lib/audio";
import { EFFECTS, type EffectId, renderWithEffect } from "@/lib/effects";
import { RecordButton } from "./RecordButton";
import { glassButton, primaryButton, Section, Toggle } from "./ui";
import { Waveform } from "./Waveform";
import type { Clip } from "./ReverseStudio";

const VIVID = ["#f472b6", "#c084fc", "#22d3ee"] as const;
const MUTED = ["rgba(255,255,255,0.32)"] as const;
const RANDOM_RATES = [0.6, 0.75, 1, 1.25, 1.5, 1.8];

const IDEAS = [
  "Pizza mit Ananas",
  "Ich bin ein Roboter",
  "Rückwärts ist das neue Vorwärts",
  "Hallo, wie geht's dir?",
  "Lass mal chillen",
  "Abrakadabra Simsalabim",
  "Ich hab so Hunger",
  "Hausaufgaben sind mega toll",
  "Wer das hört, ist cool",
  "Schmetterling",
  "Dein Name – rückwärts 😏",
  "Sing eine Zeile aus deinem Lieblingssong 🎶",
];

// Kann der Browser Dateien teilen (z. B. an WhatsApp)? Einmal prüfen und merken.
let shareSupport: boolean | null = null;
function getShareSupport(): boolean {
  if (shareSupport === null) {
    try {
      shareSupport =
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [new File([new Blob()], "test.wav", { type: "audio/wav" })] });
    } catch {
      shareSupport = false;
    }
  }
  return shareSupport;
}
const subscribeNothing = () => () => {};

function randomItem<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function rateLabel(rate: number) {
  if (rate <= 0.7) return "👹 Monster";
  if (rate < 0.95) return "🐻 Tief";
  if (rate <= 1.05) return "🙂 Normal";
  if (rate < 1.5) return "🐥 Hoch";
  return "🐿️ Chipmunk";
}

type Props = {
  active: boolean;
  recorder: Recorder;
  player: Player;
  clip: Clip | null;
  trim: boolean;
  onTrimChange: (value: boolean) => void;
  onRecorded: (raw: AudioBuffer) => Clip;
};

export function Studio({ active, recorder, player, clip, trim, onTrimChange, onRecorded }: Props) {
  const [effect, setEffect] = useState<EffectId>("none");
  const [rate, setRate] = useState(1);
  const [loop, setLoop] = useState(false);
  const [ideaIndex, setIdeaIndex] = useState(0);
  const [exporting, setExporting] = useState<"save" | "share" | null>(null);
  const canShare = useSyncExternalStore(subscribeNothing, getShareSupport, () => false);

  const reverseHead = useRef<HTMLDivElement>(null);
  const forwardHead = useRef<HTMLDivElement>(null);

  const isRecording = recorder.status === "recording";
  const busy = recorder.status === "requesting" || recorder.status === "processing";
  const locked = isRecording || busy;
  const playingDir =
    player.playingId === "studio-reverse"
      ? "reverse"
      : player.playingId === "studio-forward"
        ? "forward"
        : null;

  type PlayOverrides = { effect?: EffectId; rate?: number; target?: Clip };
  const playClip = (dir: "reverse" | "forward", overrides: PlayOverrides = {}) => {
    const target = overrides.target ?? clip;
    if (!target) return;
    void player.play({
      id: `studio-${dir}`,
      buffer: dir === "reverse" ? target.reversed : target.original,
      effect: overrides.effect ?? effect,
      rate: overrides.rate ?? rate,
      loop,
      playhead: dir === "reverse" ? reverseHead.current : forwardHead.current,
    });
  };

  const toggleRecord = () => {
    if (isRecording) {
      recorder.stop();
      return;
    }
    player.stop();
    // Nach der Aufnahme sofort rückwärts abspielen – das ist der Spaß!
    void recorder.start((raw) => playClip("reverse", { target: onRecorded(raw) }));
  };

  const toggleClip = (dir: "reverse" | "forward") => {
    if (playingDir === dir) player.stop();
    else playClip(dir);
  };

  const chooseEffect = (next: EffectId) => {
    setEffect(next);
    if (playingDir) playClip(playingDir, { effect: next });
  };

  const randomize = () => {
    const others = EFFECTS.filter((fx) => fx.id !== effect);
    const nextEffect = randomItem(others).id;
    const nextRate = randomItem(RANDOM_RATES);
    setEffect(nextEffect);
    setRate(nextRate);
    playClip(playingDir ?? "reverse", { effect: nextEffect, rate: nextRate });
  };

  const changeRate = (value: number) => {
    setRate(value);
    player.setRate(value);
  };

  const changeLoop = (value: boolean) => {
    setLoop(value);
    player.setLoop(value);
  };

  const exportClip = async (mode: "save" | "share") => {
    if (!clip) return;
    setExporting(mode);
    try {
      const rendered = await renderWithEffect(clip.reversed, effect, rate);
      const blob = audioBufferToWav(rendered);
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      const name = `rueckwaerts-${effect}-${stamp}.wav`;

      if (mode === "share") {
        try {
          await navigator.share({
            files: [new File([blob], name, { type: "audio/wav" })],
            title: "Mein Rückwärts-Clip 🔁",
            text: "Na, verstehst du, was ich sage? 😏",
          });
        } catch (err) {
          if (!(err instanceof DOMException && err.name === "AbortError")) downloadBlob(blob, name);
        }
      } else {
        downloadBlob(blob, name);
      }
    } finally {
      setExporting(null);
    }
  };

  let status = "Tipp auf den Knopf & leg los!";
  if (recorder.status === "requesting") status = "Erlaube den Mikro-Zugriff … 🎙️";
  else if (isRecording) status = `Aufnahme läuft – tippen zum Stoppen (max. ${MAX_SECONDS / 60} Min.)`;
  else if (recorder.status === "processing") status = "Wird umgedreht … 🔄";
  else if (clip) status = "Neuer Versuch? Einfach nochmal tippen.";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center">
        <RecordButton
          recording={isRecording}
          busy={busy}
          analyser={active ? (isRecording ? recorder.analyser : player.analyser) : null}
          onClick={toggleRecord}
          label={isRecording ? "Aufnahme stoppen" : "Aufnahme starten"}
        />
        <div className="-mt-4 text-center" aria-live="polite">
          <p className="font-mono text-4xl font-semibold tabular-nums">
            {isRecording && <span className="mr-2 inline-block size-3 animate-pulse rounded-full bg-rose-500 align-middle" />}
            {formatTime(isRecording ? recorder.elapsed : (clip?.original.duration ?? 0))}
          </p>
          <p className="mt-1 text-sm text-white/60">{status}</p>
        </div>
      </div>

      {!clip && !locked && (
        <div className="rounded-3xl bg-linear-to-br from-violet-500/15 to-cyan-400/10 p-5 text-center ring-1 ring-white/10">
          <p className="text-sm text-white/60">💡 Keine Idee? Sag mal:</p>
          <p className="mt-1 font-display text-xl font-bold">„{IDEAS[ideaIndex]}“</p>
          <button
            type="button"
            onClick={() => {
              const others = IDEAS.map((_, i) => i).filter((i) => i !== ideaIndex);
              setIdeaIndex(randomItem(others));
            }}
            className="mt-3 rounded-full bg-white/10 px-4 py-1.5 text-sm font-semibold transition hover:bg-white/20"
          >
            🎲 Andere Idee
          </button>
        </div>
      )}

      {clip && (
        <>
          <div className="flex flex-col gap-3">
            <Waveform label="⏪ Rückwärts" buffer={clip.reversed} colors={VIVID} playheadRef={reverseHead} />
            <Waveform label="▶️ Original" buffer={clip.original} colors={MUTED} playheadRef={forwardHead} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => toggleClip("reverse")} disabled={locked} className={primaryButton}>
              {playingDir === "reverse" ? "■ Stopp" : "⏪ Rückwärts"}
            </button>
            <button type="button" onClick={() => toggleClip("forward")} disabled={locked} className={glassButton}>
              {playingDir === "forward" ? "■ Stopp" : "▶ Normal"}
            </button>
          </div>

          <Section title="Effekt">
            <div className="grid grid-cols-4 gap-2">
              {EFFECTS.map((fx) => {
                const selected = fx.id === effect;
                return (
                  <button
                    key={fx.id}
                    type="button"
                    onClick={() => chooseEffect(fx.id)}
                    disabled={locked}
                    aria-pressed={selected}
                    className={`flex flex-col items-center gap-1 rounded-2xl px-1 py-3 text-[11px] font-bold ring-1 transition active:scale-95 disabled:opacity-50 sm:text-xs ${
                      selected
                        ? "bg-linear-to-br from-fuchsia-500/35 to-cyan-400/20 ring-fuchsia-400/80 shadow-[0_0_24px_-6px_rgba(232,121,249,0.9)]"
                        : "bg-white/[0.04] ring-white/10 hover:bg-white/10"
                    }`}
                  >
                    <span className="text-2xl leading-none">{fx.emoji}</span>
                    {fx.label}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={randomize}
                disabled={locked}
                className="flex flex-col items-center gap-1 rounded-2xl bg-linear-to-br from-amber-400/25 to-pink-500/25 px-1 py-3 text-[11px] font-bold ring-1 ring-amber-300/40 transition hover:brightness-125 active:scale-95 disabled:opacity-50 sm:text-xs"
              >
                <span className="text-2xl leading-none">🎲</span>
                Zufall
              </button>
            </div>
          </Section>

          <Section
            title="Tempo & Stimmhöhe"
            aside={
              <span className="rounded-full bg-white/10 px-3 py-1 font-mono text-xs font-semibold tabular-nums">
                {rateLabel(rate)} · {rate.toFixed(2)}×
              </span>
            }
          >
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.05}
              value={rate}
              onChange={(e) => changeRate(Number(e.target.value))}
              disabled={locked}
              aria-label="Tempo und Stimmhöhe"
              className="range"
            />
            <div className="mt-2 flex items-center justify-between text-xs text-white/50">
              <span>👹 Monster</span>
              <button
                type="button"
                onClick={() => changeRate(1)}
                className="rounded-full px-2 py-0.5 font-semibold transition hover:bg-white/10 hover:text-white"
              >
                ↺ Normal
              </button>
              <span>Chipmunk 🐿️</span>
            </div>
          </Section>

          <div className="grid grid-cols-2 gap-3">
            <Toggle checked={loop} onChange={changeLoop} disabled={locked}>
              🔁 Endlos
            </Toggle>
            <Toggle checked={trim} onChange={onTrimChange} disabled={locked}>
              ✂️ Stille weg
            </Toggle>
          </div>

          <div className={`grid gap-3 ${canShare ? "grid-cols-2" : "grid-cols-1"}`}>
            <button
              type="button"
              onClick={() => exportClip("save")}
              disabled={locked || exporting !== null}
              className={glassButton}
            >
              {exporting === "save" ? "⏳ Moment …" : "💾 Speichern"}
            </button>
            {canShare && (
              <button
                type="button"
                onClick={() => exportClip("share")}
                disabled={locked || exporting !== null}
                className={glassButton}
              >
                {exporting === "share" ? "⏳ Moment …" : "📤 Teilen"}
              </button>
            )}
          </div>
          <p className="-mt-3 text-center text-xs text-white/40">
            Gespeichert wird die Rückwärts-Version mit Effekt & Tempo als WAV.
          </p>
        </>
      )}
    </div>
  );
}
