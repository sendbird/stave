import { useEffect, useRef, useState } from "react";
import type { FleetInboxEntry } from "@/lib/fleet/inbox-model";
import { useAppStore } from "@/store/app.store";
import { answerFromBell, readBellRequest, settleBellRequest, type BellAnswer } from "@/store/bell-quick-answer";

export const BELL_ANSWER_FEEDBACK_MS = 2_000;
export type BellAnswerStatus = "sending" | "settling" | "delivered" | "skipped" | "failed";

type AnswerFeedback = {
  entry: FleetInboxEntry;
  index: number;
  status: BellAnswerStatus;
};

export function useBellAnswerFeedback() {
  const [feedback, setFeedback] = useState<ReadonlyMap<string, AnswerFeedback>>(() => new Map());
  const pending = useRef(new Set<string>());
  const timers = useRef(new Map<string, number>());

  useEffect(() => {
    const current = timers.current;
    return () => current.forEach(window.clearTimeout);
  }, []);

  async function submitAnswer(entry: FleetInboxEntry, index: number, answer?: BellAnswer) {
    if (pending.current.has(entry.id)) return;
    const state = useAppStore.getState();
    if (!answer && readBellRequest(state, entry).status !== "stale") return;
    pending.current.add(entry.id);
    const show = (status: BellAnswerStatus) =>
      setFeedback((previous) => new Map(previous).set(entry.id, { entry, index, status }));
    const remove = () => {
      timers.current.delete(entry.id);
      setFeedback((previous) => {
        const next = new Map(previous);
        next.delete(entry.id);
        return next;
      });
    };
    show(answer ? "sending" : "settling");
    try {
      if (!answer) {
        if (await settleBellRequest(state, entry)) remove();
        else show("failed");
        return;
      }
      const { status } = await answerFromBell(useAppStore.getState, entry, answer);
      show(status);
      if (status !== "failed") {
        timers.current.set(entry.id, window.setTimeout(remove, BELL_ANSWER_FEEDBACK_MS));
      }
    } catch {
      show("failed");
    } finally {
      pending.current.delete(entry.id);
    }
  }

  return { feedback, submitAnswer };
}
