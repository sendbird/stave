import { tarsAutoControlLedger } from "./tars-auto-control";
import { tarsDefaultCommitSubject, tarsPublishProposalRequestId, type TarsPublishInput, type TarsPublishResult } from "../../src/lib/tars/publication";
import { applyTarsWorkspace, type TarsWorkspacePorts } from "./tars-workspace";
import { resolveTarsWorkspace } from "../main/tars-scope";
import type { PersistenceRepositoryRegistryEntry } from "../persistence/types";
import { ApplyTarsDecisionInputSchema, ConfirmTarsProposalInputSchema } from "../../src/lib/tars/conversation";
import type { TarsActionReason, TarsActionReceipt, TarsDecisionAction, TarsMessage } from "../../src/lib/tars/conversation";
import {
  matchTarsNeverRules, tarsHasAllowRule, tarsActionDisposition, tarsActionKey, tarsEffectiveAutonomy, tarsRepositoryName,
  TARS_AUTO_EXTEND_MULTIPLIER, type TarsActionOrigin, type TarsNeverRuleMatch,
} from "../../src/lib/tars/autonomy";
import { isTarsWorkProposal, type TarsWorkProposalAction } from "../../src/lib/tars/decisions";
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
import { tarsWorkRequestOf } from "../../src/lib/tars/brief";
import { tarsWorkAttachmentsOf } from "../../src/lib/tars/work-attachments";
import { TARS_ASSIGNMENT_MAX_CHARS, type TarsWorkingChanges } from "../../src/lib/tars/types";
import { tarsFollowUpRefusal } from "./tars-follow-up-admission";
import { tarsPublishProposalRefusal } from "./tars-publish";
import { tarsScheduleProposalRequestId, type TarsScheduleAction, type TarsScheduleReason } from "../../src/lib/tars/schedules";

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
  /**
   * Why a schedule proposal cannot wait for the user's confirmation, or null
   * (`createTarsScheduler().proposalRefusal`). Absent, this host sets up no
   * schedules and every schedule change is refused.
   */
  scheduleRefusal?: (action: TarsScheduleAction, requestId: string) => Promise<{ reason: TarsScheduleReason; error: string } | null>;
  /** Current run budget, read from the host ledger rather than the planner's observation. */
  readRunBudget?: (agentRunId: string) => { maxTurns: number } | null;
  /** The same guarded draft publication path as a confirmed card. */
  publish?: (input: TarsPublishInput) => Promise<TarsPublishResult>;
  workspace?: TarsWorkspacePorts;
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

/**
 * How the host admits one message's actions: the autonomy level and the
 * user's "never do" rules, read from the saved settings on every admission
 * (so a change applies to the next decision without a restart) and combined
 * with the copy the message carries by taking the more careful of the two.
 * Nothing a caller sends chooses the level.
 */
function tarsAdmissionGuard(ports: TarsDecisionPorts, message: TarsMessage) {
  const saved = ports.conversations.getSettings();
  const level = tarsEffectiveAutonomy(saved?.autonomy, message.autonomy);
  const rules = [...new Set([...(saved?.neverDo ?? []), ...(message.neverDo ?? [])])];
  // Origins share bounded run controls; follow-up scope is admitted separately.
  const origin: TarsActionOrigin = message.origin?.kind === "followUp" || message.origin?.kind === "reask" ? "automatic" : "user";
  const subject = (action: TarsDecisionAction, registry?: PersistenceRepositoryRegistryEntry[]) => {
    if (action.kind === "delegate" || action.kind === "workspace") {
      const repository = (registry ?? ports.readRegistry()).find((entry) => entry.workspaces.some((workspace) => workspace.id === action.workspaceId));
      return { repositoryPath: repository?.repositoryPath, repository: repository?.repositoryName || tarsRepositoryName(repository?.repositoryPath),
        branches: [action.kind === "delegate" ? action.branchName : null, repository?.workspaceBranchById?.[action.workspaceId]] };
    }
    const row = "responsibilityId" in action ? ports.responsibilities.get(action.responsibilityId) : null;
    return { repositoryPath: row?.repositoryPath, repository: tarsRepositoryName(row?.repositoryPath), branches: [row?.branchName] };
  };
  return (action: TarsDecisionAction, registry?: PersistenceRepositoryRegistryEntry[]): { confirm: boolean; matches: TarsNeverRuleMatch[] } => {
    // A schedule change is outside the level's table: it always waits for the user's confirmation on its card.
    const key = action.kind === "schedule" ? null : tarsActionKey(action);
    if (!key) return { confirm: true, matches: [] };
    const row = "responsibilityId" in action ? ports.responsibilities.get(action.responsibilityId) : null;
    // Allow rules use an owned responsibility's path. Delegation and workspace edits
    // already default to auto; only never-do rules need their registry subject.
    const target = rules.length ? subject(action, registry) : { repositoryPath: row?.repositoryPath };
    const matches = rules.length ? matchTarsNeverRules(rules, { key, ...target }) : [];
    const run = key === "extend" && row?.agentRunId ? ports.readRunBudget?.(row.agentRunId) : null;
    const context = { allowRules: saved?.allowRules, repositoryPath: target.repositoryPath, responsibility: row, extend: row && run ? { admittedMaxTurns: row.maxTurns, currentMaxTurns: run.maxTurns } : null };
    return { confirm: tarsActionDisposition({ key, level, origin, matches, context }) === "confirm", matches };
  };
}

