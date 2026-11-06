import type { ReactNode } from "react";

export function Section({
  title,
  aside,
  children,
}: {
  title: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl bg-white/[0.03] p-4 ring-1 ring-white/10">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-white/50">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Toggle({
  checked,
  onChange,
  disabled,
  children,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.04] px-4 py-3 text-left text-sm font-semibold ring-1 ring-white/10 transition hover:bg-white/[0.08] disabled:opacity-50"
    >
      <span>{children}</span>
      <span
        aria-hidden
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${
          checked ? "bg-linear-to-r from-fuchsia-500 to-cyan-400" : "bg-white/15"
        }`}
      >
        <span
          className={`absolute top-1 size-4 rounded-full bg-white shadow transition-all ${
            checked ? "left-6" : "left-1"
          }`}
        />
      </span>
    </button>
  );
}

export const primaryButton =
  "rounded-2xl bg-linear-to-r from-fuchsia-500 via-pink-500 to-orange-400 px-5 py-4 font-bold text-white shadow-[0_10px_40px_-10px_rgba(236,72,153,0.9)] transition hover:brightness-110 active:scale-[0.97] disabled:opacity-50";

export const glassButton =
  "rounded-2xl bg-white/[0.06] px-5 py-4 font-bold text-white ring-1 ring-white/15 transition hover:bg-white/[0.12] active:scale-[0.97] disabled:opacity-50";
