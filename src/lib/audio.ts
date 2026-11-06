/**
 * Hilfsfunktionen für Aufnahme, Umkehrung und WAV-Export.
 * Alles läuft im Browser – es wird nichts hochgeladen.
 */

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

/** Liefert eine Kopie des Buffers, in der jeder Kanal rückwärts läuft. */
export function reverseBuffer(ctx: BaseAudioContext, buffer: AudioBuffer): AudioBuffer {
  const reversed = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = new Float32Array(buffer.getChannelData(ch));
    data.reverse();
    reversed.copyToChannel(data, ch);
  }
  return reversed;
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

/** Zeichnet die Wellenform (Min/Max pro Pixelspalte) des ersten Kanals. */
export function drawWaveform(canvas: HTMLCanvasElement, buffer: AudioBuffer, color: string) {
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);

  const g = canvas.getContext("2d");
  if (!g) return;
  g.scale(dpr, dpr);
  g.clearRect(0, 0, width, height);
  g.fillStyle = color;

  const data = buffer.getChannelData(0);
  const step = Math.max(1, Math.floor(data.length / width));
  const mid = height / 2;

  for (let x = 0; x < width; x++) {
    let min = 1;
    let max = -1;
    const start = x * step;
    const end = Math.min(start + step, data.length);
    for (let i = start; i < end; i++) {
      const v = data[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (start >= data.length) break;
    const top = mid - max * mid;
    const h = Math.max(1, (max - min) * mid);
    g.fillRect(x, top, 1, h);
  }
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const t = Math.floor((seconds % 1) * 10);
  return `${m}:${s.toString().padStart(2, "0")}.${t}`;
}