/** One snapshot per target workspace, so every unit a message admits there starts from the same tree. */
function tarsWorkingChangesReader(ports: TarsDecisionPorts, message: TarsMessage) {
  const snapshots = new Map<string, Promise<TarsWorkingChanges>>();
  /**
   * Taken before the synchronous transaction that admits the unit: Git I/O
   * cannot run inside it. The snapshot's ref makes a retried admission reuse
   * the same commit, so the unit's request hash stays the same.
   */
  return (workspaceId: string, beforeSnapshot?: (registry: PersistenceRepositoryRegistryEntry[]) => void): Promise<TarsWorkingChanges> => {
    let pending = snapshots.get(workspaceId);
    if (!pending) {
      const registry = ports.readRegistry();
      const target = resolveTarsWorkspace(workspaceId, registry);
      // Policy and snapshot scope share this read, but it never grants authority
      // after asynchronous Git I/O: admission reads again inside its transaction.
      beforeSnapshot?.(registry);
      if (!ports.snapshotWorkingChanges) throw new Error("This host cannot snapshot working changes.");
      pending = (async () => {
        return ports.snapshotWorkingChanges!({ workspaceId: target.workspaceId, repositoryPath: target.repositoryPath,
          messageId: message.id, date: message.updatedAt });
      })();
      snapshots.set(workspaceId, pending);
    }
    return pending;
  };
}

/** How one work action's outcome is written: an unheld action settles its pending receipt, a confirmed one its held proposal. */
interface TarsWorkLedger {
  apply(effect: () => { responsibilityId: string }): TarsActionReceipt;
  reject(outcome: { error: string; reason?: TarsActionReason }): TarsActionReceipt;
  propose?(matches: TarsNeverRuleMatch[]): TarsActionReceipt;
}

/** Rolls back admission without an effect when policy requires the user's confirmation. */
class TarsWorkProposalHeld extends Error {
  constructor(readonly matches: TarsNeverRuleMatch[]) { super("The work requires confirmation."); }
}

/**
 * Admits one delegation or priority change, the same way whether it applies
 * at once or after the user confirmed its held proposal: the mandate, the
 * registered target, the agent allowlist and the working-changes snapshot are
 * all checked here, at the moment it takes effect.
 */
