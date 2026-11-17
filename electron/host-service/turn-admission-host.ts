import { currentProviderAccountId } from "../provider-accounts/runtime-scope";
import type { StreamTurnArgs } from "../providers/types";
import type { ProviderTurnAdmission } from "../providers/runtime";
import type { RestoredQueuedTurn, SavedTurnStart } from "../persistence/turn-admission-store";
import type { SqliteStore } from "../persistence/sqlite-store";
import { StreamTurnArgsSchema } from "../main/ipc/provider-conversation-schemas";
import { createTurnAdmission, TurnAdmissionWaitSchema } from "./turn-admission";

/** A queued start older than this is not run after a restart. */
export const QUEUED_TURN_RECOVERY_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Why a queued start from before the restart was not run. */
export type QueuedTurnRecoveryFailure = "expired" | "exhausted" | "taskMissing" | "startFailed";

export interface QueuedTurnRecoveryHandlers {
  /** Whether the start's workspace and task still exist and accept work. */
  taskExists: (args: { workspaceId: string; taskId: string }) => boolean;
  /** Re-runs a host-owned start through its own runtime. Throws when it cannot. */
  start: (args: StreamTurnArgs, unattended: boolean) => Promise<unknown>;
  /** Puts a renderer start back into its task's composer queue; false when that is no longer possible. */
  restore: (restored: RestoredQueuedTurn) => boolean;
  /** Tells the user on the task; the turn itself is closed by its owner's boot sweep. */
  failed: (row: SavedTurnStart, reason: QueuedTurnRecoveryFailure) => Promise<void> | void;
}

/** The composer queue item a renderer start returns as. Its id never reuses the turn's own. */
export function toRestoredQueuedTurn(row: SavedTurnStart): RestoredQueuedTurn | null {
  const { args } = row;
  if (!args.workspaceId || !args.taskId || !args.turnId) return null;
  const options = args.runtimeOptions;
  return {
    workspaceId: args.workspaceId,
    taskId: args.taskId,
    item: {
      id: `restored-${args.turnId}`,
      queuedAt: row.queuedAt,
      content: args.prompt,
      attachedFilePaths: [],
      attachments: [],
      providerId: args.providerId,
      ...(options?.model ? { model: options.model } : {}),
      ...(options?.claudeAccountProfileId ? { claudeAccountProfileId: options.claudeAccountProfileId } : {}),
      ...(options?.codexAccountProfileId ? { codexAccountProfileId: options.codexAccountProfileId } : {}),
    },
  };
}

