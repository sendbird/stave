import { useEffect, useState } from "react";
import { nextNowLine, NOW_LINE_MIN_INTERVAL_MS, type NowLineState } from "@/lib/agent-runs/now-line";

/** Holds each phrase for at least the minimum interval, so a burst of tool calls reads as steady work. */
export function useNowLine(candidate: string | null) {
  const [state, setState] = useState<NowLineState | null>(null);
  useEffect(() => {
    if (!candidate) {
      setState(null);
      return;
    }
    const next = nextNowLine(state, candidate, Date.now());
    if (next !== state) {
      setState(next);
      return;
    }
    if (state && state.text !== candidate) {
      const wait = Math.max(0, state.shownAt + NOW_LINE_MIN_INTERVAL_MS - Date.now());
      const timer = window.setTimeout(() => setState({ text: candidate, shownAt: Date.now() }), wait);
      return () => window.clearTimeout(timer);
    }
  }, [candidate, state]);
  return state?.text ?? null;
}