async function admitTarsWork(ports: TarsDecisionPorts, message: TarsMessage, index: number, action: Exclude<TarsWorkProposalAction, { kind: "workspace" }>,
  workingChangesFor: ReturnType<typeof tarsWorkingChangesReader>, ledger: TarsWorkLedger, now: () => string,
  guard?: ReturnType<typeof tarsAdmissionGuard>): Promise<TarsActionReceipt> {
  try {
    // Attachment contents are context, never a substitute for the user's written mandate.
    if (action.kind === "delegate" && !message.text.trim()) {
      // i18n-ignore: diagnostic only; the interface translates the typed refusal reason
      throw new TarsDelegateRejection("missingMandate", "Attachments alone do not authorize delegated work.");
    }
    const hold = (registry: PersistenceRepositoryRegistryEntry[]) => {
      const verdict = guard?.(action, registry);
      if (verdict?.confirm) throw new TarsWorkProposalHeld(verdict.matches);
    };
    let workingChanges: TarsWorkingChanges | undefined;
    if (action.kind === "delegate" && message.includeWorkingChanges) {
      try { workingChanges = await workingChangesFor(action.workspaceId, hold); }
      catch (error) { if (error instanceof TarsWorkProposalHeld) throw error; throw new TarsWorkingChangesRejection(error); }
    }
    return ledger.apply(() => {
      // Recheck admission inside the transaction that writes both effect and receipt.
      const admitted = requireDecision(ports, message.id, message.revision);
      const registry = ports.readRegistry();
      if (action.kind === "delegate") {
        const target = resolveTarsWorkspace(action.workspaceId, registry);
        hold(registry);
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
        // A reference to the message's attachments this unit carries; their content stays in the message's row.
        const attachments = tarsWorkAttachmentsOf(admitted, action.attachments);
        const { instruction, mandate } = tarsWorkInstruction(admitted.text, action.instruction);
        const row = ports.responsibilities.create({
          requestId,
          title: action.title, instruction, acceptanceCriteria: action.acceptanceCriteria, priority: action.priority,
          ...(action.completionGoal ? { completionGoal: action.completionGoal } : {}),
          workspaceId: target.workspaceId, repositoryPath: target.repositoryPath,
          // Every work unit gets the whole saved turn limit; the message's unit count is bounded by the decision schema.
          providerId: execution.providerId, model: execution.model, maxTurns: message.maxTurns,
          branchName: buildTarsBranchName({ proposed: action.branchName, title: action.title, requestId }),
          ...(mandate ? { mandate } : {}),
          // Kept apart from the combined assignment, so the request view shows each as it was.
          request: tarsWorkRequestOf(admitted), delegatedInstruction: action.instruction,
          ...(admitted.runtimeHints ? { runtimeHints: admitted.runtimeHints } : {}),
          ...(agentId ? { agentId } : {}),
          ...(workingChanges ? { workingChanges } : {}),
          ...(attachments ? { attachments } : {}),
        }, now());
        return { responsibilityId: row.id };
      }
      // The same admission as a click or drag in the tray (`tars-queue.ts`); words set the priority itself.
      const row = admitTarsReprioritize(ports.responsibilities.get(action.responsibilityId), action, registry);
      hold(registry);
      return { responsibilityId: ports.responsibilities.patch(row.id, action.expectedRevision,
        { priority: action.priority }, now()).id };
    });
  } catch (error) {
    if (error instanceof TarsWorkProposalHeld && ledger.propose) return ledger.propose(error.matches);
    // A lock wait that outlasted busy_timeout changed nothing and is not a
    // verdict on the action: keep the intent pending for the next attempt.
    if (isTarsStorageBusy(error)) throw error;
    // An unsynced catalog is not a verdict either: the intent waits for the saved agents.
    if (isTarsAgentCatalogPending(error)) throw error;
    // The ledger rolls back the local effect with the receipt. A rejection
    // therefore records a known unapplied action, never an uncertain external write.
    return ledger.reject({ error: boundedError(error),
      ...(error instanceof TarsDelegateRejection || error instanceof TarsWorkingChangesRejection || error instanceof TarsControlRejection
        ? { reason: error.reason } : {}) });
  }
}

/**
 * The user's confirmation of a held work proposal. It names the saved receipt
 * only: the action applied is the one saved with the message, admitted again
 * now exactly as an unheld one is. A proposal that already settled is returned
 * as it is, so a repeated confirmation never starts the work twice.
 */
export async function confirmTarsProposal(rawInput: unknown, ports: TarsDecisionPorts): Promise<TarsActionReceipt> {
  const ref = ConfirmTarsProposalInputSchema.parse(rawInput);
  const now = ports.now ?? (() => new Date().toISOString());
  const receipt = ports.conversations.getReceipt(ref.messageId, ref.actionIndex);
  if (!receipt || !isTarsWorkProposal(receipt)) throw new Error("This confirmation does not name a held work proposal.");
  if (receipt.status === "pending") throw new Error("This proposal is not awaiting confirmation.");
  if (receipt.status !== "proposed") return receipt;
  const message = ports.conversations.get(ref.messageId);
  if (message?.state !== "answered" || !message.decision) throw new Error("The message has no saved decision to apply.");
  // Only the user's own message can hold work; an automatic follow-up's was refused when it was made.
  if (message.origin?.kind === "followUp" || message.origin?.kind === "reask") throw new Error("An automatic follow-up cannot start or reorder work.");
  await ports.refreshContext?.();
  let settled: TarsActionReceipt | null = null;
  try {
    if (receipt.action.kind === "workspace") return await applyTarsWorkspace(ports, message, ref.actionIndex, receipt.action, { confirm: false, matches: [] }, true);
    settled = await admitTarsWork(ports, message, ref.actionIndex, receipt.action, tarsWorkingChangesReader(ports, message), {
      apply: (effect) => ports.conversations.applyProposal(ref, effect, now()),
      reject: (outcome) => ports.conversations.rejectProposal(ref, outcome, now()),
    }, now);
    return settled;
  } catch (error) {
    throw isTarsStorageBusy(error) ? new TarsStorageBusyError() : error;
  } finally {
    if (settled?.status === "applied") ports.requestTick();
  }
}

