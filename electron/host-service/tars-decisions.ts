import { resolveTarsWorkspace } from "../main/tars-scope";
import type { PersistenceRepositoryRegistryEntry } from "../persistence/types";
import { ApplyTarsDecisionInputSchema } from "../../src/lib/tars/conversation";
import { TARS_CONFIRMED_OPERATIONS, type TarsActionReceipt, type TarsMessage } from "../../src/lib/tars/conversation";
import { isTarsStorageBusy, TarsStorageBusyError, type TarsConversationStore } from "../persistence/tars-conversation-store";
import type { TarsStore } from "../persistence/tars-store";
import { admitTarsControl, tarsControlRejection, TarsControlRejection, type TarsControlLedger, type TarsControlRequest } from "./tars-control";
import { admitTarsReprioritize } from "./tars-queue";
import type { AgentConfig } from "../../src/lib/agents/schema";
import {
  admitTarsAgent, assertTarsAgentCatalog, isTarsAgentCatalogPending, tarsDelegationCeiling, TarsDelegateRejection,
} from "../../src/lib/tars/agents";
import { tarsExecutionTarget } from "../../src/lib/tars/execution-resources";
import { buildTarsBranchName } from "../../src/lib/tars/branch-name";
import { TARS_ASSIGNMENT_MAX_CHARS, type TarsWorkingChanges } from "../../src/lib/tars/types";
import { tarsFollowUpRefusal } from "./tars-follow-up-admission";
import { tarsPublishProposalRefusal } from "./tars-publish";

/** What admission asks the host to snapshot for a message that included the user's working changes. */
export interface TarsWorkingChangesRequest {
  workspaceId: string;
  repositoryPath: string;
  messageId: string;
  /** The commit time; the message's answer time, so a retry asks for the same snapshot. */
  date: string;
}

export interface TarsDecisionPorts {
  /** Both stores must share one SQLite connection; applyReceipt owns the transaction. */
  conversations: TarsConversationStore;
  responsibilities: TarsStore;
  /** Must read the current persisted registry on every call, including inside the receipt transaction. */
  readRegistry: () => PersistenceRepositoryRegistryEntry[];
  /** Optional asynchronous refresh; no captured registry from it grants mutation authority. */
  refreshContext?: () => Promise<void>;
  requestTick: () => void;
  /**
   * The host's active agents (built-ins and synced saved agents). Absent, no
   * delegate action may name an agent.
   */
  agents?: () => readonly AgentConfig[];
  /**
   * False until the renderer synced the saved agents. Until then an agent that
   * is not a built-in keeps its action pending and retryable, never rejected.
   */
  agentCatalogReady?: () => boolean;
  /** The runtime's admitted control path, shared with direct clicks. */
  control: (request: TarsControlRequest, ledger: TarsControlLedger<TarsActionReceipt>) => Promise<TarsActionReceipt>;
  /**
   * Snapshots the target workspace's working tree for a message that asked to
   * include the user's working changes. It must leave the user's index and
   * files untouched and return the same snapshot when asked again for the same
   * message and workspace. Absent, such a message's work is refused rather
   * than silently started from the branch.
   */
  snapshotWorkingChanges?: (request: TarsWorkingChangesRequest) => Promise<TarsWorkingChanges>;
  now?: () => string;
}

/** Thrown when the working changes a message asked for cannot be snapshotted; refused with its code. */
class TarsWorkingChangesRejection extends Error {
  readonly reason = "workingChangesUnavailable" as const;
  constructor(cause: unknown) {
    const detail = cause instanceof Error ? cause.message.trim() : "";
    super(`Your working changes could not be snapshotted, so this work was not started.${detail ? ` ${detail}` : ""}`.slice(0, 2_000));
    this.name = "TarsWorkingChangesRejection";
  }
}

function requireDecision(ports: TarsDecisionPorts, messageId: string, expectedRevision: number): TarsMessage {
  const message = ports.conversations.get(messageId);
  if (!message) throw new Error("The message was not found.");
  if (message.revision !== expectedRevision) throw new Error("The message changed. Refresh before applying its decision.");
  if (message.state !== "answered" || !message.decision) throw new Error("The message has no saved decision to apply.");
  return message;
}

/**
 * The run assignment for one work unit. The user's whole message and the unit
 * share the assignment when they fit; a longer message travels as `mandate`,
 * which the run replays as context on every lead turn, so nothing is cut.
 */
export function tarsWorkInstruction(text: string, unit: string): { instruction: string; mandate?: string } {
  // i18n-ignore: model-facing execution context preserving the complete user mandate
  const combined = `Original user mandate:\n${text}\n\nProposed work unit within that mandate:\n${unit}`;
  if (combined.length <= TARS_ASSIGNMENT_MAX_CHARS) return { instruction: combined };
  // i18n-ignore: model-facing execution context
  const pointer = `Original user mandate: attached in full as the "Original user mandate" context.\n\nProposed work unit within that mandate:\n${unit}`;
  if (pointer.length <= TARS_ASSIGNMENT_MAX_CHARS) return { instruction: pointer, mandate: text };
  // A unit near the assignment limit travels in the context too, so a valid proposal is never refused for length.
  // i18n-ignore: model-facing execution context
  return { instruction: "The original user mandate and this work unit's complete instruction are attached as the \"Original user mandate\" context. Follow that work unit.",
    mandate: combined };
}

