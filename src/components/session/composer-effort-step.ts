import type { ModelEffortStepDirection } from "@/components/ai-elements/model-effort-step";
import {
  findLatestPendingApproval,
  findLatestPendingUserInput,
} from "@/store/provider-message.utils";
import type { ChatMessage } from "@/types/chat";

/**
 * The "Increase effort" / "Decrease effort" commands are app-level chords; the
 * active task's composer owns the model and effort, so it answers them.
 */
export const COMPOSER_EFFORT_STEP_EVENT = "stave:composer-effort-step";

export interface ComposerEffortStepDetail {
  direction: ModelEffortStepDirection;
  /** Set by the composer that answered, so a second mounted copy does not step again. */
  handled: boolean;
}

export function requestComposerEffortStep(direction: ModelEffortStepDirection) {
  window.dispatchEvent(
    new CustomEvent<ComposerEffortStepDetail>(COMPOSER_EFFORT_STEP_EVENT, {
      detail: { direction, handled: false },
    }),
  );
}

/**
 * True while an approval or a blocking question owns the composer: the
 * prompt input is replaced, so its effort is not the user's to change.
 */
export function isComposerOwnedByPendingInteraction(
  messages: readonly ChatMessage[],
): boolean {
  const list = messages as ChatMessage[];
  return (
    findLatestPendingApproval({ messages: list }) !== null ||
    findLatestPendingUserInput({ messages: list, blockingOnly: true }) !== null
  );
}
