import { createHash } from "node:crypto";
import path from "node:path";
import {
  AUTOMATION_RUN_ONCE_PASSED_MESSAGE, createDefaultAutomationRuntime,
  type AutomationRun, type AutomationSpec, type AutomationState, type AutomationUpsertInput,
} from "../../src/lib/automations";
import { tarsExecutionTarget } from "../../src/lib/tars/execution-resources";
import {
  parseTarsScheduleProposalRequestId, resolveTarsScheduleRule, TARS_SCHEDULE_LIST_MAX, TarsScheduleConfirmInputSchema, TarsScheduleListSchema,
  tarsScheduleContentKey, tarsScheduleFallbackCadence, tarsScheduleNextRuns, TarsSchedulePreviewInputSchema, TarsSchedulePreviewSchema, tarsScheduleRuleOf,
  TarsScheduleToggleInputSchema,
  type TarsScheduleAction, type TarsScheduleChange, type TarsScheduleFacts, type TarsScheduleList, type TarsSchedulePreview, type TarsScheduleReason,
  type TarsScheduleRecord, type TarsScheduleResult, type TarsScheduleRule, type TarsScheduleSummary, type TarsScheduleView, type TarsScheduleWorkspace,
} from "../../src/lib/tars/schedules";
import { resolveTarsWorkspace } from "../main/tars-scope";
import { isTarsStorageBusy, TarsStorageBusyError, type TarsConversationStore } from "../persistence/tars-conversation-store";
import type { TarsOwnedSchedule, TarsScheduleStore } from "../persistence/tars-schedule-store";
import type { PersistenceRepositoryRegistryEntry } from "../persistence/types";
import type { AutomationRuntime, AutomationWorkspaceLocation } from "./automation-runtime";

/**
 * The host's one path for schedules Tars sets up. Tars stores and runs
 * nothing itself: a schedule is a start-a-task schedule of the Schedules
 * service (`automation-runtime.ts`), which keeps it, fires it and starts its
 * task with its own guards (a registered workspace, one run at a time, the
 * Guided permission mode). This module admits what the user confirmed on a
 * card, records it by request id so a retry applies nothing twice, and keeps
 * which schedules Tars created: it changes, pauses and removes no others,
 * and none that was edited in Schedules since.
 */

export interface TarsSchedulePorts {
  schedules: TarsScheduleStore;
  conversations: Pick<TarsConversationStore, "getReceipt" | "get" | "getSettings" | "settleScheduleProposal">;
  /** The Schedules service. */
  automations: Pick<AutomationRuntime, "list" | "create" | "update" | "remove" | "setEnabled">;
  /** Must read the current persisted registry on every call. */
  readRegistry: () => PersistenceRepositoryRegistryEntry[];
  /** The workspace as a schedule location (`findAutomationWorkspace`); null when it is not registered or its folder is gone. */
  findWorkspace: (workspaceId: string) => Promise<AutomationWorkspaceLocation | null>;
  now?: () => Date;
  /** This computer's zone by IANA name; tests pass their own. */
  timezone?: () => string;
}

export class TarsScheduleRejection extends Error {
  constructor(readonly reason: TarsScheduleReason, message: string) { super(message); this.name = "TarsScheduleRejection"; }
}

const refuse = (reason: TarsScheduleReason, message: string): never => { throw new TarsScheduleRejection(reason, message); };

/** The permission mode of every schedule Tars saves: Guided, which asks the user before a risky action. */
const TARS_SCHEDULE_TRUST_POLICY = "review-required" as const;

/** A new schedule's id, fixed by the confirmation that creates it, so a retried create finds the first one. */
export function tarsScheduleIdFor(requestId: string) {
  return `tars-${createHash("sha256").update(requestId).digest("hex").slice(0, 32)}`;
}

function contentHash(content: Parameters<typeof tarsScheduleContentKey>[0]) {
  return createHash("sha256").update(tarsScheduleContentKey(content)).digest("hex");
}