function boundedError(error: unknown): string {
  return (error instanceof Error ? error.message : "The decision action could not be applied.").slice(0, 2_000).trim() ||
    "The decision action could not be applied.";
}

/** Admits stored proposals into the local queue; it never dispatches work or accepts caller-supplied actions. */
export async function applyTarsDecision(rawInput: unknown, ports: TarsDecisionPorts): Promise<TarsActionReceipt[]> {
  const input = ApplyTarsDecisionInputSchema.parse(rawInput);
  requireDecision(ports, input.messageId, input.expectedRevision);
  await ports.refreshContext?.();
  const message = requireDecision(ports, input.messageId, input.expectedRevision);
  const actions = message.decision!.actions;
  const maxTurns = message.maxTurns;
  const now = ports.now ?? (() => new Date().toISOString());
  const receipts: TarsActionReceipt[] = [];
  // One snapshot per target workspace, so every unit this message admits there starts from the same tree.
  const snapshots = new Map<string, Promise<TarsWorkingChanges>>();
  /**
   * Taken before the synchronous transaction that admits the unit: Git I/O
   * cannot run inside it. The snapshot's ref makes a retried admission reuse
   * the same commit, so the unit's request hash stays the same.
   */
  const workingChangesFor = (workspaceId: string): Promise<TarsWorkingChanges> => {
    let pending = snapshots.get(workspaceId);
    if (!pending) {
      pending = (async () => {
        if (!ports.snapshotWorkingChanges) throw new Error("This host cannot snapshot working changes.");
        const target = resolveTarsWorkspace(workspaceId, ports.readRegistry());
        return ports.snapshotWorkingChanges({ workspaceId: target.workspaceId, repositoryPath: target.repositoryPath,
          messageId: message.id, date: message.updatedAt });
      })();
      snapshots.set(workspaceId, pending);
    }
    return pending;
  };
  try {
    for (const [index, action] of actions.entries()) {
      const intent = ports.conversations.recordReceipt(message.id, message.revision, index, action, now());
      if (intent.status !== "pending") { receipts.push(intent); continue; }
      // A follow-up Tars started by itself carries no user mandate: it may only ask.
      if (message.origin?.kind === "reask" && action.kind !== "ask") {
        receipts.push(ports.conversations.settleReceipt(message.id, index, intent.revision,
          { status: "rejected", error: "An automatic follow-up can only ask the user; it cannot act." }, now()));
        continue;
      }
      // Checked at admission, so work taken over, paused or ended while the planner ran is refused too.
      const refusal = message.origin?.kind === "followUp" ? tarsFollowUpRefusal(action, message.origin, ports.responsibilities) : null;
      if (refusal) {
        receipts.push(ports.conversations.settleReceipt(message.id, index, intent.revision,
          { status: "rejected", error: refusal, reason: "notByFollowUp" }, now()));
        continue;
      }
      if (action.kind === "ask") {
        // A question grants nothing: it waits for the user's answer, which takes the click path.
        // An option that could never apply is refused now, with its reason, instead of a dead button.
        let rejection: ReturnType<typeof tarsControlRejection> | null = null;
        for (const option of action.options) {
          if (option.effect.kind !== "control") continue;
          try { admitTarsControl(ports.responsibilities.get(option.effect.responsibilityId), option.effect); }
          catch (error) { rejection = tarsControlRejection(error); break; }
        }
        receipts.push(ports.conversations.settleReceipt(message.id, index, intent.revision,
          rejection ? { status: "rejected", ...rejection } : { status: "proposed" }, now()));
        continue;
      }
      if (action.kind === "show") {
        // View-only: it opens the side view and changes no work, so it needs only a
        // responsibility Tars holds for the user. Anything else is refused with that reason.
        const owned = ports.responsibilities.get(action.responsibilityId);
        receipts.push(ports.conversations.settleReceipt(message.id, index, intent.revision, owned
          ? { status: "applied", responsibilityId: owned.id }
          : { status: "rejected", error: "The responsibility is not owned by the personal representative.", reason: "notOwned" }, now()));
        continue;
      }
      if (action.kind === "publish") {
        // Publishing is never applied from words: the proposal waits for the user's
        // confirmation on its card, which takes the host's publish path and checks
        // the workspace and GitHub again. Work that could never publish is refused now.
        const refusal = tarsPublishProposalRefusal(ports.responsibilities.get(action.responsibilityId), action);
        receipts.push(ports.conversations.settleReceipt(message.id, index, intent.revision,
          refusal ? { status: "rejected", ...refusal } : { status: "proposed" }, now()));
        continue;
      }
      if (action.kind === "control" && TARS_CONFIRMED_OPERATIONS.has(action.operation)) {
        // Model text is untrusted: returning authority or ending work waits for the
        // user's confirming click, which takes the click path. An inadmissible
        // proposal is refused now, with its reason, instead of offering a dead button.
        let rejection: ReturnType<typeof tarsControlRejection> | null = null;
        try { admitTarsControl(ports.responsibilities.get(action.responsibilityId), action); }
        catch (error) { rejection = tarsControlRejection(error); }
        receipts.push(ports.conversations.settleReceipt(message.id, index, intent.revision,
          rejection ? { status: "rejected", ...rejection } : { status: "proposed" }, now()));
        continue;
      }
      if (action.kind === "control") {
        // Words take the same admission, run control and atomic outcome as a click.
        receipts.push(await ports.control(action, {
          key: `message:${message.id}:${index}`,
          settled: () => {
            const receipt = ports.conversations.getReceipt(message.id, index);
            return receipt && receipt.status !== "pending" ? receipt : null;
          },
          apply: (effect) => ports.conversations.applyReceipt(message.id, index, intent.revision, () => {
            requireDecision(ports, message.id, message.revision);
            effect();
            return { responsibilityId: action.responsibilityId };
          }, now()),
          reject: ({ reason, error }) => ports.conversations.settleReceipt(message.id, index, intent.revision,
            { status: "rejected", error, reason }, now()),
        }));
        continue;
      }
      try {
        let workingChanges: TarsWorkingChanges | undefined;
        if (action.kind === "delegate" && message.includeWorkingChanges) {
          try { workingChanges = await workingChangesFor(action.workspaceId); }
          catch (error) { throw new TarsWorkingChangesRejection(error); }
        }
        receipts.push(ports.conversations.applyReceipt(message.id, index, intent.revision, () => {
          // Recheck admission inside the transaction that writes both effect and receipt.
          const admitted = requireDecision(ports, message.id, message.revision);
          if (action.kind === "delegate") {
            const target = resolveTarsWorkspace(action.workspaceId, ports.readRegistry());
            const execution = tarsExecutionTarget(admitted);
            let agentId: string | undefined;
            if (action.agentId) {
              // Revoking an agent in settings wins over the copy saved with the message.
              const current = new Set(ports.conversations.getSettings()?.allowedAgentIds ?? []);
              const agents = ports.agents?.() ?? [];
              assertTarsAgentCatalog({ agentId: action.agentId, agents, ready: ports.agentCatalogReady?.() ?? true });
              agentId = admitTarsAgent({ agentId: action.agentId, agents, executionProviderId: execution.providerId, executionModel: execution.model,
                allowedAgentIds: (admitted.allowedAgentIds ?? []).filter((id) => current.has(id)),
                ceiling: tarsDelegationCeiling(agents) }).id;
            }
            const requestId = `tars-message:${message.id}:${index}`;
            const { instruction, mandate } = tarsWorkInstruction(admitted.text, action.instruction);
            const row = ports.responsibilities.create({
              requestId,
              title: action.title, instruction, acceptanceCriteria: action.acceptanceCriteria, priority: action.priority,
              workspaceId: target.workspaceId, repositoryPath: target.repositoryPath,
              // Every work unit gets the whole saved turn limit; the message's unit count is bounded by the decision schema.
              providerId: execution.providerId, model: execution.model, maxTurns,
              branchName: buildTarsBranchName({ proposed: action.branchName, title: action.title, requestId }),
              ...(mandate ? { mandate } : {}),
              ...(admitted.runtimeHints ? { runtimeHints: admitted.runtimeHints } : {}),
              ...(agentId ? { agentId } : {}),
              ...(workingChanges ? { workingChanges } : {}),
            }, now());
            return { responsibilityId: row.id };
          }
          // The same admission as a click or drag in the tray (`tars-queue.ts`); words set the priority itself.
          const row = admitTarsReprioritize(ports.responsibilities.get(action.responsibilityId), action, ports.readRegistry());
          return { responsibilityId: ports.responsibilities.patch(row.id, action.expectedRevision,
            { priority: action.priority }, now()).id };
        }, now()));
      } catch (error) {
        // A lock wait that outlasted busy_timeout changed nothing and is not a
        // verdict on the action: keep the intent pending for the next attempt.
        if (isTarsStorageBusy(error)) throw error;
        // An unsynced catalog is not a verdict either: the intent waits for the saved agents.
        if (isTarsAgentCatalogPending(error)) throw error;
        // applyReceipt rolls back the local effect with the receipt. A rejection
        // therefore records a known unapplied action, never an uncertain external write.
        receipts.push(ports.conversations.settleReceipt(message.id, index, intent.revision,
          { status: "rejected", error: boundedError(error),
            ...(error instanceof TarsDelegateRejection || error instanceof TarsWorkingChangesRejection || error instanceof TarsControlRejection
              ? { reason: error.reason } : {}) }, now()));
      }
    }
    return receipts;
  } catch (error) {
    // The fixed message lets main tell a retryable lock failure from a failed admission.
    throw isTarsStorageBusy(error) ? new TarsStorageBusyError() : error;
  } finally {
    // Retried applied receipts also wake the queue after a lost acknowledgement.
    // An opened view changes no work, so it never wakes the queue.
    if (receipts.some((receipt) => receipt.status === "applied" && receipt.action.kind !== "show")) ports.requestTick();
  }
}
