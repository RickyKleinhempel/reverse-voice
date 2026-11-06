import ReverseStudio from "@/components/ReverseStudio";

export default function Home() {
  return (
    <>
      {/* Animierter Neon-Hintergrund */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute -left-32 -top-40 size-[30rem] animate-blob rounded-full bg-fuchsia-600/35 blur-3xl" />
        <div className="absolute -right-40 top-1/3 size-[32rem] animate-blob rounded-full bg-violet-600/35 blur-3xl [animation-delay:-8s]" />
        <div className="absolute -bottom-48 left-1/4 size-[28rem] animate-blob rounded-full bg-cyan-500/25 blur-3xl [animation-delay:-15s]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,transparent_0%,#07030f_80%)]" />
      </div>

      <main className="relative z-10 mx-auto flex w-full max-w-xl flex-1 flex-col items-center gap-8 px-4 py-10 sm:py-16">
        <header className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/5 px-4 py-1.5 text-xs font-bold tracking-wide text-white/80 ring-1 ring-white/15 backdrop-blur">
            🔊 Sprich · Dreh um · Lach
          </span>
          <h1 className="mt-6 font-display font-extrabold leading-none tracking-tight [perspective:600px]">
            <span className="sr-only">Rückwärts-Rekorder</span>
            <span aria-hidden className="inline-grid text-4xl sm:text-6xl">
              <span className="animate-flip-a bg-linear-to-r from-fuchsia-400 via-pink-300 to-cyan-300 bg-clip-text pb-1 text-transparent [grid-area:1/1]">
                Rückwärts
              </span>
              <span className="animate-flip-b bg-linear-to-r from-cyan-300 via-pink-300 to-fuchsia-400 bg-clip-text pb-1 text-transparent [grid-area:1/1]">
                sträwkcüR
              </span>
            </span>
            <span aria-hidden className="mt-2 block text-lg font-semibold tracking-[0.45em] text-white/80 sm:text-2xl">
              REKORDER
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-md text-white/70">
            Nimm was auf, dreh&apos;s um, hau einen Effekt drauf – und schick&apos;s deinen Leuten. 🤪
          </p>
        </header>

        <ReverseStudio />

        <footer className="text-center text-xs text-white/40">
          🔒 Deine Aufnahmen bleiben auf deinem Gerät – nichts wird hochgeladen.
        </footer>
      </main>
    </>
  );
}
