# 🔁 Rückwärts-Rekorder

Nimm was auf, hör's dir rückwärts an, hau einen Effekt drauf und schick's deinen Leuten. Gebaut mit Next.js, läuft komplett im Browser.

**Live:** https://rickykleinhempel.github.io/reverse-voice/

## Features

- 🎙️ **Aufnehmen & sofort rückwärts hören**: Nach dem Stoppen spielt der Clip automatisch rückwärts ab.
- 🌈 **Live-Visualizer**: Ein Neon-Ring um den Aufnahme-Knopf reagiert auf Mikro und Wiedergabe.
- 🤖 **Effekte**: Pur, Echo, Kathedrale, Roboter, Alien, Funkgerät, Krass und 🎲 Zufall.
- 🐿️ **Tempo & Stimmhöhe**: von 👹 Monster bis 🐿️ Chipmunk, live regelbar.
- 🔁 **Endlosschleife** und ✂️ **automatisches Wegschneiden von Stille**
- 💾 **Speichern** als WAV, inklusive Effekt und Tempo
- 📤 **Teilen** direkt an WhatsApp & Co. (auf Handys mit Web Share API)
- 🏆 **Rückwärts-Challenge**: die Rückwärts-Version nachmachen. Deine Imitation wird wieder umgedreht und bekommt einen Vibe-Score, ab 65 Punkten mit Konfetti.

🔒 Es wird nichts hochgeladen. Aufnahme und Effekte laufen über MediaRecorder und die Web Audio API lokal im Browser.

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
| `src/components/Studio.tsx` | Aufnahme, Wiedergabe, Effekte, Export |
| `src/components/Challenge.tsx` | Rückwärts-Challenge mit Score |
| `src/hooks/useRecorder.ts`, `usePlayer.ts` | Mikrofon-Aufnahme bzw. Wiedergabe |
| `src/lib/audio.ts` | Umkehren, Trimmen, WAV-Export, Wellenform, Score |
| `src/lib/effects.ts` | Web-Audio-Effektketten und Offline-Rendering |
