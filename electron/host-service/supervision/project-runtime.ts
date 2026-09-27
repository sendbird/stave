/**
 * The project supervisor in the host service. It reads each open project,
 * asks the pure policy (`src/lib/projects/policy.ts`) what to do, and does it:
 * starts approved missions through intake (a new worktree, a task, then the
 * mission), and wakes the coordinator once per batch of mission changes. It
 * also serves the renderer's project commands and the coordinator's tools.
 *
 * Restart safety follows the mission runtime: a start or a wake is recorded,
 * keyed, before it happens, so a restart reports an interrupted start instead
 * of replaying it and never wakes the coordinator twice for the same states.
 *
 * Used by: `electron/host-service/supervision/project-host.ts`.
 */
import { randomUUID } from "node:crypto";
import type { MissionDetail } from "../../../src/lib/missions/api";
import {
  currentStageRecord,
  isActiveMissionState,
  latestStageRecord,
  listExternalEffectStages,
  type MissionAggregate,
  type MissionStartInput,
} from "../../../src/lib/missions/domain";
import type { MissionReport } from "../../../src/lib/missions/report";
import type { MissionUsage } from "../../../src/lib/missions/usage";
import { isProjectMissionModel, PROJECT_MISSION_MODELS } from "../../../src/lib/projects/models";
import type { Playbook } from "../../../src/lib/playbooks/schema";
import { PLAYBOOK_STARTERS, createPlaybookFromStarter } from "../../../src/lib/playbooks/starters";
import type {
  ProjectChangedEvent,
  ProjectDetail,
  ProjectInvokeResult,
  ProjectLibraryItem,
  ProjectMissionView,
} from "../../../src/lib/projects/api";
import {
  buildCoordinatorInstruction,
  buildProjectBriefing,
  coordinatorRuntimeOptions,
  PROJECT_CONTEXT_SOURCE_ID,
  type PlaybookOption,
  type ProjectBriefing,
} from "../../../src/lib/projects/briefing";
import {
  DEFAULT_PROJECT_SETTINGS,
  isOpenProjectState,
  PROJECT_LIMITS,
  ProjectCommandError,
  ProjectCreateInputSchema,
  ProjectSettingsSchema,
  StartMissionToolInputSchema,
  type MissionProposal,
  type MissionProviderId,
  type Project,
  type ProjectMemory,
  type ProjectSettings,
  type ProjectTriggers,
} from "../../../src/lib/projects/domain";
import {
  buildCoordinatorKickoffPrompt,
  buildCoordinatorWakePrompt,
  collectDeliveredStates,
  collectPendingTriggers,
  decideProject,
  issueMatchesFilter,
  issueTrigger,
  latestScheduleSlot,
  pullRequestTriggers,
  SCHEDULE_LABELS,
  type ObservedIssue,
  type ProjectMissionChange,
  type ProjectMissionSnapshot,
  type ProjectPullRequestSignal,
  type SeenTrigger,
} from "../../../src/lib/projects/policy";
import type { CanonicalRetrievedContextPart, ProviderRuntimeOptions } from "../../../src/lib/providers/provider.types";
import type { ProjectStore } from "../../persistence/project-store";
import type { MissionStore } from "../../persistence/mission-store";
import type { ProjectGrant } from "../../providers/project-grants";
import type { HostProjectAction } from "../protocol";

const DEFAULT_TICK_MS = 10_000;
/** The reason a project paused because Stave quit; only these resume on relaunch. */
const APP_CLOSED_REASON = "Stave was closed while this project was active; it resumes when Stave opens.";
const MAX_ACTIONS_PER_PROJECT_TICK = 8;
/** How often a project reads its missions' pull requests for feedback. */
const PULL_REQUEST_POLL_MS = 5 * 60_000;
/** Pull requests of missions that ended longer ago than this are no longer watched. */
const PULL_REQUEST_WATCH_MS = 14 * 24 * 60 * 60_000;

/** A new schedule or issue watch starts from now, never from the past. */
function stampTriggers(previous: ProjectTriggers, next: ProjectTriggers, at: string): ProjectTriggers {
  return {
    ...next,
    issueSince: next.issueAssigned ? (previous.issueAssigned ? (previous.issueSince ?? at) : at) : null,
    scheduleSince:
      next.schedule === "off" ? null : next.schedule === previous.schedule ? (previous.scheduleSince ?? at) : at,
  };
}

type ProjectStorePort = Pick<
  ProjectStore,
  | "create"
  | "update"
  | "getProject"
  | "listProjects"
  | "upsertProposal"
  | "getProposal"
  | "listProposals"
  | "recordEvent"
  | "hasEvent"
  | "listEvents"
  | "addMemory"
  | "setMemoryStatus"
  | "listMemories"
  | "markTriggersSeen"
>;

type MissionReaderPort = Pick<MissionStore, "listMissionsForProject" | "getAggregate">;

export interface CoordinatorSnapshot {
  exists: boolean;
  archived: boolean;
  providerId: string | null;
  model: string | null;
  activeTurnId: string | null;
}

