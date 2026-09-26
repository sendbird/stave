/**
 * One source of automatic turns per task.
 *
 * Wake-ups and missions both start turns on a task nobody is typing in. Two of
 * them on one task would race each other's turns, so at most one supervisor
 * entry owns a task's automatic turns at a time, and a mission outranks a
 * wake-up: while a mission runs, the task's wake-up pauses with
 * `mission-active` and resumes on its own when the mission ends.
 *
 * Boundary statement (taxonomy): at most one supervisor entry starts automatic
 * turns on a task at a time.
 *
 * Pure. Relative imports only, like `wake-up-policy.ts`, which the host
 * service bundles.
 */

export type AutomaticTurnOwner =
  | { kind: "mission"; missionId: string }
  | { kind: "wake-up"; wakeUpId: string }
  | null;

export interface AutomaticTurnCandidates {
  /** The task's running or paused mission, if any. */
  activeMission: { id: string } | null;
  /** The task's wake-up, if any, with its state. */
  wakeUp: { id: string; state: "scheduled" | "paused" | "stopped" } | null;
}

export function resolveAutomaticTurnOwner(
  candidates: AutomaticTurnCandidates,
): AutomaticTurnOwner {
  if (candidates.activeMission) {
    return { kind: "mission", missionId: candidates.activeMission.id };
  }
  if (candidates.wakeUp && candidates.wakeUp.state === "scheduled") {
    return { kind: "wake-up", wakeUpId: candidates.wakeUp.id };
  }
  return null;
}

export const MISSION_ACTIVE_WAKE_UP_DETAIL =
  "A mission is running on this task. This wake-up resumes when the mission ends.";

export const MISSION_ACTIVE_WAKE_UP_REFUSAL =
  "This task is running a mission, which starts its turns. Add a wake-up after the mission ends.";

export const SECOND_MISSION_REFUSAL =
  "This task is already running a mission. Cancel it or wait for it to end before starting another.";

/** The sentence a wake-up create, update or resume is refused with, if any. */
export function refuseWakeUpForMission(
  activeMission: { id: string } | null,
): string | null {
  return activeMission ? MISSION_ACTIVE_WAKE_UP_REFUSAL : null;
}
