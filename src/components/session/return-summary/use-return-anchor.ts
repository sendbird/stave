import { useMemo } from "react";
import {
  countChangesSince,
  findReturnAnchor,
  resolveReturnContext,
} from "@/lib/task-context/return-summary";
import { useAppStore } from "@/store/app.store";
import { useFleetAttention } from "@/store/fleet-attention-store";
import { useTaskReturnStore } from "@/store/task-return-store";
import type { ChatMessage } from "@/types/chat";
import { selectTaskNeed } from "./return-summary.utils";

const revealedArrivalByTask = new Map<string, string>();

/**
 * Claims the one move of the conversation to a return's summary: true the
 * first time for a task's arrival, false after. Kept outside React so a
 * remounted transcript does not move again for the same return.
 */
export function claimReturnReveal(taskId: string, arrivalAt: string) {
  if (revealedArrivalByTask.get(taskId) === arrivalAt) return false;
  revealedArrivalByTask.set(taskId, arrivalAt);
  return true;
}

/** Gives back a claim whose move did not run (the transcript went first). */
export function releaseReturnReveal(taskId: string, arrivalAt: string) {
  if (revealedArrivalByTask.get(taskId) === arrivalAt) revealedArrivalByTask.delete(taskId);
}

/**
 * How long a transcript that just drew is left to settle at the bottom before
 * the move to the summary: its first pins run for a few frames after mount.
 */
export const RETURN_REVEAL_SETTLE_MS = 300;

export interface ReturnAnchor {
  /** The message the summary is drawn beside. */
  messageId: string;
  /** After the last message you had seen; before the first one when none was. */
  placement: "after" | "before";
  /** The arrival it summarizes. */
  arrivalAt: string;
}

/**
 * Where the task's return summary sits in its conversation, or null when this
 * arrival has nothing to say (the same test the card makes: something changed,
 * or the task waits on you). Cheap enough for the transcript: it subscribes to
 * whether the task waits, not to Fleet's items. A new object comes with each
 * conversation update: read its fields, not its identity.
 */
export function useReturnAnchor(taskId: string, messages: readonly ChatMessage[]): ReturnAnchor | null {
  const workspaceId = useAppStore((state) => state.activeWorkspaceId);
  const arrival = useTaskReturnStore((state) => state.arrivalByTask[taskId]);
  const waits = useFleetAttention((snapshot) => selectTaskNeed(snapshot.items, workspaceId, taskId) !== null);
  return useMemo(() => {
    if (!arrival) return null;
    const context = resolveReturnContext({ messages, arrival });
    if (!context) return null;
    const changes = countChangesSince(context.messages, context.visit.baseline);
    const news = changes.turns > 0 || changes.files > 0 || changes.steps > 0 || (waits && !context.wroteSince);
    if (!news) return null;
    const found = findReturnAnchor(context.messages, context.visit);
    return found ? { ...found, arrivalAt: arrival.at } : null;
  }, [arrival, messages, waits]);
}
