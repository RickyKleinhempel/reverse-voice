/**
 * Video rückwärts: Während der Aufnahme werden Einzelbilder der Kamera als kleine JPEGs
 * mit Zeitstempel gespeichert. Rückwärts abspielen heißt dann: das Bild zeigen, das zur
 * aktuellen Position im (umgedrehten) Ton gehört. So muss keine Videodatei dekodiert werden.
 */

export type VideoFrames = {
  blobs: Blob[];
  /** Sekunden ab Aufnahmestart, aufsteigend. */
  times: number[];
  width: number;
  height: number;
};

/** Video-Spur eines Clips: Bilder plus Versatz, falls am Anfang Stille weggeschnitten wurde. */
export type ClipVideo = {
  frames: VideoFrames;
  /** Sekunden, um die der Ton am Anfang gekürzt wurde. */
  start: number;
};

export type Facing = "user" | "environment";

/** 9:16, klein genug für den Speicher (30 s ≈ 25–40 MB), groß genug fürs Handy. */
export const FRAME_WIDTH = 540;
export const FRAME_HEIGHT = 960;
const TARGET_FPS = 24;
const JPEG_QUALITY = 0.7;
/** Mehr gleichzeitige JPEG-Encodes → Frame auslassen, damit schwache Handys nicht ruckeln. */
const MAX_PENDING = 2;

/** Zeichnet `source` bildfüllend (wie object-fit: cover) auf die Fläche 0,0 – w×h. */
export function drawCover(
  g: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  w: number,
  h: number,
  mirror = false,
) {
  if (!sourceWidth || !sourceHeight) return;
  const scale = Math.max(w / sourceWidth, h / sourceHeight);
  const cropW = w / scale;
  const cropH = h / scale;
  g.save();
  if (mirror) {
    g.translate(w, 0);
    g.scale(-1, 1);
  }
  g.drawImage(source, (sourceWidth - cropW) / 2, (sourceHeight - cropH) / 2, cropW, cropH, 0, 0, w, h);
  g.restore();
}

type FrameCallbackVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: () => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

export type FrameCapture = {
  /** Beendet die Aufnahme sofort und liefert die Bilder, sobald alle JPEGs fertig sind. */
  stop: () => Promise<VideoFrames>;
};

