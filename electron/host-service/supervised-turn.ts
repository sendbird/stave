import type { RunQuestionAnswer } from "./run-question-answer";
import type { AgentRunInitialContext } from "../../src/lib/agent-runs/initial-context";
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
import { requestHostGatewayCredentials } from "../provider-accounts/host-gateway-credentials";
import { withGatewayCredential } from "../provider-accounts/gateway-runtime";
import { withProviderAccountScope } from "../provider-accounts/runtime-scope";
import { resolveSupervisedTurnAccounts } from "./supervised-turn-accounts";

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
  /** Prepared in the cancellable host phase, never persisted or exposed through IPC. */
  gatewayCredentials?: import("../provider-accounts/gateway-runtime").GatewayCredentials;
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
  initialContext?: AgentRunInitialContext;
  /** The stage attempt an agent run turn reports for; mints its agent run grant. */
  agentRunStage?: AgentRunStageIdentity;
  /** On an agent run's turn: the run and the assignment, recorded on the user row. */
  agentRunPrompt?: AgentRunPromptProvenance;
  /** Persisted with the reply message before native provider dispatch. */
  questionAnswer?: RunQuestionAnswer;
  /** After an account-pool switch: a new provider conversation on the account switched to. */
  freshSession?: boolean;
}) {
  const store = ensureHostServicePersistenceReady();
  const saved = store.delegationPolicies.loadTaskAccounts(args.taskId) ?? store.loadWorkspaceShell({ workspaceId: args.workspaceId })?.promptDraftByTask?.[args.taskId]?.runtimeOverrides;
  const accounts = resolveSupervisedTurnAccounts(args.runtimeOptions, saved);
  const credentials = args.gatewayCredentials ?? (await requestHostGatewayCredentials(accounts))?.credentials;
  return withGatewayCredential(credentials, () => withProviderAccountScope(accounts, () => runTask({
    workspaceId: args.workspaceId,
    taskId: args.taskId,
    prompt: args.prompt,
    questionAnswer: args.questionAnswer,
    initialContext: args.initialContext,
    controlMode: args.parentTaskId ? "managed" : "interactive",
    controlOwner: args.parentTaskId ? "external" : "stave",
    ...(args.parentTaskId ? { parentTaskId: args.parentTaskId } : {}),
    ...(args.fingerprint
      ? {
          provider: args.fingerprint.providerId,
          runtimeOptions: {
            ...args.runtimeOptions,
            ...accounts,
            model: args.fingerprint.model,
          },
        }
      : args.runtimeOptions
        ? { runtimeOptions: { ...args.runtimeOptions, ...accounts } }
        : { runtimeOptions: accounts }),
    ...(args.retrievedContextParts
      ? { retrievedContextParts: args.retrievedContextParts }
      : {}),
    ...(args.agentRunStage ? { agentRunStage: args.agentRunStage } : {}),
    ...(args.agentRunPrompt ? { agentRunPrompt: args.agentRunPrompt } : {}),
    ...(args.freshSession ? { freshSession: true } : {}),
  })));
}
