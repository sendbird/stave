/**
 * The one path a supervisor uses to add a turn to a task the user already
 * owns. Identical to a user turn except that it always targets an existing
 * task and always keeps the task interactive and Stave-owned — waking a task
 * must never quietly hand its control to an external owner.
 *
 * Used by: `electron/host-service/wake-up-runtime.ts` (wired in
 * `electron/host-service.ts`).
 */
import type {
  CanonicalRetrievedContextPart,
  ProviderId,
} from "../../src/lib/providers/provider.types";
import { runTask } from "./local-mcp-runtime";

export async function runSupervisedTurn(args: {
  workspaceId: string;
  taskId: string;
  prompt: string;
  /**
   * The runtime identity the supervisor validated against live task state on
   * this very tick. Passed explicitly rather than left to `runTask`'s default,
   * because "wake this task" means wake it as itself — a Codex task resumed
   * under the Claude default would be a different agent answering.
   */
  fingerprint?: { providerId: ProviderId; model: string };
  retrievedContextParts?: CanonicalRetrievedContextPart[];
}) {
  return runTask({
    workspaceId: args.workspaceId,
    taskId: args.taskId,
    prompt: args.prompt,
    controlMode: "interactive",
    controlOwner: "stave",
    ...(args.fingerprint
      ? {
          provider: args.fingerprint.providerId,
          runtimeOptions: { model: args.fingerprint.model },
        }
      : {}),
    ...(args.retrievedContextParts
      ? { retrievedContextParts: args.retrievedContextParts }
      : {}),
  });
}
