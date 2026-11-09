import { useCallback, useEffect, useState } from "react";

/** Where this device remembers the last moment the Tars view was visible. Local only; never synced. */
export const TARS_LAST_VISIBLE_KEY = "stave:tars:lastVisibleAt";
/** While the view stays visible, the remembered moment is refreshed this often, so a crash loses at most this much. */
const REFRESH_MS = 60_000;

function readLastVisible(): string | null {
  try {
    const value = window.localStorage.getItem(TARS_LAST_VISIBLE_KEY);
    return value && Number.isFinite(Date.parse(value)) ? value : null;
  } catch { return null; }
}

function writeLastVisible(at: string) {
  try { window.localStorage.setItem(TARS_LAST_VISIBLE_KEY, at); } catch { /* storage unavailable: no recap next time */ }
}

export interface TarsAwayWindow {
  /** The last time the view was visible before this visit; null on a first visit. */
  since: string | null;
  /** When this visit began: changes after it happened in view, not while away. */
  until: string;
  dismissed: boolean;
  dismiss: () => void;
}

/**
 * The span the user was away from the Tars view: from the last moment it was
 * visible (closed, or the window hidden) to when it became visible again.
 * Showing or dismissing the recap is view-only and never recorded.
 */
export function useTarsAwayWindow(): TarsAwayWindow {
  const [window_, setWindow] = useState(() => ({ since: readLastVisible(), until: new Date().toISOString(), dismissed: false }));
  useEffect(() => {
    writeLastVisible(new Date().toISOString());
    const timer = setInterval(() => { if (document.visibilityState === "visible") writeLastVisible(new Date().toISOString()); }, REFRESH_MS);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") { writeLastVisible(new Date().toISOString()); return; }
      // Back from a hidden window: a new away span begins at the last visible moment.
      const since = readLastVisible();
      const until = new Date().toISOString();
      writeLastVisible(until);
      setWindow({ since, until, dismissed: false });
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      writeLastVisible(new Date().toISOString());
    };
  }, []);
  const dismiss = useCallback(() => setWindow((current) => ({ ...current, dismissed: true })), []);
  return { ...window_, dismiss };
}