export interface ProjectRuntimeDependencies {
  store: ProjectStorePort;
  missions: MissionReaderPort;
  /** Starts a mission for the project; the mission records its project. */
  startMission: (input: MissionStartInput, options: { projectId: string }) => Promise<MissionDetail>;
  /** The report of a mission that ended, or null while it runs. */
  getMissionReport: (missionId: string) => Promise<MissionReport | null>;
  /** What a mission's turns spent so far; absent or null when usage is unknown. */
  getMissionUsage?: (missionId: string) => MissionUsage | null;
  /** The pull request of a mission's workspace, for PR feedback triggers; absent to not watch. */
  readPullRequest?: (workspaceId: string) => Promise<ProjectPullRequestSignal | null>;
  getTaskSnapshot: (args: { workspaceId: string; taskId: string }) => Promise<CoordinatorSnapshot>;
  runSupervisedTurn: (args: {
    workspaceId: string;
    taskId: string;
    prompt: string;
    fingerprint?: { providerId: string; model: string };
    runtimeOptions?: ProviderRuntimeOptions;
    retrievedContextParts?: CanonicalRetrievedContextPart[];
  }) => Promise<{ turnId: string }>;
  /** The repository a workspace belongs to, for a new project's coordinator. */
  resolveRepositoryPath: (workspaceId: string) => Promise<string | null>;
  /** Intake: a new worktree for a mission. */
  createMissionWorkspace: (args: { repositoryPath: string; name: string; label: string }) => Promise<{ workspaceId: string }>;
  createIdleTask: (args: {
    workspaceId: string;
    title: string;
    provider: "claude-code" | "codex";
    /** The model the task's composer starts on; absent for the provider default. */
    model?: string | null;
  }) => Promise<{ taskId: string }>;
  resolveProjectGrant: (projectKey: string) => ProjectGrant | null;
  /** Tells the provider runtime which tasks coordinate projects, so their turns get a project grant. */
  setCoordinatorTasks: (entries: ReadonlyArray<{ taskId: string; projectId: string }>) => void;
  notifyProjectProblem?: (args: { project: Project; detail: string }) => Promise<void> | void;
  emitChanged?: (event: ProjectChangedEvent) => void;
  now?: () => Date;
  setInterval?: typeof globalThis.setInterval;
  clearInterval?: typeof globalThis.clearInterval;
  tickIntervalMs?: number;
}

export interface ProjectRuntime {
  start: () => void;
  stop: () => void;
  requestTick: () => Promise<void>;
  /** A mission changed; ticks when it belongs to a project. */
  notifyMissionChanged: (args: { missionId: string }) => void;
  list: (args?: { openOnly?: boolean }) => Promise<{ projects: Project[] }>;
  get: (args: { projectId: string }) => Promise<ProjectDetail>;
  create: (args: unknown) => Promise<ProjectDetail>;
  /** With `providerId` or `model`, the user changed where the proposal runs before starting it. */
  approveProposal: (args: ProposalApproval) => Promise<ProjectDetail>;
  rejectProposal: (args: { projectId: string; proposalId: string }) => Promise<ProjectDetail>;
  pause: (args: { projectId: string }) => Promise<ProjectDetail>;
  resume: (args: { projectId: string }) => Promise<ProjectDetail>;
  end: (args: { projectId: string; outcome: "completed" | "cancelled" }) => Promise<ProjectDetail>;
  updateSettings: (args: { projectId: string; settings: Partial<ProjectSettings> }) => Promise<ProjectDetail>;
  setMemoryStatus: (args: { projectId: string; memoryId: string; status: ProjectMemory["status"] | "removed" }) => Promise<ProjectDetail>;
  syncPlaybooks: (args: { playbooks: Playbook[] }) => Promise<{ count: number }>;
  /** Issues assigned to the user, from Issues; wakes projects that watch for new ones. */
  observeIssues: (args: { items: readonly ObservedIssue[] }) => Promise<{ triggered: number }>;
  /** The user writes to the coordinator from the project; starts a turn on its task. */
  messageCoordinator: (args: { projectId: string; text: string }) => Promise<ProjectDetail>;
  getForGrant: (args: { projectKey: string }) => Promise<ProjectBriefing>;
  startMissionForGrant: (args: { projectKey: string; input: unknown }) => Promise<{ state: MissionProposal["state"]; message: string }>;
  getMissionReportForGrant: (args: { projectKey: string; missionId: string }) => Promise<Record<string, unknown>>;
  noteForGrant: (args: { projectKey: string; note?: string; summary?: string }) => Promise<{ recorded: boolean }>;
}

function refuse(message: string, code: "not-found" | "refused" | "stale" = "refused"): never {
  throw new ProjectCommandError(code, message);
}

function requireMissionModel(providerId: MissionProviderId, model: string) {
  if (!isProjectMissionModel(providerId, model)) {
    refuse(`"${model}" is not a ${providerId === "codex" ? "Codex" : "Claude"} model Stave offers. Use one of: ${PROJECT_MISSION_MODELS[providerId].join(", ")}.`);
  }
}

export interface ProposalApproval {
  projectId: string;
  proposalId: string;
  providerId?: MissionProviderId;
  model?: string | null;
}

function firstLine(text: string, max = 80) {
  const line = text.split("\n")[0]!.trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

function slugForWorktree(text: string) {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "mission"
  );
}

/** "pull-request" for a GitHub PR link, and so on, from the label and URL. */
function classifyLink(label: string, url: string): ProjectLibraryItem["kind"] {
  if (/\/pull\/\d+/.test(url) || /\bPR\b/i.test(label)) return "pull-request";
  if (/\/issues\/\d+|atlassian\.net\/browse|\/browse\/[A-Z]+-\d+/.test(url)) return "issue";
  if (/preview|vercel\.app|netlify\.app|pages\.dev/i.test(url)) return "preview";
  if (/docs\.google|notion\.|confluence|\.md$/i.test(url)) return "document";
  return "link";
}

