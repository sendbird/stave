/**
 * Playbook start conditions and proposed missions.
 *
 * - An issue newly assigned to the user proposes a mission with every playbook
 *   that watches for one (issues assigned before the condition was set never do).
 * - Failing checks or requested changes on a workspace's pull request propose
 *   one, once per head commit — or start it, when the playbook auto-starts.
 *   At most one starts per pull request; a workspace another mission works in
 *   is deferred, and the renderer sends it again later.
 * - A schedule proposes one in its workspace at each slot — or starts it, when
 *   the playbook auto-starts and the slot is not long past; a triage
 *   playbook's turns then call `stave_propose_mission` for the requests they
 *   find.
 *
 * Every occurrence is recorded before any side effect, so a restart never
 * proposes or starts it twice. Auto-start runs only where a workspace is known
 * and the first stage publishes nothing, with no external effect authorized.
 *
 * Used by: `electron/host-service.ts` (`proposal.invoke`).
 */
import { randomUUID } from "node:crypto";
import type { MissionDetail } from "../../../src/lib/missions/api";
import { currentStageRecord, isActiveMissionState, type MissionStartInput } from "../../../src/lib/missions/domain";
import {
  ProposeMissionToolInputSchema,
  pullRequestTroubles,
  type ObservedPullRequest,
  type ProposalListFilter,
  type ProposedMission,
} from "../../../src/lib/missions/proposed";
import { DEFAULT_PLAYBOOK_PERMISSION_MODE, playbookCanAutoStart, type Playbook } from "../../../src/lib/playbooks/schema";
import { createPlaybookFromStarter, PLAYBOOK_STARTERS } from "../../../src/lib/playbooks/starters";
import { issueMatchesFilter, type ObservedIssue } from "../../../src/lib/projects/policy";
import { latestScheduleSlot, SCHEDULE_LABELS } from "../../../src/lib/schedules";
import type { MissionStore } from "../../persistence/mission-store";

const DEFAULT_TICK_MS = 60_000;
const DEFAULT_TRIAGE_PLAYBOOK = "request-to-pr";
/** A slot this far past (the computer slept through it) is proposed, never started late. */
const MIN_LATE_START_MS = 10 * 60_000;
const DAY_MS = 24 * 60 * 60_000;
/** Decided proposals stay in "Decided recently" this long. */
const DECIDED_RETENTION_MS = 30 * DAY_MS;
/** Seen schedule slots and pull request commits are remembered this long. */
const SEEN_RETENTION_MS = 90 * DAY_MS;

export type HostProposalAction = "list" | "dismiss" | "mark-started" | "observe-issues" | "observe-pull-request" | "issue-demand" | "propose-for-grant";

export interface ProposalRuntimeDependencies {
  store: Pick<
    MissionStore,
    | "insertProposal"
    | "updateProposal"
    | "getProposal"
    | "listProposals"
    | "markTriggersSeen"
    | "pruneProposalHistory"
    | "listMissionsForWorkspace"
    | "getAggregate"
  >;
  startMission: (input: MissionStartInput) => Promise<MissionDetail>;
  createIdleTask: (args: {
    workspaceId: string;
    title: string;
    provider: "claude-code" | "codex";
    model?: string | null;
  }) => Promise<{ taskId: string }>;
  /** The mission stage a triage turn's grant belongs to, or null once the turn ended. */
  resolveMissionGrant: (missionKey: string) => { missionId: string; taskId: string; stageId: string; attempt: number } | null;
  /** The repository a workspace belongs to, so Start can open it; null when unknown. */
  resolveWorkspaceRepository?: (workspaceId: string) => Promise<string | null>;
  emitChanged?: () => void;
  now?: () => Date;
  setInterval?: typeof globalThis.setInterval;
  clearInterval?: typeof globalThis.clearInterval;
  tickIntervalMs?: number;
}

