"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getAudioContext, getOutput, setAudioSession } from "@/lib/audio";
import { connectEffect, type EffectId, getEffect, prepareBuffer } from "@/lib/effects";

type PlayOptions = {
  /** Kennung, damit Buttons wissen, ob gerade "ihr" Clip läuft. */
  id: string;
  buffer: AudioBuffer;
  effect?: EffectId;
  rate?: number;
  loop?: boolean;
  /** Element, das als Abspiel-Marker über die Wellenform wandert. */
  playhead?: HTMLElement | null;
  /** Wird pro Bild mit der aktuellen Position im Buffer (Sekunden) aufgerufen – z. B. fürs Video. */
  onPosition?: (seconds: number) => void;
};

type Current = {
  id: string;
  source: AudioBufferSourceNode;
  cleanupEffect: () => void;
  playhead: HTMLElement | null;
  raf: number | null;
  rate: number;
};

function hidePlayhead(el: HTMLElement | null) {
  if (el) el.style.opacity = "0";
}

export function usePlayer() {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const currentRef = useRef<Current | null>(null);

  const stop = useCallback(() => {
    const current = currentRef.current;
    currentRef.current = null;
    if (current) {
      current.source.onended = null;
      try {
        current.source.stop();
      } catch {
        // war schon zu Ende
      }
      current.source.disconnect();
      current.cleanupEffect();
      if (current.raf !== null) cancelAnimationFrame(current.raf);
      hidePlayhead(current.playhead);
    }
    setPlayingId(null);
    setAnalyser(null);
  }, []);

  const play = useCallback(
    async ({ id, buffer, effect = "none", rate = 1, loop = false, playhead = null, onPosition }: PlayOptions) => {
      stop();
      setAudioSession("playback");
      const ctx = await getAudioContext();
      const output = getOutput(ctx);
      const prepared = prepareBuffer(buffer, effect);

      const source = ctx.createBufferSource();
      source.buffer = prepared;
      source.playbackRate.value = rate;
      source.loop = loop;
      const cleanupEffect = connectEffect(ctx, source, output.input, effect);

      const current: Current = { id, source, cleanupEffect, playhead, raf: null, rate };
      currentRef.current = current;

      // Abspiel-Marker: Position in Buffer-Sekunden aufsummieren (Tempo kann sich live ändern).
      let position = 0;
      let last = ctx.currentTime;
      const tick = () => {
        const now = ctx.currentTime;
        position += (now - last) * current.rate;
        last = now;
        const seconds = source.loop ? position % buffer.duration : Math.min(position, buffer.duration);
        const progress = seconds / buffer.duration;
        onPosition?.(seconds);
        if (playhead) {
          playhead.style.opacity = "1";
          playhead.style.left = `${progress * 100}%`;
        }
        current.raf = requestAnimationFrame(tick);
      };

      source.onended = () => {
        if (currentRef.current !== current) return;
        currentRef.current = null;
        if (current.raf !== null) cancelAnimationFrame(current.raf);
        hidePlayhead(playhead);
        setPlayingId(null);
        setAnalyser(null);
        // Hall/Echo ausklingen lassen, dann aufräumen.
        window.setTimeout(current.cleanupEffect, getEffect(effect).tail * 1000 + 100);
      };

      source.start();
      current.raf = requestAnimationFrame(tick);
      setPlayingId(id);
      setAnalyser(output.analyser);
    },
    [stop],
  );

  /** Tempo der laufenden Wiedergabe live ändern. */
  const setRate = useCallback((rate: number) => {
    const current = currentRef.current;
    if (!current) return;
    current.rate = rate;
    current.source.playbackRate.value = rate;
  }, []);

  /** Loop der laufenden Wiedergabe live an-/ausschalten. */
  const setLoop = useCallback((loop: boolean) => {
    const current = currentRef.current;
    if (current) current.source.loop = loop;
  }, []);

  useEffect(() => stop, [stop]);

  return { playingId, analyser, play, stop, setRate, setLoop };
}

export type Player = ReturnType<typeof usePlayer>;
