"use client";

import { type ReactNode, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

const subscribeNothing = () => () => {};

/**
 * Rendert direkt in <body>. Nötig für fixed-Elemente (Bottom-Bar, Sheet):
 * Die Glas-Karte nutzt backdrop-filter – das macht sie sonst zum Bezugsrahmen für position: fixed.
 */
export function Portal({ children }: { children: ReactNode }) {
  const mounted = useSyncExternalStore(subscribeNothing, () => true, () => false);
  return mounted ? createPortal(children, document.body) : null;
}