export interface ProposalRuntime {
  start: () => void;
  stop: () => void;
  requestTick: () => Promise<void>;
  /** The user's saved playbooks, as the renderer syncs them. */
  setPlaybooks: (playbooks: readonly Playbook[]) => void;
  list: (args?: { state?: ProposalListFilter; limit?: number }) => Promise<{ proposals: ProposedMission[] }>;
  dismiss: (args: { id: string }) => Promise<ProposedMission>;
  markStarted: (args: { id: string; missionId?: string | null }) => Promise<ProposedMission>;
  observeIssues: (args: { items: readonly ObservedIssue[] }) => Promise<{ proposed: number }>;
  observePullRequest: (args: {
    workspaceId: string;
    workspaceName: string;
    pr: ObservedPullRequest;
  }) => Promise<{ proposed: number; started: number; deferred: boolean }>;
  /** Whether any playbook watches for assigned issues, so Issues stays fresh in the background. */
  issueDemand: () => Promise<{ watching: boolean }>;
  proposeForGrant: (args: { missionKey: string; input: unknown }) => Promise<{ state: ProposedMission["state"]; message: string }>;
}

export class ProposalCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProposalCommandError";
  }
}

function refuse(message: string): never {
  throw new ProposalCommandError(message);
}

/** Auto-start is the user's choice, and only for a playbook whose first stage publishes nothing. */
function canAutoStart(playbook: Playbook): boolean {
  return Boolean(playbook.startsWhen?.autoStart) && playbookCanAutoStart(playbook);
}

function missionProvider(playbook: Playbook): "claude-code" | "codex" {
  return playbook.runtime?.providerId === "codex" ? "codex" : "claude-code";
}

