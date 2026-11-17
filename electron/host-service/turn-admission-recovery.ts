import { i18n } from "../../src/i18n/runtime";
import type { SqliteStore } from "../persistence/sqlite-store";
import type { GatewayCredentials } from "../provider-accounts/gateway-runtime";
import { withGatewayCredential } from "../provider-accounts/gateway-runtime";
import { withRequestAccountScope } from "../provider-accounts/runtime-scope";
import type { ProviderAccountSelection } from "../../src/lib/providers/provider-account-selection";
import type { StreamTurnArgs } from "../providers/types";
import type { QueuedTurnRecoveryHandlers } from "./turn-admission-host";

/**
 * How queued starts from before a restart come back. Only host-owned starts
 * run again, each through its own runtime, and only while their workspace and
 * task still exist; a renderer start returns to its task's composer queue for
 * the user to send or discard. A start that cannot come back tells the user
 * on its task.
 */
export function createQueuedTurnRecoveryHandlers(deps: {
  store: SqliteStore;
  authorizationForTurn: (turnId: string) => string | undefined;
  requestCredentials: (accounts: ProviderAccountSelection) => Promise<{ credentials?: GatewayCredentials } | undefined>;
  resumeQueuedProviderTurn: (args: StreamTurnArgs) => Promise<unknown>;
  notify: (args: { workspaceId: string; taskId: string; body: string; payload: Record<string, unknown>; dedupeKey: string }) => Promise<void>;
}): QueuedTurnRecoveryHandlers {
  const { store } = deps;
  return {
    taskExists: ({ workspaceId, taskId }) => {
      if (store.listArchivedWorkspacesPersistence().some(record => record.workspaceId === workspaceId)) return false;
      return Boolean(store.loadWorkspaceShell({ workspaceId })?.tasks.some(task => task.id === taskId && !task.archivedAt));
    },
    restore: (restored) => store.turnAdmission.restoreToDraft(restored),
    start: async (args, unattended) => {
      const authorizationToken = unattended ? deps.authorizationForTurn(args.turnId!) : undefined;
      if (unattended && !authorizationToken) throw new Error("Queued automation authorization could not be restored.");
      const restored = { ...args, ...(authorizationToken ? { unattendedAutomation: { authorizationToken } } : {}) };
      const response = await deps.requestCredentials(restored.runtimeOptions ?? {});
      if (!response) throw new Error("Queued turn account credentials could not be resolved.");
      return withGatewayCredential(response.credentials, () => withRequestAccountScope(restored, () => deps.resumeQueuedProviderTurn(restored)));
    },
    failed: async (row, reason) => {
      const { workspaceId, taskId, turnId } = row.args;
      if (!workspaceId || !taskId) return;
      await deps.notify({
        workspaceId,
        taskId,
        body: i18n.t(`notifications:queuedTurnRecovery.${reason}`),
        payload: { source: "turn-admission", reason, ...(turnId ? { turnId } : {}) },
        dedupeKey: `turn-admission.recovery_failed:${turnId}`,
      });
    },
  };
}
