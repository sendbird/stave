/**
 * The project supervisor's decision, as a pure function of what it observes:
 * start approved missions up to the parallel limit, wake the coordinator once
 * for every batch of mission changes it has not seen, and otherwise wait.
 *
 * Exactly once per mission state: a wake records the state it delivered for
 * each mission, and a mission wakes the coordinator again only when that
 * state changes to another one worth waking for.
 */
import type { MissionState, StageStatus } from "@/lib/missions/domain";
import { PROJECT_LIMITS, type MissionProposal, type Project, type ProjectEvent, type ProjectSchedule } from "./domain";

/** A mission of the project, as the policy needs it. */
export interface ProjectMissionSnapshot {
  missionId: string;
  state: MissionState;
  currentStageStatus: StageStatus;
  title: string;
  /** One line from the mission's report or its current stage. */
  summary: string | null;
}

export interface ProjectObservation {
  project: Project;
  proposals: readonly MissionProposal[];
  missions: readonly ProjectMissionSnapshot[];
  /** Mission id → the state key the coordinator last saw, from wake events. */
  delivered: Readonly<Record<string, string>>;
  /** Triggers that fired and no wake has delivered yet, oldest first. */
  triggers?: readonly ProjectTrigger[];
  coordinatorBusy: boolean;
}

/** Something a project watches happened: an issue, PR feedback, a scheduled check-in. */
export interface ProjectTrigger {
  /** Stable per occurrence, so one occurrence wakes the coordinator once. */
  id: string;
  kind: "issue-assigned" | "pull-request" | "schedule";
  /** One line for the coordinator, such as "ACME-12 · Fix login (url)". */
  summary: string;
}

export type ProjectDecision =
  | { action: "wait"; reason: string }
  | { action: "start-proposal"; proposalId: string }
  | { action: "wake-coordinator"; changes: ProjectMissionChange[]; triggers: ProjectTrigger[]; key: string }
  | { action: "idle" };

export interface ProjectMissionChange {
  missionId: string;
  title: string;
  stateKey: string;
  summary: string | null;
}

/**
 * The state of a mission worth telling the coordinator about, or null while
 * it simply runs: ended, stuck, blocked or waiting for a sign-off.
 */
export function missionStateKey(mission: Pick<ProjectMissionSnapshot, "state" | "currentStageStatus">): string | null {
  switch (mission.state) {
    case "completed":
    case "cancelled":
    case "stopped":
      return mission.state;
    case "paused":
      return null;
    case "running":
      return mission.currentStageStatus === "awaiting-sign-off" ||
        mission.currentStageStatus === "blocked" ||
        mission.currentStageStatus === "stuck"
        ? mission.currentStageStatus
        : null;
  }
}

/** The mission states each wake delivered, latest wins. */
export function collectDeliveredStates(events: readonly ProjectEvent[]): Record<string, string> {
  const delivered: Record<string, string> = {};
  for (const event of events) {
    if (event.kind !== "coordinator-woken") continue;
    const states = event.detail.delivered;
    if (!states || typeof states !== "object") continue;
    for (const [missionId, key] of Object.entries(states as Record<string, unknown>)) {
      if (typeof key === "string") delivered[missionId] = key;
    }
  }
  return delivered;
}

export function countRunningMissions(missions: readonly ProjectMissionSnapshot[]) {
  return missions.filter((mission) => mission.state === "running" || mission.state === "paused").length;
}

export function decideProject(observation: ProjectObservation): ProjectDecision {
  const { project } = observation;
  if (project.state !== "active") return { action: "wait", reason: `The project is ${project.state}.` };

  const running = countRunningMissions(observation.missions);
  const approved = observation.proposals
    .filter((proposal) => proposal.state === "approved")
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  if (approved.length > 0 && running < project.settings.parallelLimit) {
    return { action: "start-proposal", proposalId: approved[0]!.id };
  }

  const changes: ProjectMissionChange[] = [];
  for (const mission of observation.missions) {
    const stateKey = missionStateKey(mission);
    if (!stateKey || observation.delivered[mission.missionId] === stateKey) continue;
    changes.push({ missionId: mission.missionId, title: mission.title, stateKey, summary: mission.summary });
  }
  const triggers = (observation.triggers ?? []).slice(0, PROJECT_LIMITS.maxTriggersPerWake);
  if (changes.length > 0 || triggers.length > 0) {
    if (observation.coordinatorBusy) return { action: "wait", reason: "The coordinator is in a turn." };
    const parts = [
      ...changes.map((change) => `${change.missionId}=${change.stateKey}`).sort(),
      ...triggers.map((trigger) => `trigger=${trigger.id}`).sort(),
    ];
    return { action: "wake-coordinator", changes, triggers, key: `project:${project.id}:wake:${parts.join(",")}` };
  }
  return { action: "idle" };
}

