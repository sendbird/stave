/*
 * Runs in its own `bun` process with `i18n-init-failure.preload.ts` (see
 * `tests/renderer-recovery.test.tsx`), so every i18n module throws while it
 * evaluates. Loads the renderer recovery the way `src/main.tsx` does and
 * reports what happened as JSON.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const listeners = new Map<string, Array<(event: Event) => void>>();
const startupMounts: string[] = [];
Object.assign(globalThis, {
  window: {
    addEventListener: (type: string, listener: (event: Event) => void) => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    removeEventListener: () => undefined,
    location: { reload: () => undefined },
    sessionStorage: new MemoryStorage(),
    localStorage: new MemoryStorage(),
  },
  document: {
    getElementById: (id: string) => {
      startupMounts.push(id);
      return null;
    },
    documentElement: { classList: { contains: () => false, toggle: () => undefined } },
  },
});

const i18nError = await import("@/i18n").then(
  () => null,
  (error: unknown) => (error instanceof Error ? error.message : String(error)),
);

// `src/main.tsx` order: the recovery module first, then i18n and its translator.
await import("@/components/system/renderer-recovery/install-renderer-recovery");
const translatorError = await import("@/lib/renderer-recovery/recovery-i18n").then(
  () => null,
  (error: unknown) => (error instanceof Error ? error.message : String(error)),
);

// The entry never runs, so start-up is not marked; a module error arrives.
const errorEvent = Object.assign(new Event("error"), {
  error: new Error("i18n init failed (simulated)"),
});
for (const listener of listeners.get("error") ?? []) listener(errorEvent);

const { RendererRecoveryRoot } = await import(
  "@/components/system/renderer-recovery/RendererRecovery"
);
const { getRendererRecoveryState } = await import("@/lib/renderer-recovery/renderer-recovery");

console.log(
  JSON.stringify({
    i18nError,
    translatorError,
    listenerTypes: [...listeners.keys()].sort(),
    state: getRendererRecoveryState().status,
    startupMounts,
    html: renderToStaticMarkup(createElement(RendererRecoveryRoot)),
  }),
);
