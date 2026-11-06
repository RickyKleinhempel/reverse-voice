"use client";

import { useRef, useState } from "react";
import { usePlayer } from "@/hooks/usePlayer";
import { useRecorder } from "@/hooks/useRecorder";
import { reverseBuffer, trimSilence } from "@/lib/audio";
import { Challenge } from "./Challenge";
import { Studio } from "./Studio";

export type Clip = {
  id: number;
  raw: AudioBuffer;
  original: AudioBuffer;
  reversed: AudioBuffer;
};

function deriveClip(raw: AudioBuffer, trim: boolean, id: number): Clip {
  const original = trim ? trimSilence(raw) : raw;
  return { id, raw, original, reversed: reverseBuffer(original) };
}

const TABS = [
  { id: "studio", label: "🎛️ Studio" },
  { id: "challenge", label: "🏆 Challenge" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export default function ReverseStudio() {
  const recorder = useRecorder();
  const player = usePlayer();
  const [tab, setTab] = useState<Tab>("studio");
  const [clip, setClip] = useState<Clip | null>(null);
  const [trim, setTrim] = useState(true);
  const nextId = useRef(1);

  const locked = recorder.status !== "idle";

  const switchTab = (next: Tab) => {
    player.stop();
    recorder.clearError();
    setTab(next);
  };

  const handleRecorded = (raw: AudioBuffer) => {
    const next = deriveClip(raw, trim, nextId.current++);
    setClip(next);
    return next;
  };

  const handleTrimChange = (value: boolean) => {
    player.stop();
    setTrim(value);
    setClip((current) => current && deriveClip(current.raw, value, current.id));
  };

  return (
    <div className="w-full rounded-[2rem] border border-white/10 bg-white/[0.04] p-4 shadow-[0_30px_120px_-30px_rgba(168,85,247,0.55)] backdrop-blur-2xl sm:p-8">
      <div
        role="tablist"
        aria-label="Modus"
        className="mx-auto mb-6 grid w-full max-w-xs grid-cols-2 gap-1 rounded-full bg-black/30 p-1 ring-1 ring-white/10"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            disabled={locked && tab !== t.id}
            onClick={() => switchTab(t.id)}
            className={`rounded-full py-2 text-sm font-bold transition disabled:opacity-40 ${
              tab === t.id
                ? "bg-linear-to-r from-fuchsia-500 to-violet-500 text-white shadow-[0_0_20px_-4px_rgba(217,70,239,0.9)]"
                : "text-white/60 hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {recorder.error && (
        <p
          role="alert"
          className="mb-4 rounded-2xl bg-rose-500/15 px-4 py-3 text-sm text-rose-200 ring-1 ring-rose-400/30"
        >
          {recorder.error}
        </p>
      )}

      <div role="tabpanel" hidden={tab !== "studio"}>
        <Studio
          active={tab === "studio"}
          recorder={recorder}
          player={player}
          clip={clip}
          trim={trim}
          onTrimChange={handleTrimChange}
          onRecorded={handleRecorded}
        />
      </div>
      <div role="tabpanel" hidden={tab !== "challenge"}>
        <Challenge
          key={clip?.id ?? 0}
          active={tab === "challenge"}
          recorder={recorder}
          player={player}
          clip={clip}
          trim={trim}
          onGoToStudio={() => switchTab("studio")}
        />
      </div>
    </div>
  );
}
