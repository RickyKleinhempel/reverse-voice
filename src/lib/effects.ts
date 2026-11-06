import { createLimiter, isLoud, LOUD_BOOST } from "./audio";

/**
 * Stimm-Effekte & Stimmverzerrer als Web-Audio-Ketten.
 * Funktionieren live (AudioContext) und beim Export (OfflineAudioContext).
 */

export type EffectId =
  | "none"
  | "helium"
  | "demon"
  | "robot"
  | "alien"
  | "bit8"
  | "clones"
  | "underwater"
  | "megaphone"
  | "radio"
  | "distort"
  | "echo"
  | "hall"
  | "ghost"
  | "wobble";

/** Bausteine, mit denen die Effekte zusammengesteckt werden. */
type Kit = {
  ctx: BaseAudioContext;
  gain: (value: number) => GainNode;
  filter: (type: BiquadFilterType, frequency: number, q?: number, gainDb?: number) => BiquadFilterNode;
  delay: (seconds: number) => DelayNode;
  shaper: (amount: number) => WaveShaperNode;
  reverb: (seconds: number, decay: number) => ConvolverNode;
  /** Oszillator, der automatisch mitstartet. */
  osc: (frequency: number, type?: OscillatorType) => OscillatorNode;
  /** LFO: moduliert einen Parameter um ±depth. */
  lfo: (frequency: number, depth: number, target: AudioParam, type?: OscillatorType) => void;
  /** Tonhöhe ändern, ohne das Tempo zu ändern. */
  pitch: (input: AudioNode, output: AudioNode, semitones: number) => void;
  /** Verbindet Knoten der Reihe nach. */
  chain: (...nodes: AudioNode[]) => void;
};

type EffectDef = {
  id: EffectId;
  label: string;
  emoji: string;
  /** Nachklingzeit in Sekunden (für Export & Aufräumen). */
  tail: number;
  /** Optionale Bearbeitung des Buffers vorab (für Effekte, die Web Audio nicht live kann). */
  process?: (buffer: AudioBuffer) => AudioBuffer;
  build: (kit: Kit, input: AudioNode, output: AudioNode) => void;
};

function makeImpulse(ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** decay;
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

/** 8-Bit-Sound: Samplerate runter (Sample & Hold) und Bittiefe reduzieren. */
function bitcrush(buffer: AudioBuffer, bits = 5, targetRate = 7000): AudioBuffer {
  const out = new AudioBuffer({
    length: buffer.length,
    numberOfChannels: buffer.numberOfChannels,
    sampleRate: buffer.sampleRate,
  });
  const levels = 2 ** (bits - 1);
  const step = buffer.sampleRate / targetRate;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const input = buffer.getChannelData(ch);
    const output = new Float32Array(input.length);
    let hold = 0;
    let counter = step;
    for (let i = 0; i < input.length; i++) {
      counter += 1;
      if (counter >= step) {
        counter -= step;
        hold = Math.round(input[i] * levels) / levels;
      }
      output[i] = hold;
    }
    out.copyToChannel(output, ch);
  }
  return out;
}

