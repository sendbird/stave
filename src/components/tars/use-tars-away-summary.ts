import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  dismissTarsAway, isSameTarsAwayState, markTarsAwaySeen, returnToTarsAway, type TarsAwaySpan, type TarsAwayState,
} from "@/lib/tars/away-state";
import type { TarsBridgeApi } from "@/lib/tars/types";

type AwayBridge = Pick<TarsBridgeApi, "getAway" | "saveAway">;

/**
 * While the user stays, the seen time is noted and saved this often, so a
 * crash loses at most this much. Nothing is written per scroll event: leaving
 * (blur, a hidden window, closing the view) notes and saves once more.
 */
export const TARS_AWAY_SAVE_INTERVAL_MS = 60_000;

/** The window is visible and has focus: the user can be looking at it. */
function isWindowPresent() {
  return document.visibilityState === "visible" && document.hasFocus();
}

export interface TarsAwaySummaryState {
  /** The span the summary on screen covers; null before the saved state was read, and when there is none. */
  span: TarsAwaySpan | null;
  /**
   * This arrival opened the span and its card was not shown yet. Until
   * `settle`, the end of the conversation does not count as seen: arriving at
   * the end is not the same as having been shown what happened.
   */
  arrived: boolean;
  /** The card was brought into view, or there was nothing to show. */
  settle: () => void;
  dismiss: () => void;
}

/**
 * Tracks when the user last saw the end of the conversation and opens the
 * "while you were away" span when they come back (`away-state`). The state is
 * read once from the host, kept in a ref and saved only when it changed: on a
 * slow interval, on leaving, when a span opens and on dismissal. `isAtEnd`
 * says whether the transcript is scrolled to its end right now.
 *
 * Without a bridge that saves it (an older host, a bare preview) there is no
 * summary: a card that could not stay dismissed is worse than none.
 */
export function useTarsAwaySummary(bridge: AwayBridge | undefined, isAtEnd: () => boolean, contentKey: string): TarsAwaySummaryState {
  const [span, setSpan] = useState<TarsAwaySpan | null>(null);
  const [arrived, setArrived] = useState(false);
  const memory = useRef<TarsAwayState | null>(null);
  const saved = useRef<TarsAwayState | null>(null);
  const present = useRef(false);
  const unsettled = useRef(false);
  // The callbacks below outlive the render that made them; they read the newest `isAtEnd` here.
  const atEnd = useRef(isAtEnd);
  atEnd.current = isAtEnd;
  const save = bridge?.saveAway;
  const read = bridge?.getAway;

  const apply = useCallback((next: TarsAwayState) => {
    memory.current = next;
    // Only a changed span re-renders; the seen time moves without one.
    setSpan((current) => current?.since === next.summary?.since && current?.until === next.summary?.until ? current : next.summary);
  }, []);
  const flush = useCallback(() => {
    const state = memory.current;
    if (!state || !save || (saved.current && isSameTarsAwayState(saved.current, state))) return;
    saved.current = state;
    // A failed save is tried again with the next one.
    void save(state).catch(() => { if (saved.current === state) saved.current = null; });
  }, [save]);
  const see = useCallback(() => {
    if (!memory.current || !present.current || unsettled.current || !atEnd.current()) return;
    apply(markTarsAwaySeen(memory.current, new Date().toISOString()));
  }, [apply]);
  const arrive = useCallback(() => {
    if (!memory.current || present.current || !isWindowPresent()) return;
    present.current = true;
    const next = returnToTarsAway(memory.current, new Date().toISOString());
    if (next === memory.current) { see(); return; }
    apply(next);
    unsettled.current = true;
    setArrived(true);
    flush();
  }, [apply, flush, see]);
  const leave = useCallback(() => {
    if (!present.current) return;
    see();
    present.current = false;
    flush();
  }, [flush, see]);

  useEffect(() => {
    if (!read || !save) return;
    let cancelled = false;
    void read().then((state) => {
      if (cancelled) return;
      memory.current = state;
      saved.current = state;
      setSpan(state.summary);
      arrive();
    }).catch(() => undefined);
    const onPresence = () => { if (isWindowPresent()) arrive(); else leave(); };
    const timer = setInterval(() => { see(); flush(); }, TARS_AWAY_SAVE_INTERVAL_MS);
    window.addEventListener("focus", onPresence);
    window.addEventListener("blur", onPresence);
    window.addEventListener("pagehide", leave);
    document.addEventListener("visibilitychange", onPresence);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("focus", onPresence);
      window.removeEventListener("blur", onPresence);
      window.removeEventListener("pagehide", leave);
      document.removeEventListener("visibilitychange", onPresence);
    };
  }, [arrive, flush, leave, read, save, see]);
  // Closing the view is leaving. A layout cleanup runs while the transcript is still in the document, so its scroll position can be read.
  useLayoutEffect(() => leave, [leave]);
  // New entries that arrive while the user is at the end are seen as they arrive.
  useEffect(() => { see(); }, [contentKey, see]);

  const settle = useCallback(() => {
    unsettled.current = false;
    setArrived(false);
  }, []);
  const dismiss = useCallback(() => {
    if (!memory.current) return;
    apply(dismissTarsAway(memory.current));
    settle();
    flush();
  }, [apply, flush, settle]);
  return { span, arrived, settle, dismiss };
}
