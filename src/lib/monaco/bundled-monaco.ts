import { useEffect, useState } from "react";

/** The Monaco API Stave's editor code receives from `beforeMount`/`onMount`. */
export type Monaco = typeof import("monaco-editor");

let loaded = false;
let loading: Promise<void> | null = null;

/**
 * Load the bundled Monaco and hand it to @monaco-editor/react. Every
 * `<Editor>`/`<DiffEditor>` must wait for this: one that mounts first makes the
 * loader fetch its default CDN build instead.
 */
export function loadBundledMonaco(): Promise<void> {
  loading ??= import("./monaco-runtime").then(
    () => {
      loaded = true;
    },
    (error: unknown) => {
      // Let the next editor mount retry a chunk that failed to load.
      loading = null;
      throw error;
    },
  );
  return loading;
}

/** True once the bundled Monaco is configured and an editor may mount. */
export function useBundledMonaco(): boolean {
  const [ready, setReady] = useState(loaded);
  useEffect(() => {
    if (ready) return;
    let cancelled = false;
    loadBundledMonaco().then(
      () => {
        if (!cancelled) setReady(true);
      },
      (error: unknown) => {
        console.error("[monaco] could not load the bundled editor", error);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [ready]);
  return ready;
}