function automationContentHash(automation: AutomationSpec) {
  return contentHash({ title: automation.name, request: automation.prompt, workspaceId: automation.environment.workspaceId, rule: tarsScheduleRuleOf(automation),
    trustPolicy: automation.trustPolicy });
}

function systemTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

/** Bounded to the contract; a workspace or repository without a usable name is named by its id or folder. */
function workspaceView(location: AutomationWorkspaceLocation, repositoryName: string): TarsScheduleWorkspace {
  const branch = location.branch?.trim().slice(0, 500);
  return { id: location.workspaceId, name: location.name.trim().slice(0, 200) || location.workspaceId.slice(0, 200), ...(branch ? { branch } : {}),
    repositoryName: repositoryName.trim().slice(0, 200) || path.basename(location.repositoryPath).slice(0, 200) || location.repositoryPath.slice(0, 200) };
}

function mapServiceError(error: unknown): TarsScheduleRejection {
  if (error instanceof TarsScheduleRejection) return error;
  const message = (error instanceof Error ? error.message : "The schedule could not be saved.").slice(0, 2_000).trim() || "The schedule could not be saved.";
  if (message.includes(AUTOMATION_RUN_ONCE_PASSED_MESSAGE)) return new TarsScheduleRejection("pastTime", message);
  if (/^Automation not found/.test(message)) return new TarsScheduleRejection("scheduleGone", "The schedule was removed in Schedules.");
  if (/active run/i.test(message)) return new TarsScheduleRejection("runActive", message);
  if (/belongs to another repository/.test(message)) return new TarsScheduleRejection("unknownWorkspace", message);
  return new TarsScheduleRejection("unknown", message);
}

/**
 * The runs Tars's schedules started, saved as the Schedules service last
 * reported them. Called with every state the service saves; a state without a
 * scheduled run of a Tars schedule reads one small query and writes nothing.
 * Runs started by hand in Schedules are the user's own and are not recorded.
 */
export function recordTarsScheduleRuns(schedules: TarsScheduleStore, state: Pick<AutomationState, "runs">, now: string): number {
  const scheduled = state.runs.filter((run) => run.trigger === "scheduled");
  if (!scheduled.length) return 0;
  const titles = schedules.ownedTitles();
  if (!titles.size) return 0;
  return schedules.saveRuns(scheduled.filter((run) => titles.has(run.automationId)).map((run) => ({
    runId: run.id, scheduleId: run.automationId, title: titles.get(run.automationId)!.slice(0, 120), actor: "schedule" as const, status: run.status,
    scheduledFor: run.scheduledFor, startedAt: run.startedAt, completedAt: run.completedAt, workspaceId: run.workspaceId, repositoryPath: run.repositoryPath, taskId: run.taskId,
    error: run.error ? run.error.slice(0, 2_000) : null,
  })), now);
}

/** What one proposal comes to once read against the saved schedules, the registry and the Schedules service. */
interface Resolved {
  operation: TarsScheduleChange;
  scheduleId: string;
  owned: TarsOwnedSchedule | null;
  automation: AutomationSpec | null;
  current: (TarsScheduleFacts & { enabled: boolean }) | null;
  next: TarsScheduleFacts | null;
  location: AutomationWorkspaceLocation | null;
  repositoryName: string;
  /** For a retried change: the Schedules service already holds exactly this content. */
  alreadySaved: boolean;
  reason: TarsScheduleReason | null;
  error: string | null;
}

