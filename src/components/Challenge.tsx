"use client";

import { type CSSProperties, type ReactNode, useMemo, useState } from "react";
import type { Player } from "@/hooks/usePlayer";
import type { Recorder } from "@/hooks/useRecorder";
import { formatTime, normalize, reverseBuffer, trimSilence, vibeScore } from "@/lib/audio";
import { Confetti } from "./Confetti";
import { Portal } from "./Portal";
import { RecordButton } from "./RecordButton";
import type { Clip } from "./ReverseStudio";
import { glassButton, primaryButton } from "./ui";

const WIN_SCORE = 65;

function verdict(score: number) {
  if (score >= 85) return "🏆 Legendär! Du bist ein Rückwärts-Profi.";
  if (score >= WIN_SCORE) return "🔥 Richtig stark!";
  if (score >= 40) return "😎 Gar nicht schlecht – da geht noch was!";
  return "💀 Uff. Hör nochmal genau hin und probier's erneut!";
}

type Props = {
  active: boolean;
  recorder: Recorder;
  player: Player;
  clip: Clip | null;
  trim: boolean;
  onGoToStudio: () => void;
};

/**
 * Rückwärts-Challenge: Die Rückwärts-Version nachmachen, die Imitation wird
 * wieder umgedreht – und klingt im besten Fall wie das Original.
 */
export function Challenge({ active, recorder, player, clip, trim, onGoToStudio }: Props) {
  const [imitation, setImitation] = useState<AudioBuffer | null>(null);
  const [attempt, setAttempt] = useState(0);

  const result = useMemo(
    () => (imitation ? reverseBuffer(normalize(trim ? trimSilence(imitation) : imitation)) : null),
    [imitation, trim],
  );
  const score = useMemo(
    () => (clip && result ? vibeScore(clip.original, result) : null),
    [clip, result],
  );

  const isRecording = recorder.status === "recording";
  const busy = recorder.status === "requesting" || recorder.status === "processing";
  const locked = isRecording || busy;

  if (!clip) {
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <span className="animate-float text-6xl">🏆</span>
        <h2 className="font-display text-2xl font-bold">Rückwärts-Challenge</h2>
        <p className="max-w-sm text-white/70">
          Nimm im Studio zuerst einen Satz auf. Dann hörst du ihn rückwärts, machst ihn nach – und wir drehen
          deine Version wieder um. Klingt sie wie das Original? 🤯
        </p>
        <button type="button" onClick={onGoToStudio} className={`${primaryButton} mt-2`}>
          🎙️ Ab ins Studio
        </button>
      </div>
    );
  }

  const toggle = (id: string, buffer: AudioBuffer) => {
    if (player.playingId === id) player.stop();
    else void player.play({ id, buffer });
  };
  const label = (id: string, text: string) => (player.playingId === id ? "■ Stopp" : text);

  const toggleRecord = () => {
    if (isRecording) {
      recorder.stop();
      return;
    }
    player.stop();
    void recorder.start((buffer) => {
      setImitation(buffer);
      setAttempt((n) => n + 1);
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="text-center">
        <h2 className="font-display text-2xl font-bold">Rückwärts-Challenge 🏆</h2>
        <p className="mt-2 text-sm text-white/70">
          Mach die Rückwärts-Version so genau wie möglich nach. Wir drehen sie wieder um – wenn du gut warst,
          hörst du deinen Original-Satz!
        </p>
      </div>

      <Step number={1} title="Vorlage anhören">
        <button
          type="button"
          onClick={() => toggle("challenge-template", clip.reversed)}
          disabled={locked}
          className={`${primaryButton} w-full`}
        >
          {label("challenge-template", `⏪ Rückwärts-Vorlage (${formatTime(clip.reversed.duration)})`)}
        </button>
        <p className="mt-2 text-xs text-white/50">Tipp: Hör sie dir ein paar Mal an und sprich leise mit.</p>
      </Step>

      <Step number={2} title="Nachmachen">
        <div className="flex flex-col items-center">
          <RecordButton
            size="md"
            recording={isRecording}
            busy={busy}
            analyser={active ? (isRecording ? recorder.analyser : player.analyser) : null}
            onClick={toggleRecord}
            label={isRecording ? "Imitation stoppen" : "Imitation aufnehmen"}
          />
          <p className="-mt-2 font-mono text-2xl font-semibold tabular-nums" aria-live="polite">
            {formatTime(isRecording ? recorder.elapsed : (imitation?.duration ?? 0))}
          </p>
          <p className="text-sm text-white/60">
            {isRecording ? "Los geht's – tippen zum Stoppen" : imitation ? "Nochmal? Einfach tippen." : "Tippen & nachsprechen"}
          </p>
        </div>
      </Step>

      {result && score !== null && (
        <Step number={3} title="Ergebnis">
          <div className="flex flex-col items-center gap-4">
            <ScoreRing key={attempt} score={score} />
            <p className="animate-pop text-center font-display text-lg font-bold">{verdict(score)}</p>
            <div className="grid w-full grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => toggle("challenge-result", result)}
                disabled={locked}
                className={primaryButton}
              >
                {label("challenge-result", "🔁 Dein Ergebnis")}
              </button>
              <button
                type="button"
                onClick={() => toggle("challenge-original", clip.original)}
                disabled={locked}
                className={glassButton}
              >
                {label("challenge-original", "▶ Original")}
              </button>
            </div>
            <p className="text-center text-xs text-white/40">
              Der Vibe-Score vergleicht nur den Lautstärke-Verlauf – am Ende zählt, was du hörst 😉
            </p>
          </div>
          {score >= WIN_SCORE && (
            <Portal>
              <Confetti key={attempt} />
            </Portal>
          )}
        </Step>
      )}
    </div>
  );
}

function Step({ number, title, children }: { number: number; title: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl bg-white/[0.03] p-4 ring-1 ring-white/10">
      <h3 className="mb-3 flex items-center gap-3 font-bold">
        <span className="grid size-7 place-items-center rounded-full bg-linear-to-br from-fuchsia-500 to-cyan-400 text-sm">
          {number}
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function ScoreRing({ score }: { score: number }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - score / 100);

  return (
    <div className="relative size-40">
      <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden>
        <defs>
          <linearGradient id="score-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f472b6" />
            <stop offset="55%" stopColor="#c084fc" />
            <stop offset="100%" stopColor="#22d3ee" />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r={radius} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="10" />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="url(#score-gradient)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference}
          className="animate-score drop-shadow-[0_0_10px_rgba(232,121,249,0.7)]"
          style={{ "--score-offset": `${offset}px` } as CSSProperties}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="animate-pop text-center">
          <div className="font-display text-5xl font-extrabold">{score}</div>
          <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/60">Vibe-Score</div>
        </div>
      </div>
    </div>
  );
}