/** Admits stored proposals into the local queue; it never dispatches work or accepts caller-supplied actions. */
export async function applyTarsDecision(rawInput: unknown, ports: TarsDecisionPorts): Promise<TarsActionReceipt[]> {
  const input = ApplyTarsDecisionInputSchema.parse(rawInput);
  requireDecision(ports, input.messageId, input.expectedRevision);
  await ports.refreshContext?.();
  const message = requireDecision(ports, input.messageId, input.expectedRevision);
  const actions = message.decision!.actions;
  const now = ports.now ?? (() => new Date().toISOString());
  const receipts: TarsActionReceipt[] = [];
  const workingChangesFor = tarsWorkingChangesReader(ports, message);
  // The level and rules in force for this admission; read from saved settings, never from the caller.
  const guard = tarsAdmissionGuard(ports, message);
  const proposed = (matches: readonly TarsNeverRuleMatch[]) => ({ status: "proposed" as const, ...(matches.length ? { matchedRules: [...matches] } : {}) });
  try {
    for (const [index, action] of actions.entries()) {
      // Inspections are planner observations only; never enter work admission.
      if (action.kind === "inspect") continue;
      const intent = ports.conversations.recordReceipt(message.id, message.revision, index, action, now());
      if (intent.status !== "pending" && !(intent.status === "proposed" && action.kind === "publish")) { receipts.push(intent); continue; }
      // A follow-up Tars started by itself carries no user mandate: it may only ask.
      if (message.origin?.kind === "reask" && action.kind !== "ask") {
        receipts.push(ports.conversations.settleReceipt(message.id, index, intent.revision,
          { status: "rejected", error: "An automatic follow-up can only ask the user; it cannot act.", reason: "notByFollowUp" }, now()));
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
          if (option.effect.kind === "prReview") {
            rejection = { reason: "runRefused", error: "PR review choices are offered by the host after checks pass." };
            break;
          }
          if (option.effect.kind !== "control") continue;
          try { admitTarsControl(ports.responsibilities.get(option.effect.responsibilityId), option.effect); }
          catch (error) { rejection = tarsControlRejection(error); break; }
        }
        receipts.push(ports.conversations.settleReceipt(message.id, index, intent.revision,
          rejection ? { status: "rejected", ...rejection } : { status: "proposed" }, now()));
        continue;
      }
      if (action.kind === "withdraw") {
        // Closes one of Tars's own waiting decisions, with its receipt, in one transaction. It applies nothing and grants nothing.
        receipts.push(ports.conversations.withdrawDecision(message.id, index, intent.revision, now()));
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
        const requestId = tarsPublishProposalRequestId(message.id, index);
        const pending = ports.conversations.getPublish(requestId);
        // An admitted automatic publish may have advanced its own revision before a lost acknowledgement.
        // Resume that same request; the publisher rechecks ownership, branches and its saved progress.
        if (pending?.source === "automatic" && pending.status === "pending" && ports.publish) {
          await ports.publish({ requestId, responsibilityId: pending.responsibilityId, expectedRevision: pending.expectedRevision,
            commitMessage: pending.commitMessage, title: pending.title, source: "automatic" });
          receipts.push(ports.conversations.getReceipt(message.id, index)!);
          continue;
        }
        const refusal = tarsPublishProposalRefusal(ports.responsibilities.get(action.responsibilityId), action);
        if (intent.status === "pending") ports.conversations.settleReceipt(message.id, index, intent.revision,
          refusal ? { status: "rejected", ...refusal } : proposed(guard(action).matches), now());
        if (!refusal && !guard(action).confirm && ports.publish) await ports.publish({
          requestId, responsibilityId: action.responsibilityId,
          expectedRevision: action.expectedRevision, source: "automatic",
          commitMessage: tarsDefaultCommitSubject(ports.responsibilities.get(action.responsibilityId)!.title),
          title: tarsDefaultCommitSubject(ports.responsibilities.get(action.responsibilityId)!.title),
        });
        receipts.push(ports.conversations.getReceipt(message.id, index)!);
        continue;
      }
      if (action.kind === "clear") {
        // Clearing is never applied from words: the proposal waits for the user's confirmation
        // on its card, which takes the same clear path as the tray and header buttons.
        receipts.push(ports.conversations.settleReceipt(message.id, index, intent.revision, { status: "proposed" }, now()));
        continue;
      }
      if (action.kind === "schedule") {
        // Listing only opens the list beside the conversation: it changes nothing and belongs to no responsibility.
        if (action.operation === "list") {
          receipts.push(ports.conversations.settleReceipt(message.id, index, intent.revision, { status: "applied", responsibilityId: null }, now()));
          continue;
        }
        // A schedule is never created, changed or removed from words: the proposal waits for the user's
        // confirmation on its card, which checks everything again. One that could never apply is refused now.
        const refusal = ports.scheduleRefusal ? await ports.scheduleRefusal(action, tarsScheduleProposalRequestId(message.id, index))
          : { reason: "unknown" as const, error: "This host cannot set up schedules." };
        receipts.push(ports.conversations.settleReceipt(message.id, index, intent.revision,
          refusal ? { status: "rejected", ...refusal } : { status: "proposed" }, now()));
        continue;
      }
      if (action.kind === "delegate" || action.kind === "reprioritize") {
        receipts.push(await admitTarsWork(ports, message, index, action, workingChangesFor, {
          apply: (effect) => ports.conversations.applyReceipt(message.id, index, intent.revision, effect, now()),
          reject: (outcome) => ports.conversations.settleReceipt(message.id, index, intent.revision, { status: "rejected", ...outcome }, now()),
          propose: (matches) => ports.conversations.settleReceipt(message.id, index, intent.revision, proposed(matches), now()),
        }, now, guard));
        continue;
      }
      const held = guard(action);
      if (action.kind === "workspace") {
        receipts.push(await applyTarsWorkspace(ports, message, index, action, held));
        continue;
      }
      if (action.kind === "control" && held.confirm) {
        // Model text is untrusted: returning authority or ending work waits for the
        // user's confirming click, which takes the click path. An inadmissible
        // proposal is refused now, with its reason, instead of offering a dead button.
        // Which controls wait is the autonomy level's table (`tarsActionMode`); no level applies an irreversible one.
        let rejection: ReturnType<typeof tarsControlRejection> | null = null;
        try { admitTarsControl(ports.responsibilities.get(action.responsibilityId), action); }
        catch (error) { rejection = tarsControlRejection(error); }
        receipts.push(ports.conversations.settleReceipt(message.id, index, intent.revision,
          rejection ? { status: "rejected", ...rejection } : proposed(held.matches), now()));
        continue;
      }
      if (action.kind === "control") {
        if (message.origin?.kind === "followUp" && message.origin.reason === "ciFailed" && receipts.some((entry) => entry.action.kind === "control" && entry.action.operation === "message")) {
          receipts.push(ports.conversations.settleReceipt(message.id, index, intent.revision,
            { status: "rejected", reason: "notByFollowUp", error: "Only one CI continuation is allowed per head." }, now()));
          continue;
        }
        // Words take the same admission, run control and atomic outcome as a click.
        const row = ports.responsibilities.get(action.responsibilityId);
        const request = action.operation === "extend" && row && !tarsHasAllowRule("extend", { allowRules: ports.conversations.getSettings()?.allowRules, repositoryPath: row.repositoryPath }) ? { ...action, autoExtendMaxTurns: row.maxTurns * TARS_AUTO_EXTEND_MULTIPLIER } : action;
        receipts.push(await ports.control(request, tarsAutoControlLedger(ports, message.id, index, intent.revision,
          action, now, () => !tarsAdmissionGuard(ports, message)(action).confirm)));
        continue;
      }
    }
    return receipts;
  } catch (error) {
    // The fixed message lets main tell a retryable lock failure from a failed admission.
    throw isTarsStorageBusy(error) ? new TarsStorageBusyError() : error;
  } finally {
    // Retried applied receipts also wake the queue after a lost acknowledgement.
    // An opened view or list changes no work, so it never wakes the queue.
    if (receipts.some((receipt) => receipt.status === "applied" && receipt.action.kind !== "show" && receipt.action.kind !== "schedule" && receipt.action.kind !== "workspace")) ports.requestTick();
  }
}