/** Nimmt laufend Bilder von einem (sichtbaren) Kamera-Video auf. */
export function startFrameCapture(video: HTMLVideoElement, { mirror }: { mirror: boolean }): FrameCapture {
  const canvas = document.createElement("canvas");
  canvas.width = FRAME_WIDTH;
  canvas.height = FRAME_HEIGHT;
  const g = canvas.getContext("2d");
  if (!g) throw new Error("Canvas nicht verfügbar.");

  const v = video as FrameCallbackVideo;
  const useFrameCallback = typeof v.requestVideoFrameCallback === "function";
  // Reihenfolge bleibt erhalten, auch wenn toBlob-Rückrufe durcheinander ankommen.
  const slots: { t: number; blob: Blob | null }[] = [];
  const startedAt = performance.now();
  const minGap = 1000 / TARGET_FPS - 4;
  let lastAt = Number.NEGATIVE_INFINITY;
  let pending = 0;
  let running = true;
  let handle = 0;
  let result: Promise<VideoFrames> | null = null;

  const schedule = () => {
    handle = useFrameCallback ? v.requestVideoFrameCallback!(grab) : requestAnimationFrame(grab);
  };

  function grab() {
    if (!running) return;
    const now = performance.now();
    if (now - lastAt >= minGap && pending < MAX_PENDING && video.videoWidth > 0) {
      lastAt = now;
      drawCover(g!, video, video.videoWidth, video.videoHeight, FRAME_WIDTH, FRAME_HEIGHT, mirror);
      const slot: { t: number; blob: Blob | null } = { t: (now - startedAt) / 1000, blob: null };
      slots.push(slot);
      pending++;
      // toBlob kopiert den Canvas-Inhalt sofort – das Canvas darf direkt weiterbenutzt werden.
      canvas.toBlob(
        (blob) => {
          pending--;
          slot.blob = blob;
        },
        "image/jpeg",
        JPEG_QUALITY,
      );
    }
    schedule();
  }

  schedule();

  return {
    stop() {
      if (result) return result;
      running = false;
      if (useFrameCallback) v.cancelVideoFrameCallback?.(handle);
      else cancelAnimationFrame(handle);
      result = (async () => {
        const giveUpAt = performance.now() + 3000;
        while (pending > 0 && performance.now() < giveUpAt) {
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        const done = slots.filter((slot): slot is { t: number; blob: Blob } => slot.blob !== null);
        return {
          blobs: done.map((slot) => slot.blob),
          times: done.map((slot) => slot.t),
          width: FRAME_WIDTH,
          height: FRAME_HEIGHT,
        };
      })();
      return result;
    },
  };
}

/** Index des Bildes, das zur Zeit `t` (Sekunden ab Aufnahmestart) gehört. */
export function frameIndexAt(frames: VideoFrames, t: number): number {
  const { times } = frames;
  if (times.length === 0) return -1;
  let lo = 0;
  let hi = times.length - 1;
  if (t <= times[0]) return 0;
  if (t >= times[hi]) return hi;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (times[mid] <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * Rechnet eine Position im (getrimmten) Ton in Sekunden ab Aufnahmestart um.
 * Rückwärts läuft die Zeit vom Ende des Clips zum Anfang.
 */
export function videoTimeAt(
  video: ClipVideo,
  duration: number,
  position: number,
  direction: "reverse" | "forward",
): number {
  const p = Math.min(Math.max(position, 0), duration);
  return video.start + (direction === "reverse" ? duration - p : p);
}

export type FrameCache = {
  /** Dekodiertes Bild, falls schon da – sonst null (und es wird nachgeladen). */
  get: (index: number) => ImageBitmap | null;
  /** Lädt das Bild und wartet darauf. */
  load: (index: number) => Promise<ImageBitmap | null>;
  /** Lädt die nächsten Bilder in Laufrichtung vor. */
  prefetch: (index: number, direction: 1 | -1, count?: number) => void;
  dispose: () => void;
};

/**
 * Kleiner LRU-Cache für dekodierte Bilder. Alle Bilder auf einmal zu dekodieren wäre zu viel
 * Speicher (30 s ≈ 700 Bilder à 2 MB), deshalb immer nur die gerade gebrauchten.
 */
export function createFrameCache(frames: VideoFrames, size = 16): FrameCache {
  const ready = new Map<number, ImageBitmap>(); // Einfüge-Reihenfolge = zuletzt benutzt
  const loading = new Map<number, Promise<ImageBitmap | null>>();
  let disposed = false;

  const load = (index: number): Promise<ImageBitmap | null> => {
    if (index < 0 || index >= frames.blobs.length) return Promise.resolve(null);
    const hit = ready.get(index);
    if (hit) return Promise.resolve(hit);
    const inFlight = loading.get(index);
    if (inFlight) return inFlight;
    const promise = createImageBitmap(frames.blobs[index]).then(
      (bitmap) => {
        loading.delete(index);
        if (disposed) {
          bitmap.close();
          return null;
        }
        ready.set(index, bitmap);
        while (ready.size > size) {
          const [oldest, old] = ready.entries().next().value as [number, ImageBitmap];
          ready.delete(oldest);
          old.close();
        }
        return bitmap;
      },
      () => {
        loading.delete(index);
        return null;
      },
    );
    loading.set(index, promise);
    return promise;
  };

  return {
    get(index) {
      const bitmap = ready.get(index);
      if (bitmap) {
        ready.delete(index);
        ready.set(index, bitmap);
        return bitmap;
      }
      void load(index);
      return null;
    },
    load,
    prefetch(index, direction, count = 4) {
      for (let k = 1; k <= count; k++) void load(index + k * direction);
    },
    dispose() {
      disposed = true;
      ready.forEach((bitmap) => bitmap.close());
      ready.clear();
    },
  };
}
