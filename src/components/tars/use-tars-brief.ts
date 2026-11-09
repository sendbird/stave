import { useEffect, useState } from "react";
import type { TarsBrief, TarsBriefInput } from "@/lib/tars/brief";

/** Reads one responsibility's brief from the host. */
export type TarsBriefLoader = (input: TarsBriefInput) => Promise<TarsBrief>;

/**
 * Where the request view's saved texts stand: being read, read, a read that
 * failed (Retry reads again), or a bridge that cannot read them.
 */
export type TarsBriefState =
  | { status: "loading" }
  | { status: "ready"; brief: TarsBrief }
  | { status: "failed" }
  | { status: "unavailable" };

/**
 * A brief answers only the work it was asked for. One that names other work
 * is treated as a failed read and never shown, so a reply that arrives after
 * the view moved on cannot put another work's message on screen.
 */
export function acceptTarsBrief(responsibilityId: string, brief: TarsBrief): TarsBriefState {
  return brief.responsibilityId === responsibilityId ? { status: "ready", brief } : { status: "failed" };
}

/**
 * The saved message and instruction of one responsibility, read each time the
 * request view opens it. They never change after admission, so a snapshot
 * change does not read them again; switching to other work does, and a reply
 * for the work shown before is dropped.
 */
export function useTarsBrief(responsibilityId: string, load: TarsBriefLoader | undefined) {
  const [entry, setEntry] = useState<{ id: string; attempt: number; state: TarsBriefState } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!load) return;
    let current = true;
    load({ responsibilityId }).then(
      (brief) => { if (current) setEntry({ id: responsibilityId, attempt, state: acceptTarsBrief(responsibilityId, brief) }); },
      () => { if (current) setEntry({ id: responsibilityId, attempt, state: { status: "failed" } }); },
    );
    return () => { current = false; };
  }, [attempt, load, responsibilityId]);
  // Until this work's own read settles (a first open, another work, a retry), the view says it is loading.
  const state: TarsBriefState = !load ? { status: "unavailable" }
    : entry && entry.id === responsibilityId && entry.attempt === attempt ? entry.state : { status: "loading" };
  return { state, retry: () => setAttempt((value) => value + 1) };
}
