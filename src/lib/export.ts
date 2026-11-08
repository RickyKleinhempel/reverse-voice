/**
 * Export: MP3 (klein, überall abspielbar), WAV (beste Qualität) und
 * Hochkant-Video (für TikTok, Insta-Story, Snapchat, WhatsApp-Status).
 */
import { Mp3Encoder } from "@breezystack/lamejs";
import { audioBufferToWav, getAudioContext, setAudioSession } from "./audio";
import { type ClipVideo, createFrameCache, drawCover, frameIndexAt, videoTimeAt } from "./video";

export type ExportFile = { blob: Blob; name: string; type: string };

const nextFrame = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function toInt16(data: Float32Array): Int16Array {
  const out = new Int16Array(data.length);
  for (let i = 0; i < data.length; i++) {
    const s = Math.max(-1, Math.min(1, data[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

/** MP3 kodieren – in Häppchen, damit die Oberfläche flüssig bleibt. */
export async function encodeMp3(
  buffer: AudioBuffer,
  onProgress?: (progress: number) => void,
): Promise<Blob> {
  const stereo = buffer.numberOfChannels > 1;
  const left = toInt16(buffer.getChannelData(0));
  const right = stereo ? toInt16(buffer.getChannelData(1)) : undefined;
  const encoder = new Mp3Encoder(stereo ? 2 : 1, buffer.sampleRate, 128);
  const parts: BlobPart[] = [];
  const frame = 1152;
  const framesPerSlice = 200;

  for (let i = 0; i < left.length; i += frame) {
    const chunk = encoder.encodeBuffer(left.subarray(i, i + frame), right?.subarray(i, i + frame));
    if (chunk.length) parts.push(new Uint8Array(chunk));
    if ((i / frame) % framesPerSlice === 0) {
      onProgress?.(i / left.length);
      await nextFrame();
    }
  }
  const end = encoder.flush();
  if (end.length) parts.push(new Uint8Array(end));
  onProgress?.(1);
  return new Blob(parts, { type: "audio/mpeg" });
}

export function encodeWav(buffer: AudioBuffer): Blob {
  return audioBufferToWav(buffer);
}

// ---------- Video ----------

const VIDEO_TYPES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4;codecs=avc1,mp4a",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

/** Bestes vom Browser unterstütztes Videoformat (MP4 bevorzugt, das mögen WhatsApp & Insta). */
export function pickVideoType(): string | null {
  if (typeof MediaRecorder === "undefined" || typeof HTMLCanvasElement === "undefined") return null;
  if (!("captureStream" in HTMLCanvasElement.prototype)) return null;
  return VIDEO_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
}

type VideoOptions = {
  /** Audio mit Effekt (bereits gerendert). */
  audio: AudioBuffer;
  emoji: string;
  effectLabel: string;
  rate: number;
  displayFont: string;
  bodyFont: string;
  /** Video-Clip: Kamerabilder rückwärts als Hintergrund statt Visualizer. */
  video?: { clip: ClipVideo; duration: number };
  onProgress?: (progress: number) => void;
};

const W = 720;
const H = 1280;

function waveformPeaks(buffer: AudioBuffer, bars: number): Float32Array {
  const data = buffer.getChannelData(0);
  const peaks = new Float32Array(bars);
  const step = data.length / bars;
  let max = 0;
  for (let b = 0; b < bars; b++) {
    let peak = 0;
    for (let i = Math.floor(b * step); i < Math.min(data.length, (b + 1) * step); i++) {
      peak = Math.max(peak, Math.abs(data[i]));
    }
    peaks[b] = peak;
    max = Math.max(max, peak);
  }
  return peaks.map((p) => p / (max || 1));
}

/**
 * Nimmt in Echtzeit ein 9:16-Video auf: animierter Hintergrund, Visualizer-Ring,
 * Wellenform mit Fortschritt – und der Clip als Tonspur.
 */
export async function renderVideo(opts: VideoOptions): Promise<ExportFile> {
  const type = pickVideoType();
  if (!type) throw new Error("Video wird von diesem Browser nicht unterstützt.");

  setAudioSession("playback");
  const ctx = await getAudioContext();
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext("2d");
  if (!g) throw new Error("Canvas nicht verfügbar.");

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.75;
  const destination = ctx.createMediaStreamDestination();
  const source = ctx.createBufferSource();
  source.buffer = opts.audio;
  source.connect(analyser);
  analyser.connect(destination);

  const stream = new MediaStream([
    ...canvas.captureStream(30).getVideoTracks(),
    ...destination.stream.getAudioTracks(),
  ]);
  const recorder = new MediaRecorder(stream, {
    mimeType: type,
    videoBitsPerSecond: 3_000_000,
    audioBitsPerSecond: 128_000,
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const freq = new Uint8Array(analyser.frequencyBinCount);
  const peaks = waveformPeaks(opts.audio, 64);
  const duration = opts.audio.duration;
  let startAt = Number.POSITIVE_INFINITY;

  // Video-Clip: Kamerabilder vorbereiten. Das aktuelle Bild liegt in einem eigenen Canvas,
  // damit es stehen bleibt, falls das nächste noch dekodiert wird.
  const camera = opts.video;
  const frameCache = camera ? createFrameCache(camera.clip.frames, 24) : null;
  const frameCanvas = camera ? document.createElement("canvas") : null;
  const frameG = frameCanvas?.getContext("2d") ?? null;
  let shownFrame = -1;
  if (camera && frameCanvas && frameCache) {
    frameCanvas.width = camera.clip.frames.width;
    frameCanvas.height = camera.clip.frames.height;
    const first = frameIndexAt(camera.clip.frames, videoTimeAt(camera.clip, camera.duration, 0, "reverse"));
    await Promise.all(Array.from({ length: 10 }, (_, k) => frameCache.load(first - k)));
  }

  const drawCamera = (now: number) => {
    if (!camera || !frameCanvas || !frameG || !frameCache) return;
    // Position im Ton (vor dem Tempo) → Bild. Beim Nachhall bleibt das letzte Bild stehen.
    const position = Math.max(0, now - startAt) * opts.rate;
    const index = frameIndexAt(camera.clip.frames, videoTimeAt(camera.clip, camera.duration, position, "reverse"));
    frameCache.prefetch(index, -1, 6);
    if (index !== shownFrame) {
      const bitmap = frameCache.get(index);
      if (bitmap) {
        try {
          frameG.drawImage(bitmap, 0, 0, frameCanvas.width, frameCanvas.height);
          shownFrame = index;
        } catch {
          // schon freigegeben – nächstes Mal
        }
      }
    }
    g.fillStyle = "#07030f";
    g.fillRect(0, 0, W, H);
    if (shownFrame >= 0) drawCover(g, frameCanvas, frameCanvas.width, frameCanvas.height, W, H);
    // Abdunkeln oben und unten, damit die Schrift lesbar bleibt.
    const top = g.createLinearGradient(0, 0, 0, 340);
    top.addColorStop(0, "rgba(7,3,15,0.85)");
    top.addColorStop(1, "rgba(7,3,15,0)");
    g.fillStyle = top;
    g.fillRect(0, 0, W, 340);
    const bottom = g.createLinearGradient(0, H - 420, 0, H);
    bottom.addColorStop(0, "rgba(7,3,15,0)");
    bottom.addColorStop(1, "rgba(7,3,15,0.9)");
    g.fillStyle = bottom;
    g.fillRect(0, H - 420, W, 420);
  };

  const drawVisualizer = (t: number) => {
    // Hintergrund mit wandernden Farbblasen
    g.fillStyle = "#07030f";
    g.fillRect(0, 0, W, H);
    const blobs: [number, number, number, string][] = [
      [0.2 + Math.sin(t * 0.5) * 0.1, 0.18 + Math.cos(t * 0.4) * 0.05, 420, "rgba(217,70,239,0.45)"],
      [0.85 + Math.cos(t * 0.45) * 0.1, 0.5 + Math.sin(t * 0.35) * 0.08, 460, "rgba(124,58,237,0.45)"],
      [0.35 + Math.sin(t * 0.3) * 0.12, 0.88 + Math.cos(t * 0.5) * 0.04, 420, "rgba(6,182,212,0.35)"],
    ];
    for (const [x, y, r, color] of blobs) {
      const grad = g.createRadialGradient(x * W, y * H, 0, x * W, y * H, r);
      grad.addColorStop(0, color);
      grad.addColorStop(1, "rgba(7,3,15,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);
    }

    // Visualizer-Ring mit Effekt-Emoji in der Mitte
    const cx = W / 2;
    const cy = 620;
    const inner = 150;
    const bars = 90;
    const half = bars / 2;
    g.lineCap = "round";
    g.lineWidth = 7;
    for (let i = 0; i < bars; i++) {
      const idx = i < half ? i : bars - 1 - i;
      const v = freq[1 + Math.floor(idx * 0.9)] / 255;
      const len = 6 + v ** 1.4 * 150;
      const angle = (i / bars) * Math.PI * 2 - Math.PI / 2;
      const hue = 320 - (idx / half) * 140;
      g.strokeStyle = `hsl(${hue} 95% 66% / ${0.35 + v * 0.65})`;
      g.beginPath();
      g.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
      g.lineTo(cx + Math.cos(angle) * (inner + len), cy + Math.sin(angle) * (inner + len));
      g.stroke();
    }
    const disc = g.createLinearGradient(cx - 130, cy - 130, cx + 130, cy + 130);
    disc.addColorStop(0, "#d946ef");
    disc.addColorStop(0.5, "#ec4899");
    disc.addColorStop(1, "#fb923c");
    g.fillStyle = disc;
    g.beginPath();
    g.arc(cx, cy, 128, 0, Math.PI * 2);
    g.fill();
    const pulse = 1 + (freq[4] / 255) * 0.12;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `${Math.round(120 * pulse)}px sans-serif`;
    g.fillText(opts.emoji, cx, cy + 8);
  };

  const draw = () => {
    const now = ctx.currentTime;
    const progress = Math.min(1, Math.max(0, (now - startAt) / duration));
    analyser.getByteFrequencyData(freq);

    if (camera) drawCamera(now);
    else drawVisualizer(now);

    // Titel
    const titleY = camera ? 200 : 240;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = "rgba(255,255,255,0.8)";
    g.font = `700 26px ${opts.bodyFont}`;
    g.fillText(camera ? "⏪  RÜCKWÄRTS  ABGESPIELT" : "🔊  RÜCKWÄRTS  ABGESPIELT", W / 2, titleY - 90);
    const titleGrad = g.createLinearGradient(120, 0, W - 120, 0);
    titleGrad.addColorStop(0, "#e879f9");
    titleGrad.addColorStop(0.5, "#f9a8d4");
    titleGrad.addColorStop(1, "#67e8f9");
    g.fillStyle = titleGrad;
    g.font = `800 58px ${opts.displayFont}`;
    g.fillText(camera ? "Zurückgespult! 🤯" : "Verstehst du's?", W / 2, titleY);

    // Wellenform mit Fortschritt
    const waveTop = camera ? 1010 : 960;
    const waveH = camera ? 90 : 120;
    const barW = 6;
    const gap = (W - 120 - peaks.length * barW) / (peaks.length - 1);
    peaks.forEach((p, i) => {
      const x = 60 + i * (barW + gap);
      const h = Math.max(6, p * waveH);
      const played = i / peaks.length <= progress;
      g.fillStyle = played ? `hsl(${320 - (i / peaks.length) * 140} 95% 66%)` : "rgba(255,255,255,0.25)";
      g.beginPath();
      if (typeof g.roundRect === "function") g.roundRect(x, waveTop + (waveH - h) / 2, barW, h, 3);
      else g.rect(x, waveTop + (waveH - h) / 2, barW, h);
      g.fill();
    });

    // Effekt-Info
    g.fillStyle = "rgba(255,255,255,0.85)";
    g.font = `700 34px ${opts.bodyFont}`;
    const rateText = Math.abs(opts.rate - 1) < 0.01 ? "" : ` · ${opts.rate.toFixed(2)}×`;
    g.fillText(`${opts.emoji} ${opts.effectLabel}${rateText}`, W / 2, 1140);
    g.fillStyle = "rgba(255,255,255,0.45)";
    g.font = `600 24px ${opts.bodyFont}`;
    g.fillText("gemacht mit dem Rückwärts-Rekorder", W / 2, 1200);
  };

  return new Promise<ExportFile>((resolve, reject) => {
    let raf = 0;
    const loop = () => {
      draw();
      if (startAt !== Number.POSITIVE_INFINITY) opts.onProgress?.(Math.min(1, (ctx.currentTime - startAt) / duration));
      raf = requestAnimationFrame(loop);
    };

    recorder.onstop = () => {
      cancelAnimationFrame(raf);
      stream.getTracks().forEach((track) => track.stop());
      source.disconnect();
      analyser.disconnect();
      frameCache?.dispose();
      const mime = recorder.mimeType || type;
      const ext = mime.includes("mp4") ? "mp4" : "webm";
      resolve({ blob: new Blob(chunks, { type: mime.split(";")[0] }), name: `rueckwaerts.${ext}`, type: mime.split(";")[0] });
    };
    recorder.onerror = () => {
      frameCache?.dispose();
      reject(new Error("Videoaufnahme fehlgeschlagen."));
    };

    draw();
    recorder.start(250);
    raf = requestAnimationFrame(loop);
    // Kurzer Vorlauf, damit das Video nicht mitten im Ton startet.
    startAt = ctx.currentTime + 0.4;
    source.start(startAt);
    source.onended = () => window.setTimeout(() => recorder.stop(), 500);
  });
}

// ---------- Teilen & Speichern ----------

export function canShareFile(file: File): boolean {
  try {
    return typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/** Öffnet das System-Teilen-Menü (WhatsApp, Insta, Telegram, …). Gibt false zurück, wenn abgebrochen. */
export async function shareFile(file: File): Promise<boolean> {
  try {
    await navigator.share({ files: [file] });
    return true;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return false;
    throw err;
  }
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function fileStamp(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}
