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
import type { MissionProposal, Project, ProjectEvent } from "./domain";

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
  coordinatorBusy: boolean;
}

export type ProjectDecision =
  | { action: "wait"; reason: string }
  | { action: "start-proposal"; proposalId: string }
  | { action: "wake-coordinator"; changes: ProjectMissionChange[]; key: string }
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
  if (changes.length > 0) {
    if (observation.coordinatorBusy) return { action: "wait", reason: "The coordinator is in a turn." };
    const key = `project:${project.id}:wake:${changes.map((change) => `${change.missionId}=${change.stateKey}`).sort().join(",")}`;
    return { action: "wake-coordinator", changes, key };
  }
  return { action: "idle" };
}

/** The coordinator's wake prompt: identities, states and one-line summaries, never transcripts. */
export function buildCoordinatorWakePrompt(changes: readonly ProjectMissionChange[]): string {
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
    "Missions of this project changed:",
    ...lines,
    "",
    "Read the reports of the missions that ended with stave_get_mission_report. Then decide the next step:",
    "start the next mission with stave_start_mission, record what the project learned with stave_note_project,",
    "or tell the user what needs them. Do not edit files yourself.",
  ].join("\n");
}