export const EFFECTS: EffectDef[] = [
  {
    id: "none",
    label: "Pur",
    emoji: "🎤",
    tail: 0,
    build: (k, input, output) => k.chain(input, output),
  },
  {
    id: "helium",
    label: "Helium",
    emoji: "🎈",
    tail: 0.1,
    build: (k, input, output) => {
      const brighten = k.filter("highshelf", 3000, 0.7, 4);
      k.pitch(input, brighten, 8);
      k.chain(brighten, output);
    },
  },
  {
    id: "demon",
    label: "Dämon",
    emoji: "😈",
    tail: 0.6,
    build: (k, input, output) => {
      const bus = k.gain(1);
      const low = k.gain(0.7);
      k.pitch(input, bus, -7);
      k.pitch(input, low, -12);
      k.chain(low, bus);
      const growl = k.shaper(12);
      const bass = k.filter("lowshelf", 220, 0.7, 7);
      const level = k.gain(0.75);
      k.chain(bus, growl, bass, level, output);
      const room = k.reverb(1.2, 3);
      const wet = k.gain(0.25);
      k.chain(level, room, wet, output);
    },
  },
  {
    id: "robot",
    label: "Roboter",
    emoji: "🤖",
    tail: 0,
    build: (k, input, output) => {
      // Ringmodulation (Signal × Sinus) + kurzer Kammfilter → metallisch
      const ring = k.gain(0);
      k.osc(50).connect(ring.gain);
      const comb = k.delay(0.006);
      const feedback = k.gain(0.45);
      const boost = k.gain(1.5);
      k.chain(input, ring, boost, output);
      k.chain(boost, comb, feedback, comb);
      k.chain(comb, output);
    },
  },
  {
    id: "alien",
    label: "Alien",
    emoji: "👽",
    tail: 0.1,
    build: (k, input, output) => {
      const vibrato = k.delay(0.012);
      k.lfo(7, 0.005, vibrato.delayTime);
      const ring = k.gain(0);
      k.osc(420).connect(ring.gain);
      const ringMix = k.gain(0.35);
      k.chain(input, vibrato, output);
      k.chain(vibrato, ring, ringMix, output);
    },
  },
  {
    id: "bit8",
    label: "8-Bit",
    emoji: "👾",
    tail: 0,
    process: (buffer) => bitcrush(buffer),
    build: (k, input, output) => k.chain(input, k.filter("lowpass", 7000), k.gain(0.8), output),
  },
  {
    id: "clones",
    label: "Klone",
    emoji: "👯",
    tail: 0.2,
    build: (k, input, output) => {
      k.chain(input, k.gain(0.6), output);
      const high = k.gain(0.45);
      const low = k.gain(0.45);
      const highDelay = k.delay(0.025);
      const lowDelay = k.delay(0.04);
      k.chain(input, highDelay);
      k.chain(input, lowDelay);
      k.pitch(highDelay, high, 5);
      k.pitch(lowDelay, low, -5);
      k.chain(high, output);
      k.chain(low, output);
    },
  },
  {
    id: "underwater",
    label: "Blubb",
    emoji: "🌊",
    tail: 0.2,
    build: (k, input, output) => {
      const lowpass = k.filter("lowpass", 650, 9);
      k.lfo(1.4, 350, lowpass.frequency);
      const wobble = k.delay(0.01);
      k.lfo(3, 0.003, wobble.delayTime);
      k.chain(input, wobble, lowpass, k.gain(1.3), output);
    },
  },
  {
    id: "megaphone",
    label: "Megafon",
    emoji: "📢",
    tail: 0.8,
    build: (k, input, output) => {
      const level = k.gain(0.7);
      k.chain(
        input,
        k.filter("highpass", 600),
        k.filter("peaking", 1800, 1, 10),
        k.filter("lowpass", 3800),
        k.shaper(60),
        level,
        output,
      );
      const slap = k.delay(0.12);
      const feedback = k.gain(0.25);
      const wet = k.gain(0.3);
      k.chain(level, slap, wet, output);
      k.chain(slap, feedback, slap);
    },
  },
  {
    id: "radio",
    label: "Funk",
    emoji: "📻",
    tail: 0,
    build: (k, input, output) =>
      k.chain(input, k.filter("highpass", 500), k.filter("lowpass", 2800), k.shaper(30), k.gain(0.8), output),
  },
  {
    id: "distort",
    label: "Krass",
    emoji: "🔥",
    tail: 0,
    build: (k, input, output) => {
      const shaper = k.shaper(400);
      shaper.oversample = "4x";
      k.chain(input, shaper, k.filter("lowpass", 6000), k.gain(0.45), output);
    },
  },
  {
    id: "echo",
    label: "Echo",
    emoji: "🏔️",
    tail: 2.5,
    build: (k, input, output) => {
      const delay = k.delay(0.28);
      const feedback = k.gain(0.45);
      k.chain(input, output);
      k.chain(input, delay, feedback, delay);
      k.chain(delay, k.gain(0.55), output);
    },
  },
  {
    id: "hall",
    label: "Kirche",
    emoji: "⛪",
    tail: 3,
    build: (k, input, output) => {
      k.chain(input, k.gain(0.55), output);
      k.chain(input, k.reverb(3, 2.2), k.gain(0.9), output);
    },
  },
  {
    id: "ghost",
    label: "Geist",
    emoji: "👻",
    tail: 4,
    build: (k, input, output) => {
      const drift = k.delay(0.02);
      k.lfo(0.8, 0.008, drift.delayTime);
      const airy = k.filter("highpass", 300);
      k.chain(input, drift, airy);
      k.chain(airy, k.gain(0.3), output);
      k.chain(airy, k.reverb(4, 1.6), k.gain(1.1), output);
    },
  },
  {
    id: "wobble",
    label: "Wobble",
    emoji: "🌀",
    tail: 0.1,
    build: (k, input, output) => {
      const vibrato = k.delay(0.03);
      k.lfo(2.2, 0.012, vibrato.delayTime);
      const tremolo = k.gain(0.8);
      k.lfo(5, 0.2, tremolo.gain);
      k.chain(input, vibrato, tremolo, output);
    },
  },
];

const EFFECT_MAP = new Map(EFFECTS.map((fx) => [fx.id, fx]));

export function getEffect(id: EffectId): EffectDef {
  return EFFECT_MAP.get(id) ?? EFFECTS[0];
}

const processed = new WeakMap<AudioBuffer, Map<EffectId, AudioBuffer>>();

/** Buffer für einen Effekt vorbereiten (z. B. 8-Bit). Ergebnis wird gecacht. */
export function prepareBuffer(buffer: AudioBuffer, effect: EffectId): AudioBuffer {
  const def = getEffect(effect);
  if (!def.process) return buffer;
  let cache = processed.get(buffer);
  if (!cache) {
    cache = new Map();
    processed.set(buffer, cache);
  }
  let result = cache.get(effect);
  if (!result) {
    result = def.process(buffer);
    cache.set(effect, result);
  }
  return result;
}

