import { useCallback, useEffect, useRef, useState } from "react";
import type { TarsBridgeApi } from "@/lib/tars/types";
import {
  TarsSuggestResultSchema, tarsSuggestionFactsKey, type TarsGeneratedSuggestion, type TarsSuggestFailure, type TarsSuggestionFact, type TarsSuggestionLanguage, type TarsSuggestResult,
} from "@/lib/tars/suggestion-generation";

/**
 * What the chip row shows:
 * - `off`: nothing to suggest about (no observed facts) or a bridge without suggestions; no request is made;
 * - `loading`: Tars's model is writing them;
 * - `ready`: what the model wrote, possibly nothing;
 * - `failed`: no chips were written, and why (`unreachable`: the request itself did not go through).
 */
export type TarsSuggestionsState =
  | { status: "off" }
  | { status: "loading" }
  | { status: "ready"; items: readonly TarsGeneratedSuggestion[]; model: string }
  | { status: "failed"; reason: TarsSuggestFailure | "unreachable" };

/** Facts change in bursts (a read, then its runs); one request follows the burst. */
export const TARS_SUGGESTION_DEBOUNCE_MS = 600;

type Settled = Extract<TarsSuggestionsState, { status: "ready" | "failed" }>;

function settledOf(result: TarsSuggestResult): Settled {
  return result.status === "generated" ? { status: "ready", items: result.suggestions, model: result.model } : { status: "failed", reason: result.reason };
}

/**
 * Suggested requests written by Tars's saved reasoning model, about the facts
 * the window observed now. One request per distinct set of facts: an answer,
 * a failure or an empty list is kept for those facts and never requested again
 * by itself, so nothing regenerates in a loop; `retry` asks once more. An
 * answer for facts that are no longer current is kept for them but not shown.
 */
export function useTarsSuggestions(args: {
  bridge: Pick<TarsBridgeApi, "suggest"> | undefined;
  facts: readonly TarsSuggestionFact[];
  language: TarsSuggestionLanguage;
  /** The saved reasoning choice (`provider:model`), or null before one was saved: saving or changing it asks again. */
  model: string | null;
}) {
  const { bridge, facts, language } = args;
  const key = bridge?.suggest && facts.length ? `${args.model ?? ""}\n${tarsSuggestionFactsKey(facts, language)}` : null;
  const [result, setResult] = useState<{ key: string; state: TarsSuggestionsState } | null>(null);
  const [attempt, setAttempt] = useState(0);
  /** Settled answers by facts key, for this view's lifetime. */
  const settled = useRef(new Map<string, Settled>());
  /** Requests under way by facts key: facts that come back while one runs join it instead of asking again. */
  const inflight = useRef(new Map<string, Promise<Settled>>());
  const mounted = useRef(false);
  const current = useRef<string | null>(null);
  const latest = useRef({ facts, language, bridge });
  latest.current = { facts, language, bridge };
  current.current = key;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!key) return;
    const setState = (state: TarsSuggestionsState) => setResult({ key, state });
    let active = true;
    const known = settled.current.get(key);
    if (known) { setState(known); return; }
    setState({ status: "loading" });
    let timer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      timer = null;
      // A shared request may have settled while this key was debouncing.
      const completed = settled.current.get(key);
      if (completed) { setState(completed); return; }
      let run = inflight.current.get(key);
      if (!run) {
        const { facts: asked, language: asLanguage, bridge: via } = latest.current;
        const requestId = crypto.randomUUID();
        // One model call at a time. A queued generation that became obsolete costs no turn.
        const preceding = Promise.all([...inflight.current.values()]);
        let skipped = false;
        run = preceding.then(() => {
          if (!mounted.current || current.current !== key) {
            skipped = true;
            return { status: "failed" as const, requestId, reason: "provider" as const };
          }
          return via!.suggest!({ requestId, language: asLanguage, facts: [...asked] });
        })
          .then((raw) => TarsSuggestResultSchema.parse(raw))
          .then((result): Settled => result.requestId === requestId ? settledOf(result) : { status: "failed", reason: "unreachable" })
          .catch((): Settled => ({ status: "failed", reason: "unreachable" }))
          .then((value) => { if (!skipped) settled.current.set(key, value);
            if (settled.current.size > 32) settled.current.delete(settled.current.keys().next().value!);
            inflight.current.delete(key); return value; });
        inflight.current.set(key, run);
      }
      void run.then((value) => { if (active && current.current === key) setState(value); });
    }, TARS_SUGGESTION_DEBOUNCE_MS);
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [key, attempt]);

  /** Asks again for the facts shown now, after a failure or an empty answer. */
  const retry = useCallback(() => {
    const now = current.current;
    if (!now || inflight.current.has(now)) return;
    settled.current.delete(now);
    setAttempt((value) => value + 1);
  }, []);
  // Hide the previous generation during render, before the effect for new facts runs.
  const state: TarsSuggestionsState = !facts.length ? { status: "off" }
    : !bridge?.suggest ? { status: "failed", reason: "unreachable" }
    : result?.key === key ? result.state : { status: "loading" };
  return { state, retry };
}
