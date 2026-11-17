import { currentProviderAccountId } from "../provider-accounts/runtime-scope";
import type { StreamTurnArgs } from "../providers/types";
import type { ProviderTurnAdmission } from "../providers/runtime";
import type { SavedTurnStart } from "../persistence/turn-admission-store";
import type { SqliteStore } from "../persistence/sqlite-store";
import { StreamTurnArgsSchema } from "../main/ipc/provider-conversation-schemas";
import { createTurnAdmission, TurnAdmissionWaitSchema } from "./turn-admission";

/** The host retains only restart-safe request fields; runtime capabilities remain in memory. */
export function createHostTurnAdmission(store: SqliteStore) {
  const recovery = store.turnAdmission.read().filter(row => row.state === "queued");
  const starts = new Map<string, SavedTurnStart>(recovery.map(row => [row.args.turnId!, row]));
  const recoveryPending = new Set(recovery.map(row => row.args.turnId!));
  let savedJson: string | null = null;
  const gate = createTurnAdmission({
    limit: () => store.delegationPolicies.loadRouteSettings()?.globalAgentTurnLimit ?? null,
    save: (queued, running) => {
      const pending = new Set(queued.map(row => row.turnId));
      const orderedIds = [...queued.map(row => row.turnId), ...recoveryPending, ...running];
      const rows = [...new Set(orderedIds)].flatMap(id => { const row = starts.get(id); return row ? [{ ...row, state: pending.has(id) || recoveryPending.has(id) ? "queued" as const : "running" as const }] : []; });
      const json = JSON.stringify(rows);
      if (json !== savedJson) { store.turnAdmission.write(rows); savedJson = json; }
    },
  });
  const admission: ProviderTurnAdmission = {
    async acquire(args, changed) {
      const id = args.turnId!;
      const { unattendedAutomation: _authorization, staveTurnGrants: _grants, agentRunStage: _stage, turnPolicy: _policy,
        managedTask: _managed, freshSession: _fresh, admissionPriority: _priority, executionPolicy: _execution, admissionOwner: _owner, ...safe } = args;
      // Parse a projection: caller callbacks and in-memory capabilities never enter SQLite.
      const { turnId, providerId, prompt, conversation, taskId, workspaceId, cwd, runtimeOptions } = safe;
      const savedArgs = StreamTurnArgsSchema.parse({ turnId, providerId, prompt, conversation, taskId, workspaceId, cwd, runtimeOptions: { ...runtimeOptions, claudeAccountProfileId: runtimeOptions?.claudeAccountProfileId ?? currentProviderAccountId("claude-code"), codexAccountProfileId: runtimeOptions?.codexAccountProfileId ?? currentProviderAccountId("codex") } });
      const priority = args.admissionPriority ?? (args.agentRunStage || args.unattendedAutomation ? "automatic" : "user");
      recoveryPending.delete(id);
      starts.set(id, { args: savedArgs, priority, state: "queued", hostTask: args.admissionOwner === "host-task",
        unattended: Boolean(args.unattendedAutomation), freshSession: args.freshSession, managedTask: args.managedTask, agentRunStage: args.agentRunStage });
      try { await gate.acquire({ turnId: id, taskId: args.taskId, priority }, changed); }
      catch (error) { starts.delete(id); throw error; }
    },
    release(id) { gate.release(id); starts.delete(id); },
    cancel: id => gate.cancel(id),
    cancelTask: taskId => gate.cancelTask(taskId),
    freeze: gate.freeze,
    isQueued: gate.isQueued,
  };
  return {
    admission,
    refresh: gate.refresh,
    wait: async (input: unknown) => {
      const args = TurnAdmissionWaitSchema.parse(input);
      await gate.wait(args.taskId, args.waiting);
      return { ok: true as const };
    },
    snapshot: gate.snapshot,
    /** Real running processes are counted by live admission, never by stale persisted flags. */
    isQueued: (turnId: string) => recoveryPending.has(turnId) || gate.snapshot().running.includes(turnId) || gate.snapshot().queued.some(row => row.turnId === turnId),
    recover: async (start: (args: StreamTurnArgs, unattended: boolean) => unknown) => {
      for (const row of recovery) {
        try {
          await start({ ...row.args, admissionPriority: row.priority, ...(row.hostTask ? { admissionOwner: "host-task" as const } : {}),
            freshSession: row.freshSession, managedTask: row.managedTask, agentRunStage: row.agentRunStage }, row.unattended ?? false);
        } catch (error) {
          console.error("[turn-admission] queued turn recovery failed", { turnId: row.args.turnId, error: String(error) });
        }
      }
      recovery.length = 0;
    },
  };
}
