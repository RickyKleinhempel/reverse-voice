import Recorder from "@/components/Recorder";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center gap-8 px-4 py-12 sm:py-20">
      <header className="text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          <span className="inline-block -scale-x-100">Rückwärts</span>-Rekorder
        </h1>
        <p className="mt-4 text-zinc-600 dark:text-zinc-400">
          Nimm etwas auf und hör es dir rückwärts an. Tipp auf den roten Knopf, sprich, und tipp
          noch einmal, um die Aufnahme zu stoppen.
        </p>
      </header>

      <Recorder />

      <footer className="text-center text-xs text-zinc-500 dark:text-zinc-500">
        Die Aufnahme bleibt in deinem Browser. Es wird nichts hochgeladen.
      </footer>
    </main>
  );
}