function snapshotOf(aggregate: MissionAggregate): ProjectMissionSnapshot & { stageTitle: string | null } {
  const { mission } = aggregate;
  const record = currentStageRecord(aggregate);
  const stage = mission.playbook.stages[mission.currentStageIndex];
  let summary: string | null = record.detail;
  for (const candidate of [...mission.playbook.stages].reverse()) {
    const report = latestStageRecord(aggregate.stages, candidate.id)?.report;
    if (report?.outcome === "complete") {
      summary = report.summary;
      break;
    }
  }
  return {
    missionId: mission.id,
    state: mission.state,
    currentStageStatus: record.status,
    title: firstLine(mission.assignment, 60),
    summary: summary ? firstLine(summary, 200) : null,
    stageTitle: stage?.title ?? null,
  };
}

export function createProjectRuntime(deps: ProjectRuntimeDependencies): ProjectRuntime {
  const { store } = deps;
  const now = deps.now ?? (() => new Date());
  const setIntervalImpl = deps.setInterval ?? globalThis.setInterval;
  const clearIntervalImpl = deps.clearInterval ?? globalThis.clearInterval;
  let timer: ReturnType<typeof globalThis.setInterval> | null = null;
  let chain = Promise.resolve();
  let syncedPlaybooks: Playbook[] = [];
  let started = false;
  /** When each project last read its missions' pull requests. */
  const pullRequestPolledAt = new Map<string, number>();
  /** Missions whose pull request merged or closed; nothing more to watch. */
  const settledPullRequests = new Set<string>();

  function enqueue<T>(work: () => Promise<T>): Promise<T> {
    const next = chain.then(work, work);
    chain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  function emit(project: Project) {
    try {
      deps.emitChanged?.({ projectId: project.id, state: project.state, updatedAt: project.updatedAt });
    } catch (error) {
      console.warn("[projects] failed to announce a change", error);
    }
  }

  function refreshCoordinators() {
    deps.setCoordinatorTasks(
      store.listProjects({ openOnly: true }).map((project) => ({ taskId: project.coordinator.taskId, projectId: project.id })),
    );
  }

  function requireProject(projectId: string): Project {
    return store.getProject(projectId) ?? refuse("The project was not found.", "not-found");
  }

  function aggregatesOf(projectId: string): MissionAggregate[] {
    return deps.missions
      .listMissionsForProject(projectId)
      .flatMap((mission) => {
        const aggregate = deps.missions.getAggregate(mission.id);
        return aggregate ? [aggregate] : [];
      });
  }

  function playbookOptions(): PlaybookOption[] {
    return [
      ...syncedPlaybooks.map((playbook) => ({
        id: playbook.id,
        name: playbook.name,
        purpose: playbook.purpose,
        stages: playbook.stages.map((stage) => stage.title),
        source: "saved" as const,
      })),
      ...PLAYBOOK_STARTERS.map((starter) => ({
        id: starter.id,
        name: starter.template.name,
        purpose: starter.template.purpose,
        stages: starter.template.stages.map((stage) => stage.title),
        source: "template" as const,
      })),
    ];
  }

  function resolvePlaybook(id: string): Playbook | null {
    const saved = syncedPlaybooks.find((playbook) => playbook.id === id);
    if (saved) return saved;
    const starter = PLAYBOOK_STARTERS.find((candidate) => candidate.id === id);
    return starter ? createPlaybookFromStarter(starter, { now: now(), id: `starter_${starter.id}` }) : null;
  }

  async function detailOf(projectId: string): Promise<ProjectDetail> {
    const project = requireProject(projectId);
    const missions: ProjectMissionView[] = [];
    const library: ProjectLibraryItem[] = [];
    for (const aggregate of aggregatesOf(projectId)) {
      const { mission } = aggregate;
      const record = currentStageRecord(aggregate);
      const report = isActiveMissionState(mission.state) ? null : await deps.getMissionReport(mission.id).catch(() => null);
      missions.push({
        missionId: mission.id,
        workspaceId: mission.workspaceId,
        taskId: mission.leadTaskId,
        playbookName: mission.playbook.name,
        assignment: mission.assignment,
        state: mission.state,
        currentStageIndex: mission.currentStageIndex,
        stageCount: mission.playbook.stages.length,
        stageTitle: mission.playbook.stages[mission.currentStageIndex]?.title ?? null,
        currentStageStatus: record.status,
        providerId: mission.fingerprint.providerId,
        updatedAt: mission.updatedAt,
        report,
        usage: deps.getMissionUsage?.(mission.id) ?? null,
      });
      for (const link of report?.links ?? []) {
        library.push({
          label: link.label,
          url: link.url,
          kind: classifyLink(link.label, link.url),
          missionId: mission.id,
          missionTitle: firstLine(mission.assignment, 60),
          verified: link.source === "stave",
        });
      }
    }
    const coordinator = await deps.getTaskSnapshot(project.coordinator).catch(() => null);
    return {
      project,
      proposals: store.listProposals(projectId),
      missions,
      memories: store.listMemories(projectId),
      library,
      events: store.listEvents(projectId, 100),
      coordinatorState: {
        available: Boolean(coordinator?.exists && !coordinator.archived),
        busy: Boolean(coordinator?.activeTurnId),
        providerId: coordinator?.providerId ?? null,
        model: coordinator?.model ?? null,
      },
    };
  }

  function updateProject(project: Project, patch: Partial<Project>, event?: Parameters<ProjectStorePort["update"]>[1]) {
    const next = { ...project, ...patch, updatedAt: now().toISOString() };
    store.update(next, event);
    emit(next);
    return next;
  }

  /* ---------------------------------------------------------------------- */
  /* Acting on decisions                                                     */
  /* ---------------------------------------------------------------------- */

  async function startProposal(project: Project, proposal: MissionProposal) {
    const key = `project:${project.id}:start:${proposal.id}`;
    // Recorded before any side effect, so a restart never starts it twice.
    if (!store.recordEvent(project.id, { kind: "mission-started", idempotencyKey: key, detail: { proposalId: proposal.id } }, now())) {
      return;
    }
    try {
      const name = proposal.worktreeName ?? slugForWorktree(proposal.assignment);
      const { workspaceId } = await deps.createMissionWorkspace({
        repositoryPath: project.repositoryPath,
        name: `project-${name}`,
        label: firstLine(proposal.assignment, 60),
      });
      const { taskId } = await deps.createIdleTask({
        workspaceId,
        title: firstLine(proposal.assignment, 60),
        provider: proposal.providerId,
        model: proposal.model,
      });
      const detail = await deps.startMission(
        {
          workspaceId,
          leadTaskId: taskId,
          playbook: proposal.playbook,
          assignment: proposal.assignment,
          // Consent for a project mission: the playbook's check-ins and
          // default permissions, and every external effect it names — what
          // the user approved in the proposal or allowed in the settings.
          consent: {
            checkIns: proposal.playbook.checkIns,
            permissionMode: proposal.playbook.runtime?.permissionMode ?? "guided",
            authorizedEffectStageIds: listExternalEffectStages(proposal.playbook).map((stage) => stage.id),
          },
        },
        { projectId: project.id },
      );
      store.upsertProposal({
        ...proposal,
        state: "started",
        workspaceId,
        taskId,
        missionId: detail.mission.id,
        detail: null,
        updatedAt: now().toISOString(),
      });
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : "The mission could not start.";
      store.upsertProposal({ ...proposal, state: "failed", detail: message.slice(0, 500), updatedAt: now().toISOString() });
      store.recordEvent(project.id, { kind: "mission-start-failed", detail: { proposalId: proposal.id, message } }, now());
      await deps.notifyProjectProblem?.({ project, detail: `A mission of ${project.name} could not start: ${message}` });
    }
    emit(requireProject(project.id));
  }

  function rememberDecisions(project: Project, changes: readonly ProjectMissionChange[]) {
    for (const change of changes) {
      if (change.stateKey !== "completed") continue;
      if (!store.recordEvent(project.id, { kind: "memory-added", idempotencyKey: `project:${project.id}:memory:${change.missionId}`, detail: { missionId: change.missionId } }, now())) {
        continue;
      }
      const aggregate = deps.missions.getAggregate(change.missionId);
      if (!aggregate) continue;
      for (const record of aggregate.stages) {
        if (record.report?.outcome !== "complete") continue;
        for (const decision of record.report.decisions) {
          store.addMemory({
            id: randomUUID(),
            projectId: project.id,
            kind: "decision",
            content: `${decision.decision} — ${decision.reason}`.slice(0, PROJECT_LIMITS.note),
            status: project.settings.autoAcceptDecisions ? "accepted" : "candidate",
            sourceMissionId: change.missionId,
            createdAt: now().toISOString(),
          });
        }
      }
    }
  }

  /**
   * The one way a project starts a turn: on its coordinator's task, read-only,
   * with the coordinator instruction — for a wake and for the user's message.
   */
  async function runCoordinatorTurn(project: Project, prompt: string, runtime: { providerId: string; model: string }) {
    await deps.runSupervisedTurn({
      workspaceId: project.coordinator.workspaceId,
      taskId: project.coordinator.taskId,
      prompt,
      fingerprint: runtime,
      runtimeOptions: coordinatorRuntimeOptions(runtime.providerId),
      retrievedContextParts: [
        {
          type: "retrieved_context",
          sourceId: PROJECT_CONTEXT_SOURCE_ID,
          title: `Project: ${project.name}`,
          content: buildCoordinatorInstruction(project),
        } as CanonicalRetrievedContextPart,
      ],
    });
  }

  async function wakeCoordinator(
    project: Project,
    prompt: string,
    key: string,
    delivered: Record<string, string>,
    triggerIds: readonly string[] = [],
  ) {
    if (
      !store.recordEvent(
        project.id,
        { kind: "coordinator-woken", idempotencyKey: key, detail: { delivered, triggers: [...triggerIds] } },
        now(),
      )
    ) {
      return;
    }
    const snapshot = await deps.getTaskSnapshot(project.coordinator);
    if (!snapshot.exists || snapshot.archived || !snapshot.providerId || !snapshot.model) {
      store.recordEvent(project.id, { kind: "coordinator-wake-failed", detail: { reason: "coordinator-unavailable" } }, now());
      updateProject(project, { state: "paused", reasonDetail: "The coordinator task is gone or archived." }, { kind: "paused", detail: { reason: "coordinator-unavailable" } });
      refreshCoordinators();
      return;
    }
    try {
      await runCoordinatorTurn(project, prompt, { providerId: snapshot.providerId, model: snapshot.model });
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : "The coordinator turn did not start.";
      store.recordEvent(project.id, { kind: "coordinator-wake-failed", detail: { message } }, now());
      await deps.notifyProjectProblem?.({ project, detail: `The coordinator of ${project.name} could not wake: ${message}` });
    }
  }

  /** Records the triggers not seen before; each becomes news for the next wake. */
  function recordTriggers(project: Project, found: readonly SeenTrigger[]): number {
    const fresh = new Set(store.markTriggersSeen(project.id, found.map((entry) => entry.seenKey), now()));
    let recorded = 0;
    for (const { seenKey, trigger } of found) {
      if (!fresh.has(seenKey)) continue;
      const detail = { triggerId: trigger.id, triggerKind: trigger.kind, summary: trigger.summary.slice(0, 500) };
      if (store.recordEvent(project.id, { kind: "trigger-observed", idempotencyKey: `project:${project.id}:trigger:${trigger.id}`, detail }, now())) {
        recorded += 1;
      }
    }
    return recorded;
  }

  /** Scheduled check-ins and pull request feedback: what a tick can see for itself. */
  async function collectTriggers(project: Project) {
    const { triggers } = project.settings;
    const slot = latestScheduleSlot(triggers.schedule, now());
    if (slot && triggers.scheduleSince && slot.getTime() > Date.parse(triggers.scheduleSince)) {
      const id = `schedule:${slot.toISOString()}`;
      const when = slot.toLocaleString("en-US", { weekday: "short", hour: "2-digit", minute: "2-digit" });
      recordTriggers(project, [{ seenKey: id, trigger: { id, kind: "schedule", summary: `${SCHEDULE_LABELS[triggers.schedule]} (${when})` } }]);
    }
    if (!triggers.pullRequestFeedback || !deps.readPullRequest) return;
    const polledAt = pullRequestPolledAt.get(project.id) ?? 0;
    if (now().getTime() - polledAt < PULL_REQUEST_POLL_MS) return;
    pullRequestPolledAt.set(project.id, now().getTime());
    for (const aggregate of aggregatesOf(project.id)) {
      const { mission } = aggregate;
      if (isActiveMissionState(mission.state) || settledPullRequests.has(mission.id)) continue;
      if (now().getTime() - Date.parse(mission.updatedAt) > PULL_REQUEST_WATCH_MS) continue;
      if (!aggregate.stages.some((record) => record.facts?.action?.type === "open-draft-pr")) continue;
      const pr = await deps.readPullRequest(mission.workspaceId).catch(() => null);
      if (!pr) continue;
      if (pr.state !== "OPEN") settledPullRequests.add(mission.id);
      recordTriggers(project, pullRequestTriggers({ missionId: mission.id, missionTitle: firstLine(mission.assignment, 60), pr }));
    }
  }

  async function tickProject(projectId: string) {
    const watched = store.getProject(projectId);
    if (watched?.state === "active") await collectTriggers(watched).catch((error) => console.warn("[projects] triggers failed", projectId, error));
    for (let round = 0; round < MAX_ACTIONS_PER_PROJECT_TICK; round += 1) {
      const project = store.getProject(projectId);
      if (!project) return;
      const aggregates = aggregatesOf(project.id);
      const snapshot = project.state === "active" ? await deps.getTaskSnapshot(project.coordinator).catch(() => null) : null;
      const decision = decideProject({
        project,
        proposals: store.listProposals(project.id),
        missions: aggregates.map(snapshotOf),
        delivered: collectDeliveredStates(store.listEvents(project.id)),
        triggers: collectPendingTriggers(store.listEvents(project.id)),
        coordinatorBusy: Boolean(snapshot?.activeTurnId),
      });
      switch (decision.action) {
        case "wait":
        case "idle":
          return;
        case "start-proposal": {
          const proposal = store.getProposal(decision.proposalId);
          if (!proposal) return;
          await startProposal(project, proposal);
          continue;
        }
        case "wake-coordinator": {
          const dayAgo = now().getTime() - 24 * 60 * 60_000;
          const recentWakes = store
            .listEvents(project.id)
            .filter((event) => event.kind === "coordinator-woken" && Date.parse(event.createdAt) > dayAgo).length;
          if (recentWakes >= PROJECT_LIMITS.maxCoordinatorWakesPerDay) {
            const detail = `The coordinator took ${recentWakes} automatic turns today. Resume the project to let it continue.`;
            updateProject(project, { state: "paused", reasonDetail: detail }, { kind: "paused", detail: { reason: "wake-cap" } });
            await deps.notifyProjectProblem?.({ project, detail: `${project.name} paused: ${detail}` });
            return;
          }
          rememberDecisions(project, decision.changes);
          await wakeCoordinator(
            project,
            buildCoordinatorWakePrompt(decision.changes, decision.triggers),
            decision.key,
            Object.fromEntries(decision.changes.map((change) => [change.missionId, change.stateKey])),
            decision.triggers.map((trigger) => trigger.id),
          );
          return;
        }
      }
    }
  }

  /** A project past its end date stops on its own; its running missions carry on. */
  async function expireIfDue(project: Project): Promise<boolean> {
    const endsAt = project.settings.endsAt;
    if (!endsAt || Date.parse(endsAt) > now().getTime()) return false;
    const day = new Date(endsAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const detail = `Reached its end date (${day}). Running missions finish on their own.`;
    updateProject(project, { state: "expired", reasonDetail: detail }, { kind: "ended", detail: { outcome: "expired" } });
    refreshCoordinators();
    await deps.notifyProjectProblem?.({ project, detail: `${project.name} stopped: ${detail}` });
    return true;
  }

  async function tick() {
    for (const project of store.listProjects({ openOnly: true })) {
      if (await expireIfDue(project).catch(() => false)) continue;
      if (project.state !== "active") continue;
      try {
        await tickProject(project.id);
      } catch (error) {
        console.warn("[projects] tick failed", project.id, error);
      }
    }
  }

  /**
   * Quitting Stave pauses every active project, so nothing is due while it is
   * closed; relaunching resumes exactly those, and a schedule restarts from
   * the relaunch instead of catching up on missed check-ins.
   */
  function pauseForShutdown() {
    for (const project of store.listProjects({ openOnly: true })) {
      if (project.state !== "active") continue;
      store.update(
        { ...project, state: "paused", reasonDetail: APP_CLOSED_REASON, updatedAt: now().toISOString() },
        { kind: "paused", detail: { reason: "app-closed" } },
      );
    }
  }

  function resumeAfterRelaunch() {
    for (const project of store.listProjects({ openOnly: true })) {
      if (project.state !== "paused" || project.reasonDetail !== APP_CLOSED_REASON) continue;
      const at = now().toISOString();
      const { triggers } = project.settings;
      store.update(
        {
          ...project,
          state: "active",
          reasonDetail: null,
          settings: { ...project.settings, triggers: { ...triggers, scheduleSince: triggers.schedule === "off" ? null : at } },
          updatedAt: at,
        },
        { kind: "resumed", detail: { reason: "app-opened" } },
      );
    }
  }

  /** A start recorded before a restart that never produced a mission is reported, never replayed. */
  function recoverInterruptedStarts() {
    for (const project of store.listProjects({ openOnly: true })) {
      for (const proposal of store.listProposals(project.id)) {
        if (proposal.state !== "approved") continue;
        if (!store.hasEvent(`project:${project.id}:start:${proposal.id}`)) continue;
        store.upsertProposal({
          ...proposal,
          state: "failed",
          detail: "Stave stopped while starting this mission. Check the workspace list before proposing it again.",
          updatedAt: now().toISOString(),
        });
      }
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Commands                                                                */
  /* ---------------------------------------------------------------------- */

  function requireGrant(projectKey: string): { grant: ProjectGrant; project: Project } {
    const grant = deps.resolveProjectGrant(projectKey);
    if (!grant) refuse("This turn cannot act for a project. Project tools work only in a project coordinator's turns.");
    const project = requireProject(grant.projectId);
    if (project.coordinator.taskId !== grant.taskId) refuse("This task no longer coordinates the project.", "stale");
    return { grant, project };
  }

  const runtime: ProjectRuntime = {
    start() {
      started = true;
      recoverInterruptedStarts();
      resumeAfterRelaunch();
      refreshCoordinators();
      timer = setIntervalImpl(() => void runtime.requestTick(), deps.tickIntervalMs ?? DEFAULT_TICK_MS);
      void runtime.requestTick();
    },
    stop() {
      if (timer) clearIntervalImpl(timer);
      timer = null;
      if (started) pauseForShutdown();
      started = false;
    },
    requestTick: () => enqueue(tick),
    notifyMissionChanged: ({ missionId }) => {
      if (deps.missions.getAggregate(missionId)?.mission.projectId) void runtime.requestTick();
    },

    list: async (args = {}) => ({ projects: store.listProjects(args) }),
    get: ({ projectId }) => detailOf(projectId),

    create: (rawInput) =>
      enqueue(async () => {
        const input = ProjectCreateInputSchema.parse(rawInput);
        const snapshot = await deps.getTaskSnapshot(input.coordinator);
        if (!snapshot.exists || snapshot.archived) refuse("The coordinator task was not found.");
        if (snapshot.providerId !== "claude-code" && snapshot.providerId !== "codex") {
          refuse("A project's coordinator runs on a Claude or Codex task.");
        }
        const repositoryPath =
          (await deps.resolveRepositoryPath(input.coordinator.workspaceId)) ??
          refuse("The coordinator's repository could not be found.");
        const timestamp = now().toISOString();
        const project: Project = {
          id: randomUUID(),
          name: input.name,
          goal: input.goal,
          repositoryPath,
          coordinator: input.coordinator,
          settings: (() => {
            const settings = ProjectSettingsSchema.parse({ ...DEFAULT_PROJECT_SETTINGS, ...input.settings });
            return { ...settings, triggers: stampTriggers(DEFAULT_PROJECT_SETTINGS.triggers, settings.triggers, timestamp) };
          })(),
          state: "active",
          summary: null,
          reasonDetail: null,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        const created = store.create(project, { kind: "project-created", detail: { goal: project.goal } });
        if (!created.ok) refuse(created.message);
        refreshCoordinators();
        emit(project);
        // The first coordinator turn plans the project from its goal.
        await wakeCoordinator(
          project,
          buildCoordinatorKickoffPrompt(),
          `project:${project.id}:kickoff`,
          {},
        );
        return detailOf(project.id);
      }),

    approveProposal: ({ projectId, proposalId, providerId, model }) =>
      enqueue(async () => {
        const proposal = store.getProposal(proposalId);
        if (!proposal || proposal.projectId !== projectId) refuse("The proposal was not found.", "not-found");
        if (proposal.state !== "pending") refuse("This proposal was already decided.", "stale");
        const runsOn = providerId ?? proposal.providerId;
        // A new provider without a model means that provider's default.
        const runsModel = model !== undefined ? model : providerId && providerId !== proposal.providerId ? null : proposal.model;
        if (runsModel) requireMissionModel(runsOn, runsModel);
        store.upsertProposal({ ...proposal, providerId: runsOn, model: runsModel, state: "approved", updatedAt: now().toISOString() });
        store.recordEvent(projectId, { kind: "proposal-approved", detail: { proposalId } }, now());
        emit(requireProject(projectId));
        await tickProject(projectId);
        return detailOf(projectId);
      }),

    rejectProposal: ({ projectId, proposalId }) =>
      enqueue(async () => {
        const proposal = store.getProposal(proposalId);
        if (!proposal || proposal.projectId !== projectId) refuse("The proposal was not found.", "not-found");
        if (proposal.state !== "pending") refuse("This proposal was already decided.", "stale");
        store.upsertProposal({ ...proposal, state: "rejected", updatedAt: now().toISOString() });
        store.recordEvent(projectId, { kind: "proposal-rejected", detail: { proposalId } }, now());
        emit(requireProject(projectId));
        return detailOf(projectId);
      }),

    pause: ({ projectId }) =>
      enqueue(async () => {
        const project = requireProject(projectId);
        if (project.state !== "active") refuse("Only an active project can be paused.", "stale");
        updateProject(project, { state: "paused", reasonDetail: "Paused by you." }, { kind: "paused", detail: { by: "user" } });
        return detailOf(projectId);
      }),

    resume: ({ projectId }) =>
      enqueue(async () => {
        const project = requireProject(projectId);
        if (project.state !== "paused") refuse("Only a paused project can be resumed.", "stale");
        updateProject(project, { state: "active", reasonDetail: null }, { kind: "resumed", detail: {} });
        refreshCoordinators();
        await tickProject(projectId);
        return detailOf(projectId);
      }),

    end: ({ projectId, outcome }) =>
      enqueue(async () => {
        const project = requireProject(projectId);
        if (!isOpenProjectState(project.state)) refuse("The project has already ended.", "stale");
        updateProject(project, { state: outcome, reasonDetail: null }, { kind: "ended", detail: { outcome } });
        refreshCoordinators();
        return detailOf(projectId);
      }),

    updateSettings: ({ projectId, settings }) =>
      enqueue(async () => {
        const project = requireProject(projectId);
        const parsed = ProjectSettingsSchema.parse({ ...project.settings, ...settings });
        const next = { ...parsed, triggers: stampTriggers(project.settings.triggers, parsed.triggers, now().toISOString()) };
        updateProject(project, { settings: next }, { kind: "settings-changed", detail: { settings: next } });
        await tickProject(projectId);
        return detailOf(projectId);
      }),

    setMemoryStatus: ({ projectId, memoryId, status }) =>
      enqueue(async () => {
        const memory = store.setMemoryStatus(memoryId, status);
        if (!memory || memory.projectId !== projectId) refuse("The memory was not found.", "not-found");
        if (status === "accepted") store.recordEvent(projectId, { kind: "memory-accepted", detail: { memoryId } }, now());
        emit(requireProject(projectId));
        return detailOf(projectId);
      }),

    syncPlaybooks: async ({ playbooks }) => {
      syncedPlaybooks = [...playbooks];
      return { count: syncedPlaybooks.length };
    },

    observeIssues: ({ items }) =>
      enqueue(async () => {
        let triggered = 0;
        for (const project of store.listProjects({ openOnly: true })) {
          const { triggers } = project.settings;
          if (project.state !== "active" || !triggers.issueAssigned || !triggers.issueSince) continue;
          const since = Date.parse(triggers.issueSince);
          const matching = items.filter((issue) => issueMatchesFilter(issue, triggers.issueFilter));
          // The first look after watching starts takes in what was already
          // assigned; only issues created since then are news.
          if (store.markTriggersSeen(project.id, [`issues-baseline:${triggers.issueSince}`], now()).length === 1) {
            const fresh = matching.filter((issue) => issue.createdAt && Date.parse(issue.createdAt) >= since);
            store.markTriggersSeen(
              project.id,
              matching.filter((issue) => !fresh.includes(issue)).map((issue) => issueTrigger(issue).seenKey),
              now(),
            );
            triggered += recordTriggers(project, fresh.map(issueTrigger));
          } else {
            triggered += recordTriggers(project, matching.map(issueTrigger));
          }
        }
        if (triggered > 0) void runtime.requestTick();
        return { triggered };
      }),

    messageCoordinator: ({ projectId, text }) =>
      enqueue(async () => {
        const project = requireProject(projectId);
        if (!isOpenProjectState(project.state)) refuse("The project has ended. Open the coordinator's task to keep talking.", "stale");
        const body = text.trim();
        if (!body) refuse("Write a message first.");
        if (body.length > PROJECT_LIMITS.coordinatorMessage) refuse(`Keep it under ${PROJECT_LIMITS.coordinatorMessage} characters.`);
        const snapshot = await deps.getTaskSnapshot(project.coordinator);
        if (!snapshot.exists || snapshot.archived || !snapshot.providerId || !snapshot.model) {
          refuse("The coordinator task is gone or archived.");
        }
        if (snapshot.activeTurnId) refuse("The coordinator is answering. Send this once it finishes.", "stale");
        await runCoordinatorTurn(project, body, { providerId: snapshot.providerId!, model: snapshot.model! });
        store.recordEvent(projectId, { kind: "coordinator-messaged", detail: { characters: body.length } }, now());
        emit(project);
        return detailOf(projectId);
      }),

    getForGrant: async ({ projectKey }) => {
      const { project } = requireGrant(projectKey);
      return buildProjectBriefing({
        project,
        missions: aggregatesOf(project.id).map(snapshotOf),
        proposals: store.listProposals(project.id),
        playbooks: playbookOptions(),
        memories: store.listMemories(project.id),
      });
    },

    startMissionForGrant: ({ projectKey, input: rawInput }) =>
      enqueue(async () => {
        const { project } = requireGrant(projectKey);
        if (project.state !== "active") refuse(`The project is ${project.state}; it starts no missions now.`);
        const input = StartMissionToolInputSchema.parse(rawInput);
        const existing = store.listProposals(project.id).find((proposal) => proposal.startKey === input.startKey);
        if (existing) {
          return { state: existing.state, message: `This start key was already used: the mission is ${existing.state}.` };
        }
        const playbook = resolvePlaybook(input.playbookId);
        if (!playbook) refuse(`No playbook "${input.playbookId}". Read the options with stave_get_project.`);
        const coordinator = await deps.getTaskSnapshot(project.coordinator);
        const providerId = input.providerId ?? (coordinator.providerId === "codex" ? "codex" : "claude-code");
        if (input.model) requireMissionModel(providerId, input.model);
        const timestamp = now().toISOString();
        const proposal: MissionProposal = {
          id: randomUUID(),
          projectId: project.id,
          startKey: input.startKey,
          playbook,
          assignment: input.assignment,
          providerId,
          model: input.model ?? null,
          worktreeName: input.worktreeName ? slugForWorktree(input.worktreeName) : null,
          state: project.settings.askBeforeStarting ? "pending" : "approved",
          workspaceId: null,
          taskId: null,
          missionId: null,
          detail: null,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        store.upsertProposal(proposal);
        store.recordEvent(project.id, { kind: "proposal-created", detail: { proposalId: proposal.id, startKey: input.startKey } }, now());
        emit(project);
        if (proposal.state === "approved") void runtime.requestTick();
        return {
          state: proposal.state,
          message:
            proposal.state === "pending"
              ? "Proposed. The mission starts once the user approves it in the project."
              : "Starting: Stave creates the worktree and the task, then starts the mission.",
        };
      }),

    getMissionReportForGrant: async ({ projectKey, missionId }) => {
      const { project } = requireGrant(projectKey);
      const aggregate = deps.missions.getAggregate(missionId);
      if (!aggregate || aggregate.mission.projectId !== project.id) refuse("That mission is not part of this project.", "not-found");
      if (isActiveMissionState(aggregate.mission.state)) {
        return { missionId, state: aggregate.mission.state, running: snapshotOf(aggregate) };
      }
      const report = await deps.getMissionReport(missionId);
      return { missionId, state: aggregate.mission.state, report: report ?? null };
    },

    noteForGrant: ({ projectKey, note, summary }) =>
      enqueue(async () => {
        const { project } = requireGrant(projectKey);
        let recorded = false;
        if (note?.trim()) {
          recorded = store.addMemory({
            id: randomUUID(),
            projectId: project.id,
            kind: "note",
            content: note.trim().slice(0, PROJECT_LIMITS.note),
            status: project.settings.autoAcceptDecisions ? "accepted" : "candidate",
            sourceMissionId: null,
            createdAt: now().toISOString(),
          });
        }
        if (summary?.trim()) {
          updateProject(project, { summary: summary.trim().slice(0, PROJECT_LIMITS.note) }, { kind: "summary", detail: {} });
          recorded = true;
        }
        emit(requireProject(project.id));
        return { recorded };
      }),
  };

  return runtime;
}

/** Serializes a thrown refusal the way the host returns every project action. */
export async function invokeProjectRuntime<T>(work: () => Promise<T>): Promise<ProjectInvokeResult<T>> {
  try {
    return { ok: true, value: await work() };
  } catch (error) {
    if (error instanceof ProjectCommandError) return { ok: false, code: error.code, message: error.message };
    if (error && typeof error === "object" && "issues" in error) {
      return { ok: false, code: "invalid-args", message: "The project request was not valid." };
    }
    return { ok: false, code: "failed", message: error instanceof Error ? error.message : "The project request failed." };
  }
}

/** Routes a host `project.invoke` request to the runtime. */
export function invokeProjectAction(
  runtime: ProjectRuntime,
  action: HostProjectAction,
  args: unknown,
): Promise<ProjectInvokeResult<unknown>> {
  return invokeProjectRuntime(() => dispatchProject(runtime, action, args));
}

function dispatchProject(runtime: ProjectRuntime, action: HostProjectAction, args: unknown): Promise<unknown> {
  // The main process validates renderer arguments; tools pass their key.
  const value = (args ?? {}) as never;
  switch (action) {
    case "list":
      return runtime.list(value);
    case "get":
      return runtime.get(value);
    case "create":
      return runtime.create(args);
    case "approve-proposal":
      return runtime.approveProposal(value);
    case "observe-issues":
      return runtime.observeIssues(value);
    case "message-coordinator":
      return runtime.messageCoordinator(value);
    case "reject-proposal":
      return runtime.rejectProposal(value);
    case "pause":
      return runtime.pause(value);
    case "resume":
      return runtime.resume(value);
    case "end":
      return runtime.end(value);
    case "update-settings":
      return runtime.updateSettings(value);
    case "set-memory-status":
      return runtime.setMemoryStatus(value);
    case "sync-playbooks":
      return runtime.syncPlaybooks(value);
    case "get-for-grant":
      return runtime.getForGrant(value);
    case "start-mission-for-grant":
      return runtime.startMissionForGrant(value);
    case "get-mission-report-for-grant":
      return runtime.getMissionReportForGrant(value);
    case "note-for-grant":
      return runtime.noteForGrant(value);
  }
}
