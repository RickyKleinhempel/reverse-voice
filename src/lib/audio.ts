/**
 * Audio-Hilfsfunktionen: Aufnahme-Format, Umkehren, Trimmen, WAV-Export, Wellenform, Score.
 * Alles läuft im Browser – es wird nichts hochgeladen.
 */

let sharedContext: AudioContext | null = null;
let output: { input: GainNode; boost: GainNode; analyser: AnalyserNode } | null = null;
let loud = true;
let stale = false;

/** Verstärkung im „Extra laut“-Modus – der Limiter danach verhindert Übersteuern. */
export const LOUD_BOOST = 2.2;

/** Ein gemeinsamer AudioContext für die ganze App (im Klick-Handler aufrufen, wegen Autoplay-Regeln). */
export async function getAudioContext(): Promise<AudioContext> {
  // Aufnahme endete ohne Tipp (Zeitlimit)? Dann jetzt – beim nächsten Tipp – neu starten.
  // Nur mit Nutzergeste, sonst startet iOS den neuen Context stumm.
  if (stale && sharedContext && navigator.userActivation?.isActive) {
    const old = sharedContext;
    sharedContext = null;
    output = null;
    void old.close().catch(() => {});
  }
  if (!sharedContext) {
    stale = false;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) throw new Error("Dein Browser unterstützt die Web Audio API nicht.");
    sharedContext = new Ctor();
  }
  if (sharedContext.state !== "running") await sharedContext.resume();
  return sharedContext;
}

/**
 * Nach einer Aufnahme (im Stopp-Tipp aufrufen!): Audio komplett neu starten.
 * Handys bleiben sonst im „Telefonat“-Modus und spielen leise über den Hörer statt
 * über den Lautsprecher (Freisprechen).
 */
export function restartAudioContext() {
  stale = false;
  const old = sharedContext;
  sharedContext = null;
  output = null;
  void old?.close().catch(() => {});
  void getAudioContext().catch(() => {});
}

/** Aufnahme wurde ohne Tipp beendet: Context beim nächsten Tipp neu starten (siehe getAudioContext). */
export function markAudioContextStale() {
  stale = true;
}

/** Limiter: macht laut, ohne dass es kratzt. */
export function createLimiter(ctx: BaseAudioContext): DynamicsCompressorNode {
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.2;
  return limiter;
}

/** Ausgangskette: Booster → Limiter → Analyser (für den Visualizer) → Lautsprecher. */
export function getOutput(ctx: AudioContext) {
  if (!output) {
    const boost = ctx.createGain();
    boost.gain.value = loud ? LOUD_BOOST : 1;
    const limiter = createLimiter(ctx);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.75;
    boost.connect(limiter);
    limiter.connect(analyser);
    analyser.connect(ctx.destination);
    output = { input: boost, boost, analyser };
  }
  return output;
}

export function setLoud(on: boolean) {
  loud = on;
  if (output && sharedContext) {
    output.boost.gain.setTargetAtTime(on ? LOUD_BOOST : 1, sharedContext.currentTime, 0.05);
  }
}

export function isLoud() {
  return loud;
}

type AudioSessionType = "auto" | "playback" | "play-and-record" | "transient" | "transient-solo" | "ambient";

/**
 * iPhone/iPad: Ohne das hier ist Web Audio im Stumm-Modus nicht zu hören.
 * "play-and-record" während der Aufnahme, sonst "playback" (Lautsprecher, auch bei Stumm).
 */
export function setAudioSession(type: AudioSessionType) {
  const session = (navigator as Navigator & { audioSession?: { type: AudioSessionType } }).audioSession;
  if (!session) return;
  try {
    session.type = type;
  } catch {
    // nicht unterstützt
  }
}

const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/ogg",
];

/** Erster vom Browser unterstützter Aufnahme-Typ (Safari/iOS kann z. B. kein webm). */
export function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type));
}

function emptyLike(buffer: AudioBuffer, length: number): AudioBuffer {
  return new AudioBuffer({
    length: Math.max(1, length),
    numberOfChannels: buffer.numberOfChannels,
    sampleRate: buffer.sampleRate,
  });
}

/** Kopie des Buffers, in der jeder Kanal rückwärts läuft. */
export function reverseBuffer(buffer: AudioBuffer): AudioBuffer {
  const reversed = emptyLike(buffer, buffer.length);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = new Float32Array(buffer.getChannelData(ch));
    data.reverse();
    reversed.copyToChannel(data, ch);
  }
  return reversed;
}

/** Hebt die Aufnahme auf volle Lautstärke an (Spitze bei `target`). */
export function normalize(buffer: AudioBuffer, target = 0.97): AudioBuffer {
  let peak = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
  }
  if (peak < 0.001 || peak >= target) return buffer;
  const gain = Math.min(target / peak, 12); // reines Rauschen nicht endlos verstärken
  const out = emptyLike(buffer, buffer.length);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    const scaled = new Float32Array(data.length);
    for (let i = 0; i < data.length; i++) scaled[i] = data[i] * gain;
    out.copyToChannel(scaled, ch);
  }
  return out;
}

/**
 * Findet den Bereich ohne Stille am Anfang und Ende (relativ zum lautesten Punkt, mit etwas Puffer).
 * Gibt Sample-Indizes zurück – oder null, wenn es nichts wegzuschneiden gibt.
 */
