# Rückwärts-Rekorder

Kleine Next.js-App: Audio über das Mikrofon aufnehmen und rückwärts (oder normal) abspielen. Die Rückwärts-Version lässt sich als WAV herunterladen.

**Live:** https://rickykleinhempel.github.io/reverse-voice/

Alles läuft im Browser (MediaRecorder + Web Audio API), es wird nichts hochgeladen.

## Lokal starten

```bash
npm install
npm run dev
```

Dann http://localhost:3000 öffnen. Mikrofon-Zugriff funktioniert nur über `localhost` oder HTTPS.

## Deployment

Jeder Push auf `main` baut die App als statischen Export (`out/`) und veröffentlicht sie über GitHub Actions auf GitHub Pages (`.github/workflows/deploy.yml`).

## Aufbau

- `src/components/Recorder.tsx`: Aufnahme, Wiedergabe und Oberfläche
- `src/lib/audio.ts`: Umkehren des Audio-Buffers, WAV-Export, Wellenform
- `next.config.ts`: `output: "export"` und `basePath` für GitHub Pages