/** The triggers the project recorded that no wake has delivered, oldest first. */
export function collectPendingTriggers(events: readonly ProjectEvent[]): ProjectTrigger[] {
  const delivered = new Set<string>();
  for (const event of events) {
    if (event.kind !== "coordinator-woken") continue;
    const ids = event.detail.triggers;
    if (Array.isArray(ids)) for (const id of ids) if (typeof id === "string") delivered.add(id);
  }
  const pending: ProjectTrigger[] = [];
  for (const event of events) {
    if (event.kind !== "trigger-observed" || event.detail.baseline === true) continue;
    const { triggerId, triggerKind, summary } = event.detail;
    if (typeof triggerId !== "string" || delivered.has(triggerId) || typeof summary !== "string") continue;
    if (triggerKind !== "issue-assigned" && triggerKind !== "pull-request" && triggerKind !== "schedule") continue;
    pending.push({ id: triggerId, kind: triggerKind, summary });
  }
  return pending;
}

const SCHEDULE_HOUR = 9;

/**
 * The latest scheduled check-in at or before `now`, in the host's local time,
 * or null when the schedule is off. `daily` and `weekdays` are 09:00, `weekly`
 * is Monday 09:00, `every-4h` is 00:00, 04:00 and so on.
 */
export function latestScheduleSlot(schedule: ProjectSchedule, now: Date): Date | null {
  if (schedule === "off") return null;
  const slot = new Date(now);
  slot.setSeconds(0, 0);
  if (schedule === "every-4h") {
    slot.setMinutes(0);
    slot.setHours(Math.floor(slot.getHours() / 4) * 4);
    return slot;
  }
  slot.setHours(SCHEDULE_HOUR, 0);
  if (slot.getTime() > now.getTime()) slot.setDate(slot.getDate() - 1);
  const fits = (day: number) => (schedule === "daily" ? true : schedule === "weekdays" ? day >= 1 && day <= 5 : day === 1);
  for (let guard = 0; guard < 7 && !fits(slot.getDay()); guard += 1) slot.setDate(slot.getDate() - 1);
  return slot;
}

export const SCHEDULE_LABELS: Record<ProjectSchedule, string> = {
  off: "Off",
  daily: "Every day at 09:00",
  weekdays: "Weekdays at 09:00",
  weekly: "Mondays at 09:00",
  "every-4h": "Every 4 hours",
};

const KICKOFF_PROMPT_START = "Plan this project.";
const WATCHED_PROMPT_START = "What this project watches happened:";
const CHANGED_PROMPT_START = "Missions of this project changed:";

/** The first coordinator turn: plan the project from its goal. */
export function buildCoordinatorKickoffPrompt(): string {
  return [
    `${KICKOFF_PROMPT_START} Break the goal into missions that can run independently where possible.`,
    "Read the project with stave_get_project, then propose the first missions with stave_start_mission.",
    "Say in a few lines what you proposed and why.",
  ].join("\n");
}

/**
 * One line for a prompt Stave sent the coordinator, as the conversation shows
 * it: "Asked it to plan the project", or what woke it.
 */
export function summarizeStaveCoordinatorPrompt(text: string): string {
  const start = text.trimStart();
  if (start.startsWith(KICKOFF_PROMPT_START)) return "Asked the coordinator to plan the project from its goal.";
  const items = start
    .split("\n")
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim());
  if (items.length === 0) return start.split("\n")[0]!;
  return `Woke the coordinator: ${items[0]}${items.length > 1 ? ` and ${items.length - 1} more` : ""}.`;
}

/** Whether a coordinator message is a prompt Stave sent, not one the user wrote. */
export function isStaveCoordinatorPrompt(text: string): boolean {
  const start = text.trimStart();
  return [KICKOFF_PROMPT_START, WATCHED_PROMPT_START, CHANGED_PROMPT_START].some((prefix) => start.startsWith(prefix));
}