export function createProposalRuntime(deps: ProposalRuntimeDependencies): ProposalRuntime {
  const { store } = deps;
  const now = deps.now ?? (() => new Date());
  const setIntervalImpl = deps.setInterval ?? globalThis.setInterval;
  const clearIntervalImpl = deps.clearInterval ?? globalThis.clearInterval;
  let timer: ReturnType<typeof globalThis.setInterval> | null = null;
  let chain = Promise.resolve();
  let playbooks: Playbook[] = [];
  /** Slots before this passed while Stave was closed: proposed, never started late. */
  let openedAt = now();
  const tickMs = deps.tickIntervalMs ?? DEFAULT_TICK_MS;
  const lateAfterMs = Math.max(2 * tickMs, MIN_LATE_START_MS);

  function enqueue<T>(work: () => Promise<T>): Promise<T> {
    const next = chain.then(work, work);
    chain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  function emit() {
    try {
      deps.emitChanged?.();
    } catch (error) {
      console.warn("[proposals] failed to announce a change", error);
    }
  }

  function resolvePlaybook(id: string): Playbook | null {
    const saved = playbooks.find((playbook) => playbook.id === id);
    if (saved) return saved;
    const starter = PLAYBOOK_STARTERS.find((candidate) => candidate.id === id);
    return starter ? createPlaybookFromStarter(starter, { now: now(), id: `starter_${starter.id}` }) : null;
  }

  function draft(playbook: Playbook, patch: Partial<ProposedMission> & Pick<ProposedMission, "sourceKey" | "source" | "title" | "assignment">): ProposedMission {
    const at = now().toISOString();
    return {
      id: randomUUID(),
      detail: null,
      url: null,
      playbookId: playbook.id,
      playbookName: playbook.name,
      workspaceId: null,
      workspaceName: null,
      issue: null,
      proposedByMissionId: null,
      state: "pending",
      missionId: null,
      createdAt: at,
      updatedAt: at,
      ...patch,
    };
  }

  async function resolveRepository(workspaceId: string): Promise<string | null> {
    try {
      return (await deps.resolveWorkspaceRepository?.(workspaceId)) ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Starts the playbook on a new task in the workspace. A failure leaves it
   * proposed, with the reason and that task, so Start reuses the task.
   */
  async function autoStart(proposal: ProposedMission, playbook: Playbook): Promise<ProposedMission> {
    let taskId: string | null = null;
    try {
      ({ taskId } = await deps.createIdleTask({
        workspaceId: proposal.workspaceId!,
        title: proposal.title.slice(0, 60),
        provider: missionProvider(playbook),
        model: playbook.runtime?.model ?? null,
      }));
      const detail = await deps.startMission({
        workspaceId: proposal.workspaceId!,
        leadTaskId: taskId,
        playbook,
        assignment: proposal.assignment,
        // Auto-start consents to nothing outside this machine: those stages ask.
        consent: {
          checkIns: playbook.checkIns,
          permissionMode: playbook.runtime?.permissionMode ?? DEFAULT_PLAYBOOK_PERMISSION_MODE,
          authorizedEffectStageIds: [],
        },
      });
      return { ...proposal, state: "started", missionId: detail.mission.id, updatedAt: now().toISOString() };
    } catch (error) {
      const reason = error instanceof Error && error.message ? error.message : "The mission could not start.";
      return {
        ...proposal,
        taskId,
        detail: `Could not start on its own: ${reason}`.slice(0, 500),
        updatedAt: now().toISOString(),
      };
    }
  }

  /**
   * Records a proposal for an occurrence not seen before, then starts it when
   * `start` allows it at that moment.
   */
  async function propose(
    proposal: ProposedMission,
    playbook: Playbook,
    start: () => boolean = () => false,
  ): Promise<"proposed" | "started" | "seen"> {
    if (store.markTriggersSeen([proposal.sourceKey], now()).length === 0) return "seen";
    const placed = proposal.workspaceId ? { ...proposal, repositoryPath: await resolveRepository(proposal.workspaceId) } : proposal;
    // Recorded before any side effect, so a restart never starts it twice.
    if (!store.insertProposal(placed)) return "seen";
    if (!start()) return "proposed";
    const next = await autoStart(placed, playbook);
    store.updateProposal(next);
    return next.state === "started" ? "started" : "proposed";
  }

  /** A workspace a mission already works in — its own or a project's — is left alone. */
  function workspaceBusy(workspaceId: string): boolean {
    return store
      .listMissionsForWorkspace(workspaceId, 20)
      .some((mission) => isActiveMissionState(mission.state) || mission.projectId !== null);
  }

  /** Why a slot is proposed rather than started: Stave was closed, or the computer slept through it. */
  function missedReason(slot: Date): string | null {
    if (slot.getTime() < openedAt.getTime()) return "missed while Stave was closed";
    if (now().getTime() - slot.getTime() > lateAfterMs) return "missed while this computer was asleep";
    return null;
  }

  function pruneHistory() {
    try {
      const at = now().getTime();
      store.pruneProposalHistory({ decidedBefore: new Date(at - DECIDED_RETENTION_MS), seenBefore: new Date(at - SEEN_RETENTION_MS) });
    } catch (error) {
      console.warn("[proposals] failed to prune old proposals", error);
    }
  }

  async function tick() {
    /** One mission starts per workspace per tick, however many schedules share the slot. */
    const startedIn = new Set<string>();
    for (const playbook of playbooks) {
      const schedule = playbook.startsWhen?.schedule;
      if (!schedule || schedule.schedule === "off") continue;
      const slot = latestScheduleSlot(schedule.schedule, now());
      if (!slot || slot.getTime() <= Date.parse(schedule.since)) continue;
      const when = slot.toLocaleString("en-US", { weekday: "short", hour: "2-digit", minute: "2-digit" });
      const missed = missedReason(slot);
      const { workspaceId } = schedule;
      const proposal = draft(playbook, {
        sourceKey: `schedule:${playbook.id}:${slot.toISOString()}`,
        source: "schedule",
        title: `${playbook.name} · ${when}`,
        detail: missed ? `${SCHEDULE_LABELS[schedule.schedule]} · ${missed}` : SCHEDULE_LABELS[schedule.schedule],
        assignment: `${playbook.purpose}\n\nScheduled run (${SCHEDULE_LABELS[schedule.schedule]}, ${when}).`,
        workspaceId,
        workspaceName: schedule.workspaceName || null,
      });
      const outcome = await propose(
        proposal,
        playbook,
        () => !missed && canAutoStart(playbook) && !startedIn.has(workspaceId) && !workspaceBusy(workspaceId),
      );
      if (outcome === "started") startedIn.add(workspaceId);
      if (outcome !== "seen") emit();
    }
  }

  const runtime: ProposalRuntime = {
    start() {
      openedAt = now();
      pruneHistory();
      timer = setIntervalImpl(() => void runtime.requestTick(), tickMs);
      void runtime.requestTick();
    },
    stop() {
      if (timer) clearIntervalImpl(timer);
      timer = null;
    },
    requestTick: () => enqueue(tick),
    setPlaybooks(next) {
      playbooks = [...next];
    },
    list: async ({ state, limit } = {}) => ({ proposals: store.listProposals({ state, limit }) }),
    dismiss: ({ id }) =>
      enqueue(async () => {
        const proposal = store.getProposal(id) ?? refuse("The proposal was not found.");
        if (proposal.state !== "pending") refuse("This proposal was already decided.");
        const next = { ...proposal, state: "dismissed" as const, updatedAt: now().toISOString() };
        store.updateProposal(next);
        emit();
        return next;
      }),
    markStarted: ({ id, missionId }) =>
      enqueue(async () => {
        const proposal = store.getProposal(id) ?? refuse("The proposal was not found.");
        const next = { ...proposal, state: "started" as const, missionId: missionId ?? proposal.missionId, updatedAt: now().toISOString() };
        store.updateProposal(next);
        emit();
        return next;
      }),

    observeIssues: ({ items }) =>
      enqueue(async () => {
        let proposed = 0;
        // An empty list says nothing yet: no source may have synced.
        if (items.length === 0) return { proposed };
        const sources = [...new Set(items.map((issue) => issue.source))];
        for (const playbook of playbooks) {
          const watch = playbook.startsWhen?.issueAssigned;
          if (!watch) continue;
          const since = Date.parse(watch.since);
          const keyOf = (issue: ObservedIssue) => `issue:${playbook.id}:${issue.source}:${issue.key}`;
          // Once per source and `since`; a changed filter restamps `since`, so it looks afresh too.
          const baselines = new Map(sources.map((source) => [`issues-baseline:${playbook.id}:${watch.since}:${source}`, source]));
          const firstLook = new Set(store.markTriggersSeen([...baselines.keys()], now()).map((key) => baselines.get(key)));
          const createdSince = (issue: ObservedIssue) => Boolean(issue.createdAt) && Date.parse(issue.createdAt!) >= since;
          const fresh = items.filter(
            (issue) => issueMatchesFilter(issue, watch.filter) && (!firstLook.has(issue.source) || createdSince(issue)),
          );
          // A source's first look takes in everything already assigned there, matching the filter or
          // not, so a source that syncs later or a broader filter never floods old issues. Only
          // issues created since are news then; afterwards, any issue not seen before is.
          store.markTriggersSeen(
            items.filter((issue) => firstLook.has(issue.source) && !fresh.includes(issue)).map(keyOf),
            now(),
          );
          for (const issue of fresh) {
            const outcome = await propose(
              draft(playbook, {
                sourceKey: keyOf(issue),
                source: "issue",
                title: `${issue.key} · ${issue.title}`.slice(0, 200),
                detail: "Assigned to you",
                url: issue.url,
                assignment: [issue.title, "", `${issue.key}${issue.url ? `: ${issue.url}` : ""}`].join("\n"),
                issue: { source: issue.source, key: issue.key },
              }),
              playbook,
            );
            if (outcome !== "seen") proposed += 1;
          }
        }
        if (proposed > 0) emit();
        return { proposed };
      }),

    observePullRequest: ({ workspaceId, workspaceName, pr }) =>
      enqueue(async () => {
        let proposed = 0;
        let started = 0;
        const matches = playbooks.flatMap((playbook) => pullRequestTroubles(playbook, pr).map((trouble) => ({ playbook, trouble })));
        if (matches.length === 0) return { proposed, started, deferred: false };
        // Another mission works here: decide nothing now; the renderer sends it again later.
        if (workspaceBusy(workspaceId)) return { proposed, started, deferred: true };
        for (const { playbook, trouble } of matches) {
          const outcome = await propose(
            draft(playbook, {
              sourceKey: `pr:${playbook.id}:${workspaceId}:${trouble.kind}:${pr.headSha ?? "unknown"}`,
              source: "pull-request",
              title: `${pr.title} · #${pr.number}`.slice(0, 200),
              detail: trouble.detail,
              url: pr.url,
              assignment: `${trouble.detail}: ${pr.title}\n${pr.url}`,
              workspaceId,
              workspaceName,
            }),
            playbook,
            // One mission per worktree: the first that may start does; the rest wait as proposals.
            () => started === 0 && canAutoStart(playbook) && !workspaceBusy(workspaceId),
          );
          if (outcome === "proposed") proposed += 1;
          if (outcome === "started") started += 1;
        }
        if (proposed + started > 0) emit();
        return { proposed, started, deferred: false };
      }),

    issueDemand: async () => ({ watching: playbooks.some((playbook) => Boolean(playbook.startsWhen?.issueAssigned)) }),

    proposeForGrant: ({ missionKey, input: raw }) =>
      enqueue(async () => {
        // The stage tools' identity checks: the lead task's turn, on the stage the mission is on now.
        const grant = deps.resolveMissionGrant(missionKey) ?? refuse("Only a mission's turns can propose missions.");
        const aggregate = store.getAggregate(grant.missionId) ?? refuse("The mission was not found.");
        if (aggregate.mission.leadTaskId !== grant.taskId) refuse("Only a mission's turns can propose missions.");
        const stage = currentStageRecord(aggregate);
        if (stage.stageId !== grant.stageId || stage.attempt !== grant.attempt) refuse("The mission has moved on from this turn's stage.");
        const mission = aggregate.mission;
        const input = ProposeMissionToolInputSchema.parse(raw);
        const playbook =
          resolvePlaybook(input.playbookId ?? DEFAULT_TRIAGE_PLAYBOOK) ??
          refuse(`No playbook "${input.playbookId}". Use a saved playbook id or a template id such as request-to-pr.`);
        const key = input.key ?? input.url ?? input.title.toLowerCase().replace(/\s+/g, " ");
        const outcome = await propose(
          draft(playbook, {
            sourceKey: `triage:${key}`.slice(0, 400),
            source: "triage",
            title: input.title,
            detail: `Proposed by ${mission.playbook.name}`,
            url: input.url ?? null,
            assignment: input.assignment,
            proposedByMissionId: mission.id,
          }),
          playbook,
        );
        if (outcome === "seen") return { state: "pending" as const, message: "This request was already proposed; nothing new was added." };
        emit();
        return { state: "pending" as const, message: "Proposed. It waits in Issues → Proposed for the user to start." };
      }),
  };
  return runtime;
}

export async function invokeProposalRuntime(
  runtime: ProposalRuntime,
  action: HostProposalAction,
  args: unknown,
): Promise<{ ok: true; value: unknown } | { ok: false; message: string }> {
  try {
    const value = (args ?? {}) as never;
    switch (action) {
      case "list":
        return { ok: true, value: await runtime.list(value) };
      case "dismiss":
        return { ok: true, value: await runtime.dismiss(value) };
      case "mark-started":
        return { ok: true, value: await runtime.markStarted(value) };
      case "observe-issues":
        return { ok: true, value: await runtime.observeIssues(value) };
      case "observe-pull-request":
        return { ok: true, value: await runtime.observePullRequest(value) };
      case "issue-demand":
        return { ok: true, value: await runtime.issueDemand() };
      case "propose-for-grant":
        return { ok: true, value: await runtime.proposeForGrant(value) };
      default:
        action satisfies never;
        return { ok: false, message: `Unsupported proposal action: ${String(action)}` };
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error && error.message ? error.message : "The request failed." };
  }
}
