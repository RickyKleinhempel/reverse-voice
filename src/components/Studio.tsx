"use client";

import { useRef, useState } from "react";
import type { Player } from "@/hooks/usePlayer";
import { MAX_SECONDS, type Recorder } from "@/hooks/useRecorder";
import { formatTime, isLoud, setLoud } from "@/lib/audio";
import { EFFECTS, type EffectId } from "@/lib/effects";
import { Portal } from "./Portal";
import { RecordButton } from "./RecordButton";
import type { Clip } from "./ReverseStudio";
import { ShareSheet } from "./ShareSheet";
import { glassButton, primaryButton, Section, Toggle } from "./ui";
import { Waveform } from "./Waveform";

const VIVID = ["#f472b6", "#c084fc", "#22d3ee"] as const;
const MUTED = ["rgba(255,255,255,0.32)"] as const;
const RANDOM_RATES = [0.6, 0.75, 1, 1, 1.25, 1.5, 1.8];

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

function randomItem<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
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
  const [loud, setLoudState] = useState(isLoud);
  const [ideaIndex, setIdeaIndex] = useState(0);
  const [sharing, setSharing] = useState(false);

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
    // Effekt sofort hörbar machen
    playClip(playingDir ?? "reverse", { effect: next });
  };

  const randomize = () => {
    const nextEffect = randomItem(EFFECTS.filter((fx) => fx.id !== effect && fx.id !== "none")).id;
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

  const changeLoud = (value: boolean) => {
    setLoudState(value);
    setLoud(value);
  };

  const openShare = () => {
    player.stop();
    setSharing(true);
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
            {isRecording && (
              <span className="mr-2 inline-block size-3 animate-pulse rounded-full bg-rose-500 align-middle" />
            )}
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
            onClick={() => setIdeaIndex(randomItem(IDEAS.map((_, i) => i).filter((i) => i !== ideaIndex)))}
            className="mt-3 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold transition hover:bg-white/20"
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

          <Section
            title="🎭 Stimmverzerrer"
            aside={<span className="whitespace-nowrap text-xs text-white/40">tippen = hören</span>}
          >
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
                    className={`flex min-h-[4.25rem] flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2.5 text-[11px] font-bold ring-1 transition active:scale-90 disabled:opacity-50 sm:text-xs ${
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
                className="flex min-h-[4.25rem] flex-col items-center justify-center gap-1 rounded-2xl bg-linear-to-br from-amber-400/25 to-pink-500/25 px-1 py-2.5 text-[11px] font-bold ring-1 ring-amber-300/40 transition hover:brightness-125 active:scale-90 disabled:opacity-50 sm:text-xs"
              >
                <span className="text-2xl leading-none">🎲</span>
                Zufall
              </button>
            </div>
          </Section>

          <Section
            title="⚡ Tempo"
            aside={
              <span className="whitespace-nowrap rounded-full bg-white/10 px-3 py-1 font-mono text-xs font-semibold tabular-nums">
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
                className="rounded-full px-3 py-1.5 font-semibold transition hover:bg-white/10 hover:text-white"
              >
                ↺ Normal
              </button>
              <span>Chipmunk 🐿️</span>
            </div>
          </Section>

          <div className="grid gap-2">
            <Toggle checked={loud} onChange={changeLoud} disabled={locked}>
              <span className="block">📢 Extra laut</span>
              <span className="block text-xs font-normal text-white/50">
                Kräftig über den Handy-Lautsprecher – auch zum Freisprechen
              </span>
            </Toggle>
            <Toggle checked={loop} onChange={changeLoop} disabled={locked}>
              <span className="block">🔁 Endlosschleife</span>
              <span className="block text-xs font-normal text-white/50">Clip läuft immer wieder</span>
            </Toggle>
            <Toggle checked={trim} onChange={onTrimChange} disabled={locked}>
              <span className="block">✂️ Stille wegschneiden</span>
              <span className="block text-xs font-normal text-white/50">Pausen am Anfang & Ende entfernen</span>
            </Toggle>
          </div>

          <button type="button" onClick={openShare} disabled={locked} className={`${primaryButton} text-lg`}>
            📤 Teilen & Speichern
          </button>
          <p className="-mt-3 text-center text-xs text-white/40">
            Als MP3, WAV oder Video – für WhatsApp, TikTok, Insta & Co.
          </p>

          {/* App-artige Leiste unten am Handy */}
          {active && !sharing && (
            <Portal>
              <div className="fixed inset-x-0 bottom-0 z-30 animate-fade-in px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:hidden">
                <div className="flex items-center gap-2 rounded-full bg-[#160b29]/85 p-2 shadow-[0_10px_40px_-5px_rgba(0,0,0,0.9)] ring-1 ring-white/15 backdrop-blur-xl">
                  <button
                    type="button"
                    onClick={() => toggleClip("reverse")}
                    disabled={locked}
                    className="flex-1 rounded-full bg-linear-to-r from-fuchsia-500 to-pink-500 py-3.5 text-sm font-bold disabled:opacity-50"
                  >
                    {playingDir === "reverse" ? "■ Stopp" : "⏪ Abspielen"}
                  </button>
                  <button
                    type="button"
                    onClick={toggleRecord}
                    disabled={busy}
                    aria-label={isRecording ? "Aufnahme stoppen" : "Neu aufnehmen"}
                    className={`grid size-14 shrink-0 place-items-center rounded-full ring-4 ring-white/10 transition active:scale-90 ${
                      isRecording ? "animate-pulse bg-rose-600" : "bg-linear-to-br from-rose-500 to-orange-400"
                    }`}
                  >
                    <span className={isRecording ? "size-5 rounded-md bg-white" : "size-5 rounded-full bg-white"} />
                  </button>
                  <button
                    type="button"
                    onClick={openShare}
                    disabled={locked}
                    className="flex-1 rounded-full bg-white/10 py-3.5 text-sm font-bold ring-1 ring-white/15 disabled:opacity-50"
                  >
                    📤 Teilen
                  </button>
                </div>
              </div>
            </Portal>
          )}

          {sharing && (
            <Portal>
              <ShareSheet clip={clip} effect={effect} rate={rate} onClose={() => setSharing(false)} />
            </Portal>
          )}
        </>
      )}
    </div>
  );
}
