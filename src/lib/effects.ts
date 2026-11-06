/**
 * Stimm-Effekte als Web-Audio-Ketten. Funktionieren sowohl live (AudioContext)
 * als auch beim Export (OfflineAudioContext).
 */

export type EffectId = "none" | "echo" | "hall" | "robot" | "alien" | "radio" | "distort";

export const EFFECTS: { id: EffectId; label: string; emoji: string }[] = [
  { id: "none", label: "Pur", emoji: "🎤" },
  { id: "echo", label: "Echo", emoji: "🏔️" },
  { id: "hall", label: "Kathedrale", emoji: "⛪" },
  { id: "robot", label: "Roboter", emoji: "🤖" },
  { id: "alien", label: "Alien", emoji: "👽" },
  { id: "radio", label: "Funkgerät", emoji: "📻" },
  { id: "distort", label: "Krass", emoji: "🔥" },
];

/** Wie lange ein Effekt nach dem Ende noch nachklingt (Sekunden). */
export const EFFECT_TAIL: Record<EffectId, number> = {
  none: 0,
  echo: 2.5,
  hall: 3,
  robot: 0,
  alien: 0.1,
  radio: 0,
  distort: 0,
};

function makeImpulse(ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** decay;
    }
  }
  return impulse;
}

function makeDistortionCurve(amount: number): Float32Array<ArrayBuffer> {
  const n = 44100;
  const curve = new Float32Array(n);
  const deg = Math.PI / 180;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

/**
 * Verbindet input → Effekt → output. Gibt eine Aufräum-Funktion zurück,
 * die Oszillatoren stoppt und alle Effekt-Knoten trennt.
 */
export function connectEffect(
  ctx: BaseAudioContext,
  input: AudioNode,
  output: AudioNode,
  effect: EffectId,
): () => void {
  const nodes: AudioNode[] = [];
  const oscillators: OscillatorNode[] = [];
  const gain = (value: number) => {
    const node = ctx.createGain();
    node.gain.value = value;
    nodes.push(node);
    return node;
  };

  switch (effect) {
    case "echo": {
      const delay = ctx.createDelay(1);
      delay.delayTime.value = 0.28;
      const feedback = gain(0.45);
      const wet = gain(0.55);
      nodes.push(delay);
      input.connect(output);
      input.connect(delay);
      delay.connect(feedback);
      feedback.connect(delay);
      delay.connect(wet);
      wet.connect(output);
      break;
    }
    case "hall": {
      const convolver = ctx.createConvolver();
      convolver.buffer = makeImpulse(ctx, 3, 2.2);
      nodes.push(convolver);
      const dry = gain(0.55);
      const wet = gain(0.9);
      input.connect(dry);
      dry.connect(output);
      input.connect(convolver);
      convolver.connect(wet);
      wet.connect(output);
      break;
    }
    case "robot": {
      // Ringmodulation: Signal × Sinus → metallischer Roboter-Klang
      const ring = gain(0);
      const osc = ctx.createOscillator();
      osc.frequency.value = 50;
      osc.connect(ring.gain);
      oscillators.push(osc);
      const boost = gain(1.6);
      input.connect(ring);
      ring.connect(boost);
      boost.connect(output);
      break;
    }
    case "alien": {
      // Vibrato (schwankende Tonhöhe) + etwas Ringmodulation
      const delay = ctx.createDelay(0.1);
      delay.delayTime.value = 0.012;
      nodes.push(delay);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 7;
      const depth = gain(0.005);
      lfo.connect(depth);
      depth.connect(delay.delayTime);
      oscillators.push(lfo);

      const ring = gain(0);
      const carrier = ctx.createOscillator();
      carrier.frequency.value = 420;
      carrier.connect(ring.gain);
      oscillators.push(carrier);
      const ringMix = gain(0.35);

      input.connect(delay);
      delay.connect(output);
      delay.connect(ring);
      ring.connect(ringMix);
      ringMix.connect(output);
      break;
    }
    case "radio": {
      const highpass = ctx.createBiquadFilter();
      highpass.type = "highpass";
      highpass.frequency.value = 500;
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.value = 2800;
      const shaper = ctx.createWaveShaper();
      shaper.curve = makeDistortionCurve(30);
      nodes.push(highpass, lowpass, shaper);
      const level = gain(0.8);
      input.connect(highpass);
      highpass.connect(lowpass);
      lowpass.connect(shaper);
      shaper.connect(level);
      level.connect(output);
      break;
    }
    case "distort": {
      const shaper = ctx.createWaveShaper();
      shaper.curve = makeDistortionCurve(400);
      shaper.oversample = "4x";
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.value = 6000;
      nodes.push(shaper, lowpass);
      const level = gain(0.45);
      input.connect(shaper);
      shaper.connect(lowpass);
      lowpass.connect(level);
      level.connect(output);
      break;
    }
    default:
      input.connect(output);
  }

  oscillators.forEach((osc) => osc.start());

  let cleaned = false;
  return () => {
    if (cleaned) return;
    cleaned = true;
    for (const osc of oscillators) {
      try {
        osc.stop();
      } catch {
        // schon gestoppt
      }
      osc.disconnect();
    }
    nodes.forEach((node) => node.disconnect());
  };
}

/** Rendert Buffer + Effekt + Tempo offline in einen neuen Buffer (für Download/Teilen). */
export async function renderWithEffect(
  buffer: AudioBuffer,
  effect: EffectId,
  rate: number,
): Promise<AudioBuffer> {
  const seconds = buffer.duration / rate + EFFECT_TAIL[effect];
  const offline = new OfflineAudioContext(2, Math.ceil(seconds * buffer.sampleRate), buffer.sampleRate);
  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = rate;
  connectEffect(offline, source, offline.destination, effect);
  source.start();
  return offline.startRendering();
}