const TRIGGER_LABELS: Record<ProjectTrigger["kind"], string> = {
  "issue-assigned": "Issue assigned to the user",
  "pull-request": "Pull request",
  schedule: "Scheduled check-in",
};

/** The coordinator's wake prompt: identities, states and one-line summaries, never transcripts. */
export function buildCoordinatorWakePrompt(
  changes: readonly ProjectMissionChange[],
  triggers: readonly ProjectTrigger[] = [],
): string {
  const watched = triggers.length
    ? [
        WATCHED_PROMPT_START,
        ...triggers.map((trigger) => `- ${TRIGGER_LABELS[trigger.kind]}: ${trigger.summary}`),
        "",
        "Decide whether each belongs to this project's goal. For one that does, start a mission for it with",
        "stave_start_mission (or tell the user why not); ignore one that does not.",
      ]
    : [];
  if (changes.length === 0) {
    return [...watched, "Do not edit files yourself."].join("\n");
  }
  const lines = changes.map((change) => {
    const state =
      change.stateKey === "awaiting-sign-off"
        ? "waits for the user's sign-off"
        : change.stateKey === "blocked"
          ? "is blocked"
          : change.stateKey === "stuck"
            ? "is stuck"
            : change.stateKey;
    return `- ${change.title} (${change.missionId}) ${state}${change.summary ? `: ${change.summary}` : ""}`;
  });
  return [
    ...(watched.length ? [...watched, ""] : []),
    CHANGED_PROMPT_START,
    ...lines,
    "",
    "Read the reports of the missions that ended with stave_get_mission_report. Then decide the next step:",
    "start the next mission with stave_start_mission, record what the project learned with stave_note_project,",
    "or tell the user what needs them. Do not edit files yourself.",
  ].join("\n");
}

/** A pull request a mission of the project opened, as GitHub reports it now. */
export interface ProjectPullRequestSignal {
  number: number;
  url: string;
  state: "OPEN" | "MERGED" | "CLOSED";
  checks: "SUCCESS" | "FAILURE" | "PENDING" | null;
  reviewDecision: string | null;
  headSha: string | null;
}

/** A trigger with the key its occurrence is remembered by. */
export interface SeenTrigger {
  seenKey: string;
  trigger: ProjectTrigger;
}

/**
 * What a mission's pull request says that the coordinator should hear: it
 * merged, its checks failed, or a reviewer asked for changes — once per head
 * commit, so a new push that fails again is news.
 */
export function pullRequestTriggers(args: {
  missionId: string;
  missionTitle: string;
  pr: ProjectPullRequestSignal;
}): SeenTrigger[] {
  const { pr, missionId } = args;
  const head = pr.headSha ?? "unknown";
  const of = `#${pr.number} of "${args.missionTitle}"`;
  const found: SeenTrigger[] = [];
  const add = (id: string, what: string) =>
    found.push({ seenKey: `pr:${id}`, trigger: { id: `pr:${id}`, kind: "pull-request", summary: `${of} ${what} (${pr.url})` } });
  if (pr.state === "MERGED") add(`${missionId}:merged`, "merged");
  else if (pr.state === "OPEN") {
    if (pr.checks === "FAILURE") add(`${missionId}:checks-failed:${head}`, "has failing checks");
    if (pr.reviewDecision === "CHANGES_REQUESTED") add(`${missionId}:changes-requested:${head}`, "has changes requested");
  }
  return found;
}

/** An issue assigned to the user, as Issues lists it. */
export interface ObservedIssue {
  source: string;
  key: string;
  title: string;
  url: string | null;
  labels: readonly string[];
  project: string | null;
  createdAt: string | null;
}

/** Whether an issue passes a project's filter: empty matches every issue. */
export function issueMatchesFilter(issue: ObservedIssue, filter: string): boolean {
  const needle = filter.trim().toLowerCase();
  if (!needle) return true;
  return [issue.key, issue.title, issue.project ?? "", ...issue.labels].some((value) => value.toLowerCase().includes(needle));
}

export function issueTrigger(issue: ObservedIssue): SeenTrigger {
  const id = `issue:${issue.source}:${issue.key}`;
  return {
    seenKey: id,
    trigger: { id, kind: "issue-assigned", summary: `${issue.key} · ${issue.title}${issue.url ? ` (${issue.url})` : ""}` },
  };
}

