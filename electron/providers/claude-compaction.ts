import { isConversationCompactCommand } from "../../src/lib/providers/native-compaction";
import type { BridgeEvent } from "./types";

/** A successful SDK result alone does not prove that a native command compacted. */
export function createClaudeCompactionTracker(input: string) {
  const requested = isConversationCompactCommand(input);
  let completed = false;
  return {
    observe(events: readonly BridgeEvent[]) {
      if (
        events.some((event) => event.type === "system" && event.compactBoundary)
      ) {
        completed = true;
      }
    },
    finish(aborted: boolean): BridgeEvent | null {
      return requested && !completed && !aborted
        ? {
            type: "error",
            message:
              "Claude did not confirm context compaction. The session may be too short or compaction may have failed. Continue the conversation before trying again.",
            recoverable: true,
          }
        : null;
    },
  };
}
