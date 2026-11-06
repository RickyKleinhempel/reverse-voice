# 🔁 Rückwärts-Rekorder

Nimm was auf, hör's dir rückwärts an, verzerr deine Stimme und schick's deinen Leuten, per WhatsApp, TikTok, Insta & Co. Gebaut mit Next.js, läuft komplett im Browser und ist fürs Handy optimiert.

**Live:** https://rickykleinhempel.github.io/reverse-voice/

## Features

- 🎙️ **Aufnehmen & sofort rückwärts hören**: Nach dem Stoppen spielt der Clip automatisch rückwärts ab.
- 🎭 **15 Stimmverzerrer & Effekte**: Helium, Dämon, Roboter, Alien, 8-Bit, Klone, Blubb (Unterwasser), Megafon, Funk, Krass, Echo, Kirche, Geist und Wobble, dazu 🎲 Zufall.
  Helium, Dämon und Klone ändern die Tonhöhe, ohne das Tempo zu ändern (Pitch-Shifter).
- ⚡ **Tempo-Regler**: von 👹 Monster bis 🐿️ Chipmunk, live regelbar.
- 📢 **Extra laut & Freisprechen**: Aufnahmen werden auf volle Lautstärke gebracht, mit Booster und Limiter. Nach der Aufnahme schaltet die Wiedergabe auf den Lautsprecher statt auf die Hörmuschel. Auf dem iPhone ist der Ton auch im Stumm-Modus zu hören.
- 📤 **Teilen & Speichern**:
  - **MP3** für WhatsApp, Telegram, Signal, Discord
  - **WAV** in bester Qualität
  - **Hochkant-Video (9:16)** mit Visualizer für TikTok, Insta-Story, Snapchat und WhatsApp-Status
- 🏆 **Rückwärts-Challenge**: die Rückwärts-Version nachmachen und einen Vibe-Score bekommen.
- 📱 **Mobile first**: App-artige Leiste unten, Safe-Areas für Notch und Home-Bar, kein Doppeltipp-Zoom. Über „Zum Home-Bildschirm“ lässt sich die Seite wie eine App installieren.

🔒 Es wird nichts hochgeladen. Aufnahme, Effekte und Export laufen lokal im Browser (MediaRecorder, Web Audio API, lamejs).

## Lokal starten

```bash
npm install
npm run dev
```

Dann http://localhost:3000 öffnen. Das Mikrofon funktioniert nur über `localhost` oder HTTPS.

## Deployment

Jeder Push auf `main` baut die App als statischen Export (`out/`) und veröffentlicht sie per GitHub Actions auf GitHub Pages (`.github/workflows/deploy.yml`).

## Aufbau

| Datei | Inhalt |
| --- | --- |
| `src/components/ReverseStudio.tsx` | Haupt-Komponente mit Tabs (Studio / Challenge) |
| `src/components/Studio.tsx` | Aufnahme, Wiedergabe, Effekte, mobile Leiste |
| `src/components/ShareSheet.tsx` | Teilen & Speichern (MP3 / WAV / Video) |
| `src/components/Challenge.tsx` | Rückwärts-Challenge mit Score |
| `src/hooks/useRecorder.ts`, `usePlayer.ts` | Mikrofon-Aufnahme bzw. Wiedergabe |
| `src/lib/effects.ts` | Effekt-Ketten, Pitch-Shifter, Offline-Rendering |
| `src/lib/export.ts` | MP3-Encoder, Video-Rendering, Web Share |
| `src/lib/audio.ts` | AudioContext, Lautsprecher-Routing, Normalisieren, Limiter, WAV, Score |
