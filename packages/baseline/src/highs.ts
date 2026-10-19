/**
 * Shared HiGHS WASM loader. Callers in Node should pass `nodeLocateFile`;
 * Vite workers should pass a bundler-resolved wasm URL.
 */

import highsLoader, { type Highs } from "highs";

let highsPromise: Promise<Highs> | null = null;

/** Lazily load the HiGHS WASM runtime (singleton). */
export function loadHighs(locateFile?: (file: string) => string): Promise<Highs> {
  if (!highsPromise) {
    highsPromise = highsLoader({
      locateFile: locateFile ?? ((file) => file),
    });
  }
  return highsPromise;
}

/** Reset the singleton (tests / workers that need a fresh locateFile). */
export function resetHighsLoader(): void {
  highsPromise = null;
}