/** The host retains only restart-safe request fields; runtime capabilities remain in memory. */
export function createHostTurnAdmission(store: SqliteStore, options: { now?: () => number } = {}) {
  const now = options.now ?? Date.now;
  // Each queued start gets exactly one boot to run again. Rows this boot will
  // not try are dropped now, before anything else reads the queue.
  const dropped: Array<{ row: SavedTurnStart; reason: QueuedTurnRecoveryFailure }> = [];
  const recovery: SavedTurnStart[] = [];
  for (const row of store.turnAdmission.read()) {
    if (row.state !== "queued" || !row.args.turnId) continue;
    const age = now() - Date.parse(row.queuedAt);
    if ((row.attempts ?? 0) >= 1) dropped.push({ row, reason: "exhausted" });
    else if (!Number.isFinite(age) || age > QUEUED_TURN_RECOVERY_MAX_AGE_MS) dropped.push({ row, reason: "expired" });
    else recovery.push({ ...row, attempts: (row.attempts ?? 0) + 1 });
  }
  store.turnAdmission.write(recovery);
  // Restored items from an earlier boot are already in their drafts on disk.
  store.turnAdmission.writeRestored([]);
  const recovered = new Map<string, SavedTurnStart>(recovery.map(row => [row.args.turnId!, row]));
  const starts = new Map<string, SavedTurnStart>(recovered);
  const recoveryPending = new Set(recovered.keys());
  let savedJson: string | null = null;
  const gate = createTurnAdmission({
    limit: () => store.delegationPolicies.loadRouteSettings()?.globalAgentTurnLimit ?? null,
    save: (queued, started) => {
      // A start that already ran is saved as running, so a restart treats it as
      // interrupted and never runs its original prompt again.
      const pending = new Set(queued.map(row => row.turnId));
      const orderedIds = [...queued.map(row => row.turnId), ...recoveryPending, ...started];
      const rows = [...new Set(orderedIds)].flatMap(id => {
        const row = starts.get(id);
        return row ? [{ ...row, state: pending.has(id) || (recoveryPending.has(id) && !started.includes(id)) ? "queued" as const : "running" as const }] : [];
      });
      const json = JSON.stringify(rows);
      if (json !== savedJson) { store.turnAdmission.write(rows); savedJson = json; }
    },
  });
  const forget = (id: string) => { recoveryPending.delete(id); starts.delete(id); gate.refresh(); };
  function restoreRendererStarts(handlers: Pick<QueuedTurnRecoveryHandlers, "taskExists" | "restore">) {
    const restored: RestoredQueuedTurn[] = [];
    for (let index = recovery.length - 1; index >= 0; index--) {
      const row = recovery[index]!;
      if (row.hostTask) continue;
      recovery.splice(index, 1);
      const id = row.args.turnId!;
      const workspaceId = row.args.workspaceId, taskId = row.args.taskId;
      // The host never runs a renderer start again: its renderer and stream
      // are gone. The user sends or discards it from the composer queue.
      forget(id);
      const item = workspaceId && taskId && handlers.taskExists({ workspaceId, taskId }) ? toRestoredQueuedTurn(row) : null;
      try {
        if (item && handlers.restore(item)) restored.unshift(item);
        else console.warn("[turn-admission] queued renderer turn could not be restored", { turnId: id });
      } catch (error) {
        console.error("[turn-admission] queued renderer turn restore failed", { turnId: id, error: String(error) });
      }
    }
    if (restored.length) store.turnAdmission.writeRestored([...store.turnAdmission.readRestored(), ...restored]);
  }
  const admission: ProviderTurnAdmission = {
    async acquire(args, changed) {
      const id = args.turnId!;
      const { unattendedAutomation: _authorization, staveTurnGrants: _grants, agentRunStage: _stage, turnPolicy: _policy,
        managedTask: _managed, freshSession: _fresh, admissionPriority: _priority, executionPolicy: _execution, admissionOwner: _owner, ...safe } = args;
      // Parse a projection: caller callbacks and in-memory capabilities never enter SQLite.
      const { turnId, providerId, prompt, conversation, taskId, workspaceId, cwd, runtimeOptions } = safe;
      const savedArgs = StreamTurnArgsSchema.parse({ turnId, providerId, prompt, conversation, taskId, workspaceId, cwd, runtimeOptions: { ...runtimeOptions, claudeAccountProfileId: runtimeOptions?.claudeAccountProfileId ?? currentProviderAccountId("claude-code"), codexAccountProfileId: runtimeOptions?.codexAccountProfileId ?? currentProviderAccountId("codex") } });
      const priority = args.admissionPriority ?? (args.agentRunStage || args.unattendedAutomation ? "automatic" : "user");
      const previous = recovered.get(id);
      recoveryPending.delete(id);
      starts.set(id, { args: savedArgs, priority, state: "queued", queuedAt: previous?.queuedAt ?? new Date(now()).toISOString(),
        ...(previous?.attempts ? { attempts: previous.attempts } : {}), hostTask: args.admissionOwner === "host-task",
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
    isQueued: (turnId: string) => {
      const snapshot = gate.snapshot();
      return recoveryPending.has(turnId) || snapshot.running.includes(turnId) || snapshot.suspended.includes(turnId) || snapshot.queued.some(row => row.turnId === turnId);
    },
    /**
     * Restored renderer starts this boot put back into composer queues. The
     * renderer takes them once to show them in a session it already loaded.
     */
    takeRestored: (args: { workspaceId?: string } = {}) => {
      const all = store.turnAdmission.readRestored();
      const taken = all.filter(row => !args.workspaceId || row.workspaceId === args.workspaceId);
      store.turnAdmission.writeRestored(all.filter(row => !taken.includes(row)));
      return taken;
    },
    /**
     * Put renderer starts back into their composer queues. Synchronous, so the
     * host runs it before it accepts requests: a renderer that takes restored
     * starts never finds the list still empty. `recover` calls it too.
     */
    restoreRendererStarts,
    recover: async (handlers: QueuedTurnRecoveryHandlers) => {
      restoreRendererStarts(handlers);
      const notify = async (row: SavedTurnStart, reason: QueuedTurnRecoveryFailure) => {
        try { await handlers.failed(row, reason); }
        catch (error) { console.error("[turn-admission] queued turn notice failed", { turnId: row.args.turnId, error: String(error) }); }
      };
      for (const { row, reason } of dropped.splice(0)) await notify(row, reason);
      for (const row of recovery.splice(0)) {
        const id = row.args.turnId!;
        const workspaceId = row.args.workspaceId, taskId = row.args.taskId;
        if (!workspaceId || !taskId || !handlers.taskExists({ workspaceId, taskId })) { forget(id); await notify(row, "taskMissing"); continue; }
        try {
          await handlers.start({ ...row.args, admissionPriority: row.priority, admissionOwner: "host-task",
            freshSession: row.freshSession, managedTask: row.managedTask, agentRunStage: row.agentRunStage }, row.unattended ?? false);
        } catch (error) {
          console.error("[turn-admission] queued turn recovery failed", { turnId: id, error: String(error) });
          // Only a start that never reached admission is still ours to drop.
          if (recoveryPending.has(id)) { forget(id); await notify(row, "startFailed"); }
        }
      }
    },
  };
}