export function createTarsScheduler(ports: TarsSchedulePorts) {
  const now = ports.now ?? (() => new Date());
  const timezone = ports.timezone ?? systemTimezone;
  // One change per request id at a time; a repeated request joins the running one.
  const inflight = new Map<string, Promise<TarsScheduleResult>>();

  function repositoryNameOf(repositoryPath: string) {
    const resolved = path.resolve(repositoryPath);
    return ports.readRegistry().find((repository) => path.resolve(repository.repositoryPath) === resolved)?.repositoryName ?? "";
  }

  /** The workspace runs start in, checked against the registry and the folder on disk. */
  async function locate(workspaceId: string): Promise<{ location: AutomationWorkspaceLocation; repositoryName: string }> {
    let repositoryPath: string;
    try { repositoryPath = resolveTarsWorkspace(workspaceId, ports.readRegistry()).repositoryPath; }
    catch { return refuse("unknownWorkspace", "The workspace is not registered in Stave."); }
    const location = await ports.findWorkspace(workspaceId).catch(() => null);
    if (!location || path.resolve(location.repositoryPath) !== path.resolve(repositoryPath))
      return refuse("unknownWorkspace", "The workspace, or its folder, is no longer available.");
    return { location, repositoryName: repositoryNameOf(repositoryPath) };
  }

  /** A workspace as it is now, for showing a saved schedule; null when it is gone. */
  async function locateSaved(workspaceId: string) {
    try { return await locate(workspaceId); } catch { return null; }
  }

  async function factsOf(automation: AutomationSpec): Promise<{ facts: TarsScheduleFacts & { enabled: boolean }; location: AutomationWorkspaceLocation | null; repositoryName: string }> {
    const located = await locateSaved(automation.environment.workspaceId);
    return {
      facts: { title: automation.name.slice(0, 120), request: automation.prompt, rule: tarsScheduleRuleOf(automation), enabled: automation.enabled,
        workspace: located ? workspaceView(located.location, located.repositoryName) : null },
      location: located?.location ?? null, repositoryName: located?.repositoryName ?? "",
    };
  }

  /**
   * Reads one proposal against what is saved now. Nothing here is taken from
   * the renderer: the action is the saved proposal's, the schedule is the
   * Schedules service's, and ownership is Tars's own record.
   */
  async function resolve(action: TarsScheduleAction, requestId: string, at: Date): Promise<Resolved> {
    const operation = action.operation as TarsScheduleChange;
    const base: Resolved = { operation, scheduleId: operation === "create" ? tarsScheduleIdFor(requestId) : action.scheduleId!, owned: null, automation: null,
      current: null, next: null, location: null, repositoryName: "", alreadySaved: false, reason: null, error: null };
    const stop = (reason: TarsScheduleReason, error: string) => { base.reason ??= reason; base.error ??= error; return base; };
    const { automations } = await ports.automations.list();
    try {
      if (operation === "create") {
        const located = await locate(action.workspaceId!);
        base.location = located.location; base.repositoryName = located.repositoryName;
        // A retried create whose schedule already exists is read as it was saved, so a time that has passed since does not refuse it.
        const existing = automations.find((automation) => automation.id === base.scheduleId) ?? null;
        base.automation = existing;
        base.alreadySaved = existing !== null;
        const rule = existing ? { ok: true as const, rule: tarsScheduleRuleOf(existing) } : resolveTarsScheduleRule(action.when!, at);
        if (!rule.ok) return stop(rule.reason, rule.error);
        base.next = { title: action.title!, request: action.request!, workspace: workspaceView(located.location, located.repositoryName), rule: rule.rule };
        return base;
      }
      const owned = ports.schedules.getOwned(base.scheduleId);
      // A schedule the user made in Schedules, or an id nobody made, is not Tars's to touch.
      if (!owned) return stop("notTarsSchedule", "Tars did not create this schedule. Change it in Schedules.");
      base.owned = owned;
      const automation = owned.state === "active" ? automations.find((candidate) => candidate.id === owned.id) ?? null : null;
      if (!automation) {
        if (owned.state === "active") ports.schedules.markRemoved(owned.id, at.toISOString());
        return stop("scheduleGone", "This schedule was removed. Ask for a new one if you still want it.");
      }
      base.automation = automation;
      const current = await factsOf(automation);
      base.current = current.facts; base.location = current.location; base.repositoryName = current.repositoryName;
      let next: TarsScheduleFacts = { title: current.facts.title, request: current.facts.request, workspace: current.facts.workspace, rule: current.facts.rule };
      if (operation === "update") {
        if (action.workspaceId && action.workspaceId !== automation.environment.workspaceId) {
          const located = await locate(action.workspaceId);
          base.location = located.location; base.repositoryName = located.repositoryName;
          next = { ...next, workspace: workspaceView(located.location, located.repositoryName) };
        }
        // An unchanged one-time rule keeps its instant; only a new rule is read against the clock.
        const rule = action.when ? resolveTarsScheduleRule(action.when, at) : null;
        next = { ...next, ...(action.title ? { title: action.title } : {}), ...(action.request ? { request: action.request } : {}) };
        if (rule && !rule.ok) { base.next = next; return stop(rule.reason, rule.error); }
        if (rule?.ok) next = { ...next, rule: rule.rule };
        // A change that was saved before its record settled (an interrupted confirmation) reads as already there, not as an edit made elsewhere.
        const target = contentHash({ title: next.title, request: next.request, workspaceId: next.workspace?.id ?? automation.environment.workspaceId, rule: next.rule,
          trustPolicy: TARS_SCHEDULE_TRUST_POLICY });
        base.alreadySaved = automationContentHash(automation) === target && target !== owned.contentHash;
      }
      base.next = next;
      // Changed in Schedules since Tars last set it: it is the user's now.
      if (!base.alreadySaved && automationContentHash(automation) !== owned.contentHash)
        return stop("editedElsewhere", "This schedule was changed in Schedules since Tars set it. Change it there.");
      if (!next.workspace && operation !== "remove" && operation !== "pause")
        return stop("unknownWorkspace", "The schedule's workspace, or its folder, is no longer available.");
      if (operation === "pause" && !automation.enabled) return stop("alreadyPaused", "The schedule is already paused.");
      if (operation === "resume" && automation.enabled) return stop("alreadyOn", "The schedule is already on.");
      if (operation === "resume" && next.rule.kind === "once" && Date.parse(next.rule.runAt) <= at.getTime())
        return stop("pastTime", "This one-time schedule's time has already passed.");
      return base;
    } catch (error) {
      const rejection = mapServiceError(error);
      return stop(rejection.reason, rejection.message);
    }
  }

  /** The proposal a request id names, as saved; nothing else names what a confirmation applies. */
  function proposalOf(requestId: string) {
    const ref = parseTarsScheduleProposalRequestId(requestId);
    const receipt = ref ? ports.conversations.getReceipt(ref.messageId, ref.actionIndex) : null;
    if (!ref || receipt?.action.kind !== "schedule" || receipt.action.operation === "list") throw new Error("This request does not name a schedule proposal.");
    return { ref, receipt, action: receipt.action };
  }

  /** The Schedules service's spec for a schedule Tars saves: Guided permissions, one run at a time. */
  function automationInput(args: { next: TarsScheduleFacts; location: AutomationWorkspaceLocation; repositoryName: string; enabled: boolean;
    current: AutomationSpec | null; messageId: string | null }): AutomationUpsertInput {
    const { next, location, current } = args;
    let runtime = current?.runtime;
    if (!runtime) {
      // The execution model the user chose for Tars's own work, else the conversation's provider on its default model.
      const settings = ports.conversations.getSettings() ?? (args.messageId ? ports.conversations.get(args.messageId) : null);
      const target = settings ? tarsExecutionTarget(settings) : { providerId: "claude-code" as const, model: null };
      const defaults = createDefaultAutomationRuntime(target.providerId);
      runtime = target.model ? { ...defaults, model: target.model } : defaults;
    }
    return {
      name: next.title, prompt: next.request, enabled: args.enabled,
      schedule: next.rule.kind === "recurring" ? next.rule.schedule : tarsScheduleFallbackCadence(next.rule.runAt),
      ...(next.rule.kind === "once" ? { runOnceAt: next.rule.runAt } : {}),
      environment: { kind: "repository", workspaceId: location.workspaceId, path: location.path, repositoryPath: location.repositoryPath,
        label: args.repositoryName.trim() || path.basename(location.repositoryPath) || location.repositoryPath },
      runtime,
      // A schedule Tars saves never runs unattended: its runs ask before a risky action, as a Guided schedule does.
      // One the user made unattended in Schedules reads as edited elsewhere and never reaches this point.
      trustPolicy: TARS_SCHEDULE_TRUST_POLICY,
      maxConcurrentRuns: current?.maxConcurrentRuns ?? 1,
      informationReferences: current && current.environment.workspaceId === location.workspaceId ? current.informationReferences : [],
    };
  }

  function summaryOf(facts: TarsScheduleFacts, enabled: boolean, at: Date): TarsScheduleSummary {
    return { title: facts.title, workspace: facts.workspace, rule: facts.rule, timezone: timezone(), enabled, nextRuns: enabled ? tarsScheduleNextRuns(facts.rule, at) : [] };
  }

  function ownedOf(automation: AutomationSpec, requestId: string, at: string, previous: TarsOwnedSchedule | null): TarsOwnedSchedule {
    return { id: automation.id, requestId: previous?.requestId ?? requestId, title: automation.name.slice(0, 120), workspaceId: automation.environment.workspaceId,
      repositoryPath: automation.environment.repositoryPath, rule: tarsScheduleRuleOf(automation), timezone: timezone(),
      contentHash: automationContentHash(automation), state: "active", createdAt: previous?.createdAt ?? at, updatedAt: at };
  }

  /** `retry`: the record was saved by an earlier attempt that did not settle, so its effect may already be in the Schedules service. */
  async function apply(record: TarsScheduleRecord, action: TarsScheduleAction | null, retry = false): Promise<TarsScheduleResult> {
    const at = now();
    const stamp = at.toISOString();
    const settleProposal = record.proposal ? (settled: TarsScheduleRecord) => {
      ports.conversations.settleScheduleProposal(record.proposal!, settled.status === "rejected"
        ? { status: "rejected", error: settled.error!, reason: settled.reason! } : { status: "applied" }, stamp);
    } : undefined;
    const reject = (reason: TarsScheduleReason, error: string) =>
      ({ record: ports.schedules.settle(record.requestId, { status: "rejected", reason, error }, stamp, { ...(settleProposal ? { settleProposal } : {}) }) });
    try {
      // A switch has no proposal: it is the same pause or resume, read against the same saved state.
      const resolved = await resolve(action ?? { kind: "schedule", operation: record.operation, scheduleId: record.scheduleId }, record.requestId, at);
      const { operation, owned } = resolved;
      // An interrupted removal already removed it: that is the outcome the user confirmed, not a refusal.
      if (retry && operation === "remove" && resolved.reason === "scheduleGone" && owned)
        return { record: ports.schedules.settle(record.requestId, { status: "applied", summary: { title: owned.title, workspace: null, rule: owned.rule,
          timezone: timezone(), enabled: false, nextRuns: [] } }, stamp, { removed: true, ...(settleProposal ? { settleProposal } : {}) }) };
      if (resolved.reason) return reject(resolved.reason, resolved.error ?? "The schedule change was not applied.");
      if (operation === "remove") {
        // The service drops the schedule and its run history; tasks its runs started stay in their workspaces.
        await ports.automations.remove({ id: resolved.scheduleId });
        return { record: ports.schedules.settle(record.requestId, { status: "applied", summary: summaryOf(resolved.next!, false, at) }, stamp,
          { removed: true, ...(settleProposal ? { settleProposal } : {}) }) };
      }
      let saved: AutomationSpec;
      if (operation === "pause" || operation === "resume") {
        saved = await ports.automations.setEnabled({ id: resolved.scheduleId, enabled: operation === "resume" });
      } else if (resolved.alreadySaved && resolved.automation) {
        saved = resolved.automation;
      } else {
        const input = automationInput({ next: resolved.next!, location: resolved.location!, repositoryName: resolved.repositoryName,
          // A new schedule starts paused unless the user chose to turn it on with it; a change keeps it as it is.
          enabled: operation === "create" ? record.enable === true : resolved.automation!.enabled,
          current: operation === "update" ? resolved.automation : null, messageId: record.proposal?.messageId ?? null });
        saved = operation === "create" ? await ports.automations.create(input, { id: resolved.scheduleId })
          : await ports.automations.update({ id: resolved.scheduleId, input });
      }
      const facts = (await factsOf(saved)).facts;
      return { record: ports.schedules.settle(record.requestId, { status: "applied", summary: summaryOf(facts, saved.enabled, at) }, stamp, {
        // Turning it on or off is not content: the saved hash still names what Tars last wrote.
        ...(operation === "pause" || operation === "resume" ? {} : { owned: ownedOf(saved, record.requestId, stamp, owned) }),
        ...(settleProposal ? { settleProposal } : {}) }) };
    } catch (error) {
      if (isTarsStorageBusy(error)) throw new TarsStorageBusyError();
      const rejection = mapServiceError(error);
      return reject(rejection.reason, rejection.message);
    }
  }

  function join(requestId: string, start: () => Promise<TarsScheduleResult>) {
    const running = inflight.get(requestId);
    if (running) return running;
    const promise = start().finally(() => inflight.delete(requestId));
    inflight.set(requestId, promise);
    return promise;
  }

  return {
    /**
     * Why a model's schedule proposal cannot wait for confirmation, or null:
     * an unreadable rule, a past time, an unknown workspace, or a schedule
     * that is not Tars's to change. Checked when it is proposed, so the user
     * gets the reason instead of a card that cannot be confirmed.
     */
    async proposalRefusal(action: TarsScheduleAction, requestId: string): Promise<{ reason: TarsScheduleReason; error: string } | null> {
      if (action.operation === "list") return null;
      try {
        const resolved = await resolve(action, requestId, now());
        return resolved.reason ? { reason: resolved.reason, error: resolved.error ?? "The schedule change cannot be proposed." } : null;
      } catch (error) {
        if (isTarsStorageBusy(error)) throw new TarsStorageBusyError();
        const rejection = mapServiceError(error);
        return { reason: rejection.reason, error: rejection.message };
      }
    },

    /** What the card shows: read only, so opening a card never creates or changes a schedule. */
    async preview(rawInput: unknown): Promise<TarsSchedulePreview> {
      const { requestId } = TarsSchedulePreviewInputSchema.parse(rawInput);
      const { receipt, action } = proposalOf(requestId);
      const at = now();
      const resolved = await resolve(action, requestId, at);
      const waiting = receipt.status === "proposed";
      const operation = resolved.operation;
      const enabledAfter = operation === "create" ? false : operation === "resume" ? true : operation === "pause" || operation === "remove" ? false : resolved.current?.enabled ?? false;
      return TarsSchedulePreviewSchema.parse({
        requestId, operation, scheduleId: resolved.owned || operation === "create" ? resolved.scheduleId : null,
        reason: waiting ? resolved.reason : "notWaiting", error: waiting ? resolved.error : "This proposal no longer waits for a confirmation.",
        next: resolved.next, current: resolved.current, timezone: timezone(),
        // What the user is agreeing to: when it runs once it is on.
        nextRuns: resolved.next && operation !== "pause" && operation !== "remove" ? tarsScheduleNextRuns(resolved.next.rule, at) : [],
        enabledAfter, canEnableOnCreate: true,
      });
    },

    /**
     * Confirms one card. Recorded first under the proposal's own request id,
     * then admitted and applied once; the same request id again returns the
     * same outcome and creates nothing more.
     */
    async confirm(rawInput: unknown): Promise<TarsScheduleResult> {
      const input = TarsScheduleConfirmInputSchema.parse(rawInput);
      return join(input.requestId, async () => {
        try {
          const { ref, receipt, action } = proposalOf(input.requestId);
          const saved = ports.schedules.getRecord(input.requestId);
          if (saved && saved.status !== "pending") return { record: saved };
          if (!saved && receipt.status !== "proposed") throw new Error("This proposal is not awaiting confirmation.");
          const operation = action.operation as TarsScheduleChange;
          const { record } = ports.schedules.recordRequest({ requestId: input.requestId, source: input.source, operation, proposal: ref,
            scheduleId: operation === "create" ? tarsScheduleIdFor(input.requestId) : action.scheduleId!,
            ...(operation === "create" ? { enable: input.enable === true } : {}) }, now().toISOString());
          if (record.status !== "pending") return { record };
          return await apply(record, action, saved !== null);
        } catch (error) {
          throw isTarsStorageBusy(error) ? new TarsStorageBusyError() : error;
        }
      });
    },

    /** The pause switch of a schedule Tars created: the user's own click, on the same checks and record as a confirmed pause or resume. */
    async toggle(rawInput: unknown): Promise<TarsScheduleResult> {
      const input = TarsScheduleToggleInputSchema.parse(rawInput);
      return join(input.requestId, async () => {
        try {
          const { record, existed } = ports.schedules.recordRequest({ requestId: input.requestId, source: input.source,
            operation: input.paused ? "pause" : "resume", scheduleId: input.scheduleId, proposal: null }, now().toISOString());
          if (record.status !== "pending") return { record };
          return await apply(record, null, existed);
        } catch (error) {
          throw isTarsStorageBusy(error) ? new TarsStorageBusyError() : error;
        }
      });
    },

    /** The schedules Tars created that still exist, as the Schedules service has them now. */
    async list(): Promise<TarsScheduleList> {
      const at = now();
      const snapshot = await ports.automations.list();
      const byId = new Map(snapshot.automations.map((automation) => [automation.id, automation]));
      const latest = new Map<string, AutomationRun>();
      for (const run of snapshot.runs) {
        const known = latest.get(run.automationId);
        if (!known || run.startedAt > known.startedAt) latest.set(run.automationId, run);
      }
      const views: TarsScheduleView[] = [];
      let omitted = 0;
      for (const owned of ports.schedules.listOwned()) {
        const automation = byId.get(owned.id);
        // Removed in Schedules: Tars stops listing it and says so when asked to change it.
        if (!automation) { ports.schedules.markRemoved(owned.id, at.toISOString()); continue; }
        if (views.length >= TARS_SCHEDULE_LIST_MAX) { omitted += 1; continue; }
        const { facts } = await factsOf(automation);
        const run = latest.get(owned.id);
        const { enabled, ...content } = facts;
        views.push({ id: owned.id, ...content, timezone: owned.timezone, enabled,
          nextRuns: enabled ? nextRunsOf(automation, facts.rule, at) : [],
          lastRun: run ? { status: run.status, at: run.completedAt ?? run.startedAt, trigger: run.trigger, taskId: run.taskId, workspaceId: run.workspaceId } : null,
          editedElsewhere: automationContentHash(automation) !== owned.contentHash, createdAt: owned.createdAt });
      }
      return TarsScheduleListSchema.parse({ timezone: timezone(), schedules: views, omitted });
    },

    /**
     * After a restart nothing is in flight: a confirmation interrupted before
     * it settled is applied again under its own request id. A schedule it
     * already created is found by that id, so none is made twice.
     */
    async recover(): Promise<void> {
      for (const record of ports.schedules.listPendingRecords()) {
        if (inflight.has(record.requestId)) continue;
        try {
          const action = record.proposal ? ports.conversations.getReceipt(record.proposal.messageId, record.proposal.actionIndex)?.action : null;
          await join(record.requestId, () => apply(record, action?.kind === "schedule" ? action : null, true));
        } catch (error) { console.error("[tars] a schedule confirmation could not be recovered", error); }
      }
    },
  };

  /** The service's own next run first, so the list never disagrees with Schedules; then the rule's runs after it. */
  function nextRunsOf(automation: AutomationSpec, rule: TarsScheduleRule, at: Date): string[] {
    if (!automation.nextRunAt) return tarsScheduleNextRuns(rule, at);
    const first = new Date(automation.nextRunAt);
    return rule.kind === "once" ? [first.toISOString()] : [first.toISOString(), ...tarsScheduleNextRuns(rule, first, 1)];
  }
}

export type TarsScheduler = ReturnType<typeof createTarsScheduler>;