export function findTrimRange(buffer: AudioBuffer, padSeconds = 0.08): { start: number; end: number } | null {
  const data = buffer.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
  if (peak < 0.005) return null; // nur Rauschen – nichts anfassen

  const threshold = peak * 0.06;
  let start = 0;
  while (start < data.length && Math.abs(data[start]) < threshold) start++;
  let end = data.length - 1;
  while (end > start && Math.abs(data[end]) < threshold) end--;

  const pad = Math.round(padSeconds * buffer.sampleRate);
  start = Math.max(0, start - pad);
  end = Math.min(data.length, end + pad);
  if (end - start >= data.length - 1) return null;
  return { start, end };
}

/** Ausschnitt eines Buffers (Sample-Indizes) als neuer Buffer. */
export function sliceBuffer(buffer: AudioBuffer, start: number, end: number): AudioBuffer {
  const sliced = emptyLike(buffer, end - start);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    sliced.copyToChannel(buffer.getChannelData(ch).slice(start, end), ch);
  }
  return sliced;
}

/** Schneidet Stille am Anfang und Ende ab (siehe findTrimRange). */
export function trimSilence(buffer: AudioBuffer, padSeconds = 0.08): AudioBuffer {
  const range = findTrimRange(buffer, padSeconds);
  return range ? sliceBuffer(buffer, range.start, range.end) : buffer;
}

/** Kodiert einen AudioBuffer als 16-bit-PCM-WAV. */
export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = buffer.length * blockAlign;
  const view = new DataView(new ArrayBuffer(44 + dataSize));

  const writeString = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // Länge des fmt-Chunks
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  const channels = Array.from({ length: numChannels }, (_, ch) => buffer.getChannelData(ch));
  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += bytesPerSample;
    }
  }

  return new Blob([view], { type: "audio/wav" });
}

/** Zeichnet die Wellenform als abgerundete Balken; mehrere Farben ergeben einen Verlauf. */
export function drawWaveform(canvas: HTMLCanvasElement, buffer: AudioBuffer, colors: string[]) {
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height) return;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);

  const g = canvas.getContext("2d");
  if (!g) return;
  g.scale(dpr, dpr);
  g.clearRect(0, 0, width, height);

  if (colors.length > 1) {
    const gradient = g.createLinearGradient(0, 0, width, 0);
    colors.forEach((color, i) => gradient.addColorStop(i / (colors.length - 1), color));
    g.fillStyle = gradient;
  } else {
    g.fillStyle = colors[0] ?? "#fff";
  }

  const data = buffer.getChannelData(0);
  const barWidth = 2;
  const gap = 2;
  const bars = Math.floor(width / (barWidth + gap));
  const step = data.length / bars;
  const peaks = new Float32Array(bars);
  let globalPeak = 0;

  for (let b = 0; b < bars; b++) {
    let peak = 0;
    const start = Math.floor(b * step);
    const end = Math.min(data.length, Math.floor((b + 1) * step));
    for (let i = start; i < end; i++) peak = Math.max(peak, Math.abs(data[i]));
    peaks[b] = peak;
    globalPeak = Math.max(globalPeak, peak);
  }

  const mid = height / 2;
  const maxBar = height - 8;
  for (let b = 0; b < bars; b++) {
    const h = Math.max(2, (peaks[b] / (globalPeak || 1)) * maxBar);
    const x = b * (barWidth + gap);
    const y = mid - h / 2;
    if (typeof g.roundRect === "function") {
      g.beginPath();
      g.roundRect(x, y, barWidth, h, 1);
      g.fill();
    } else {
      g.fillRect(x, y, barWidth, h);
    }
  }
}

function envelope(buffer: AudioBuffer, bins: number): number[] {
  const data = buffer.getChannelData(0);
  const size = data.length / bins;
  const env: number[] = [];
  for (let b = 0; b < bins; b++) {
    const start = Math.floor(b * size);
    const end = Math.max(start + 1, Math.floor((b + 1) * size));
    let sum = 0;
    for (let i = start; i < end && i < data.length; i++) sum += data[i] * data[i];
    env.push(Math.sqrt(sum / (end - start)));
  }
  return env;
}

/**
 * Spaß-Score (0–100): Wie ähnlich ist der Lautstärke-Verlauf zweier Aufnahmen?
 * Vergleicht die Hüllkurven per Korrelation und bestraft große Längenunterschiede.
 */
export function vibeScore(a: AudioBuffer, b: AudioBuffer): number {
  const bins = 48;
  const ea = envelope(a, bins);
  const eb = envelope(b, bins);
  const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
  const ma = mean(ea);
  const mb = mean(eb);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < bins; i++) {
    num += (ea[i] - ma) * (eb[i] - mb);
    da += (ea[i] - ma) ** 2;
    db += (eb[i] - mb) ** 2;
  }
  const r = da && db ? num / Math.sqrt(da * db) : 0;
  const lengthRatio = Math.min(a.duration, b.duration) / Math.max(a.duration, b.duration);
  const score = 100 * Math.max(0, r) ** 0.7 * lengthRatio ** 0.4;
  return Math.round(Math.min(100, Math.max(0, score)));
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const t = Math.floor((seconds % 1) * 10);
  return `${m}:${s.toString().padStart(2, "0")}.${t}`;
}

/** Kurzes Vibrations-Feedback auf Handys, die das unterstützen. */
export function buzz(pattern: number | number[] = 20) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // egal
  }
}
