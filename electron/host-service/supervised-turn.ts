/**
 * The one path a supervisor uses to add a turn to a task the user already
 * owns. Identical to a user turn except that it always targets an existing
 * task and always keeps the task interactive and Stave-owned — waking a task
 * must never quietly hand its control to an external owner.
 *
 * Used by: `electron/host-service/wake-up-runtime.ts` and
 * `electron/host-service/supervision/agent-run-runtime.ts` (both wired in
 * `electron/host-service.ts`).
 */
import type { AgentRunStageIdentity } from "../../src/lib/agent-runs/domain";
import { userSettingsPermissionOptions } from "../../src/lib/providers/managed-task-runtime";
import type {
  CanonicalRetrievedContextPart,
  ProviderId,
  ProviderRuntimeOptions,
} from "../../src/lib/providers/provider.types";
import type { AgentRunPromptProvenance } from "../../src/types/chat";
import { runTask } from "./local-mcp-runtime";
import { ensureHostServicePersistenceReady } from "./persistence";

/**
 * The permissions a supervised turn runs with when no consent sets them (a
 * wake-up, an agent run on "Your settings"): the user's own synced provider
 * settings, never the runtime's fallbacks. Undefined for providers without
 * synced settings.
 */
export function loadUserPermissionOptions(
  providerId: ProviderId,
): ProviderRuntimeOptions | undefined {
  return userSettingsPermissionOptions(
    providerId,
    ensureHostServicePersistenceReady().delegationPolicies?.loadSettings(),
  );
}

export async function runSupervisedTurn(args: {
  workspaceId: string;
  taskId: string;
  /** A supervised delegate retains managed control and its frozen parent link. */
  parentTaskId?: string;
  prompt: string;
  /**
   * The runtime identity the supervisor validated against live task state on
   * this very tick. Passed explicitly rather than left to `runTask`'s default,
   * because "wake this task" means wake it as itself — a Codex task resumed
   * under the Claude default would be a different agent answering.
   */
  fingerprint?: { providerId: ProviderId; model: string };
  /** Extra provider options, such as the permissions an agent run's consent sets. */
  runtimeOptions?: ProviderRuntimeOptions;
  retrievedContextParts?: CanonicalRetrievedContextPart[];
  /** The stage attempt an agent run turn reports for; mints its agent run grant. */
  agentRunStage?: AgentRunStageIdentity;
  /** On an agent run's turn: the run and the assignment, recorded on the user row. */
  agentRunPrompt?: AgentRunPromptProvenance;
}) {
  return runTask({
    workspaceId: args.workspaceId,
    taskId: args.taskId,
    prompt: args.prompt,
    controlMode: args.parentTaskId ? "managed" : "interactive",
    controlOwner: args.parentTaskId ? "external" : "stave",
    ...(args.parentTaskId ? { parentTaskId: args.parentTaskId } : {}),
    ...(args.fingerprint
      ? {
          provider: args.fingerprint.providerId,
          runtimeOptions: {
            ...args.runtimeOptions,
            model: args.fingerprint.model,
          },
        }
      : args.runtimeOptions
        ? { runtimeOptions: args.runtimeOptions }
        : {}),
    ...(args.retrievedContextParts
      ? { retrievedContextParts: args.retrievedContextParts }
      : {}),
    ...(args.agentRunStage ? { agentRunStage: args.agentRunStage } : {}),
    ...(args.agentRunPrompt ? { agentRunPrompt: args.agentRunPrompt } : {}),
  });
}
