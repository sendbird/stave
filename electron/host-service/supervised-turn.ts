/**
 * The one path a supervisor uses to add a turn to a task the user already
 * owns. Identical to a user turn except that it always targets an existing
 * task and always keeps the task interactive and Stave-owned — waking a task
 * must never quietly hand its control to an external owner.
 *
 * Used by: `electron/host-service/wake-up-runtime.ts` and
 * `electron/host-service/supervision/mission-runtime.ts` (both wired in
 * `electron/host-service.ts`).
 */
import type { MissionStageIdentity } from "../../src/lib/missions/domain";
import { userSettingsPermissionOptions } from "../../src/lib/providers/managed-task-runtime";
import type {
  CanonicalRetrievedContextPart,
  ProviderId,
  ProviderRuntimeOptions,
} from "../../src/lib/providers/provider.types";
import { runTask } from "./local-mcp-runtime";
import { ensureHostServicePersistenceReady } from "./persistence";

/**
 * The permissions a supervised turn runs with when no consent sets them (a
 * wake-up, a mission on "Your settings"): the user's own synced provider
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
  prompt: string;
  /**
   * The runtime identity the supervisor validated against live task state on
   * this very tick. Passed explicitly rather than left to `runTask`'s default,
   * because "wake this task" means wake it as itself — a Codex task resumed
   * under the Claude default would be a different agent answering.
   */
  fingerprint?: { providerId: ProviderId; model: string };
  /** Extra provider options, such as the permissions a mission's consent sets. */
  runtimeOptions?: ProviderRuntimeOptions;
  retrievedContextParts?: CanonicalRetrievedContextPart[];
  /** The stage attempt a mission turn reports for; mints its mission grant. */
  missionStage?: MissionStageIdentity;
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
    ...(args.missionStage ? { missionStage: args.missionStage } : {}),
  });
}