/**
 * Verbindet input → Effekt → output. Gibt eine Aufräum-Funktion zurück,
 * die alle Oszillatoren stoppt und die Effekt-Knoten trennt.
 */
export function connectEffect(
  ctx: BaseAudioContext,
  input: AudioNode,
  output: AudioNode,
  effect: EffectId,
): () => void {
  const nodes: AudioNode[] = [];
  const sources: { node: AudioScheduledSourceNode; offset: number }[] = [];
  const track = <T extends AudioNode>(node: T) => {
    nodes.push(node);
    return node;
  };

  const kit: Kit = {
    ctx,
    gain: (value) => {
      const node = track(ctx.createGain());
      node.gain.value = value;
      return node;
    },
    filter: (type, frequency, q = 0.7, gainDb = 0) => {
      const node = track(ctx.createBiquadFilter());
      node.type = type;
      node.frequency.value = frequency;
      node.Q.value = q;
      node.gain.value = gainDb;
      return node;
    },
    delay: (seconds) => {
      const node = track(ctx.createDelay(1));
      node.delayTime.value = seconds;
      return node;
    },
    shaper: (amount) => {
      const node = track(ctx.createWaveShaper());
      node.curve = makeDistortionCurve(amount);
      return node;
    },
    reverb: (seconds, decay) => {
      const node = track(ctx.createConvolver());
      node.buffer = makeImpulse(ctx, seconds, decay);
      return node;
    },
    osc: (frequency, type = "sine") => {
      const node = track(ctx.createOscillator());
      node.type = type;
      node.frequency.value = frequency;
      sources.push({ node, offset: 0 });
      return node;
    },
    lfo: (frequency, depth, target, type = "sine") => {
      const depthGain = kit.gain(depth);
      kit.osc(frequency, type).connect(depthGain);
      depthGain.connect(target);
    },
    pitch: (from, to, semitones) => {
      // Zwei Delay-Lines mit sägezahnförmig wanderndem Delay, um eine halbe
      // Periode versetzt und per sin²-Fenster übergeblendet (Summe = 1).
      const ratio = 2 ** (semitones / 12);
      const period = 0.1;
      const length = Math.round(period * ctx.sampleRate);
      const ramp = ctx.createBuffer(1, length, ctx.sampleRate);
      const window = ctx.createBuffer(1, length, ctx.sampleRate);
      const r = ramp.getChannelData(0);
      const w = window.getChannelData(0);
      for (let i = 0; i < length; i++) {
        const t = i / length;
        r[i] = ratio > 1 ? 1 - t : t;
        w[i] = Math.sin(Math.PI * t) ** 2;
      }
      for (const offset of [0, period / 2]) {
        const line = kit.delay(0);
        const depth = kit.gain(Math.abs(ratio - 1) * period);
        const vca = kit.gain(0);
        const mod = track(ctx.createBufferSource());
        mod.buffer = ramp;
        mod.loop = true;
        const fade = track(ctx.createBufferSource());
        fade.buffer = window;
        fade.loop = true;
        mod.connect(depth);
        depth.connect(line.delayTime);
        fade.connect(vca.gain);
        from.connect(line);
        line.connect(vca);
        vca.connect(to);
        sources.push({ node: mod, offset }, { node: fade, offset });
      }
    },
    chain: (...chainNodes) => {
      for (let i = 0; i < chainNodes.length - 1; i++) chainNodes[i].connect(chainNodes[i + 1]);
    },
  };

  getEffect(effect).build(kit, input, output);

  const startAt = ctx.currentTime;
  for (const { node, offset } of sources) {
    if (node instanceof AudioBufferSourceNode) node.start(startAt, offset);
    else node.start(startAt);
  }

  let cleaned = false;
  return () => {
    if (cleaned) return;
    cleaned = true;
    for (const { node } of sources) {
      try {
        node.stop();
      } catch {
        // schon gestoppt
      }
    }
    nodes.forEach((node) => node.disconnect());
  };
}

/** Rendert Buffer + Effekt + Tempo offline in einen neuen Buffer (für Download/Teilen/Video). */
export async function renderWithEffect(
  buffer: AudioBuffer,
  effect: EffectId,
  rate: number,
): Promise<AudioBuffer> {
  const prepared = prepareBuffer(buffer, effect);
  const seconds = prepared.duration / rate + getEffect(effect).tail;
  const offline = new OfflineAudioContext(2, Math.ceil(seconds * prepared.sampleRate), prepared.sampleRate);
  const source = offline.createBufferSource();
  source.buffer = prepared;
  source.playbackRate.value = rate;
  const boost = offline.createGain();
  boost.gain.value = isLoud() ? LOUD_BOOST : 1;
  const limiter = createLimiter(offline);
  boost.connect(limiter);
  limiter.connect(offline.destination);
  connectEffect(offline, source, boost, effect);
  source.start();
  return offline.startRendering();
}
