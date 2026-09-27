import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { MissionChangedEvent, MissionCommandResponse, MissionDetail } from "../src/lib/missions/api";
import { isOlderMissionDetail } from "../src/lib/missions/mission-view";
import {
  dropEndedMissions,
  ENDED_MISSION_RETENTION_MS,
  useFleetMissionsStore,
} from "../src/store/fleet-missions-store";
import {
  isNewlyStartedMission,
  missionTaskKey,
  selectMissionFailure,
  selectMissionTurnDivider,
  useMissionsStore,
} from "../src/store/missions-store";
import { MISSION_NOW, missionDetail, missionEvent, missionFixture } from "./fixtures/mission-fixtures";

const originalWindow = globalThis.window;
const at = (minutes: number) => new Date(MISSION_NOW.getTime() + minutes * 60_000).toISOString();

/** A mission detail as read at `minutes` past the start, with the given events. */
function readAt(
  minutes: number,
  events: MissionDetail["events"] = [],
  overrides: { id?: string; state?: MissionDetail["mission"]["state"]; createdAt?: string } = {},
): MissionDetail {
  const aggregate = missionFixture({ id: overrides.id ?? "mission-1" });
  return missionDetail(
    {
      ...aggregate,
      mission: {
        ...aggregate.mission,
        state: overrides.state ?? aggregate.mission.state,
        createdAt: overrides.createdAt ?? aggregate.mission.createdAt,
        updatedAt: at(minutes),
      },
    },
    events,
  );
}

/** Installs `window.api.missions` with the given answers. */
function installMissionsApi(api: Record<string, (...args: never[]) => Promise<unknown>>) {
  Object.assign(globalThis, { window: { api: { missions: { subscribeChanged: () => () => {}, ...api } } } });
}

function resetStores() {
  useMissionsStore.setState({
    workspaceId: "ws-1",
    loadedWorkspaceId: "ws-1",
    missionIdByTask: {},
    missionIdsByTask: {},
    details: {},
    dividersByMission: {},
    failureByMission: {},
    pendingByMission: {},
  });
  useFleetMissionsStore.setState({ details: {}, loaded: false });
}

beforeEach(resetStores);
afterEach(() => {
  Object.assign(globalThis, { window: originalWindow });
  resetStores();
});

describe("mission details in the renderer", () => {
  test("an older read of a mission is recognized, with equal times settled by the last event", () => {
    const newer = readAt(5, [missionEvent("mission-started", {}), missionEvent("stage-completed", {})]);
    const older = readAt(3, newer.events.slice(0, 1));
    expect(isOlderMissionDetail(older, newer)).toBe(true);
    expect(isOlderMissionDetail(newer, older)).toBe(false);
    expect(isOlderMissionDetail(older, undefined)).toBe(false);
    // Same time: fewer events is older; the same read replaces itself (it may carry the report).
    expect(isOlderMissionDetail(readAt(5, newer.events.slice(0, 1)), newer)).toBe(true);
    expect(isOlderMissionDetail(readAt(5, newer.events), newer)).toBe(false);
    expect(isOlderMissionDetail(readAt(1, [], { id: "mission-2" }), newer)).toBe(false);
  });

  test("a response that arrives after a newer one does not replace it, in either store", async () => {
    const newer = readAt(5);
    const older = readAt(3);
    installMissionsApi({
      signOff: async () => ({ ok: true, mission: newer }) satisfies MissionCommandResponse,
      get: async () => ({ ok: true, mission: older }) satisfies MissionCommandResponse,
    });
    await useMissionsStore.getState().runCommand("signOff", { missionId: "mission-1", stageId: "understand", attempt: 1 });
    await useMissionsStore.getState().refreshMission("mission-1");
    expect(useMissionsStore.getState().details["mission-1"]).toBe(newer);

    useFleetMissionsStore.setState({ details: { "mission-1": newer } });
    await useFleetMissionsStore.getState().refresh("mission-1");
    expect(useFleetMissionsStore.getState().details["mission-1"]).toBe(newer);
  });

  test("a failed command belongs to the stage it was about, not to the next stage's card", async () => {
    installMissionsApi({
      signOff: async () => ({ ok: false, mission: null, code: "failed", message: "gh is signed out." }),
      pause: async () => ({ ok: false, mission: null, code: "failed", message: "Could not pause." }),
      get: async () => ({ ok: true, mission: readAt(1) }),
    });
    const store = useMissionsStore.getState();
    await store.runCommand("signOff", { missionId: "mission-1", stageId: "understand", attempt: 1 });
    let state = useMissionsStore.getState();
    expect(selectMissionFailure(state, "mission-1", "understand:1")).toBe("gh is signed out.");
    expect(selectMissionFailure(state, "mission-1", "build:1")).toBeNull();
    expect(selectMissionFailure(state, "mission-1", "understand:2")).toBeNull();
    expect(selectMissionFailure(state, "mission-1", null)).toBe("gh is signed out.");

    // A mission-wide command is scoped to the stage the mission was on.
    await store.refreshMission("mission-1");
    await store.runCommand("pause", { missionId: "mission-1" });
    state = useMissionsStore.getState();
    expect(state.failureByMission["mission-1"]?.stageKey).toBe("understand:1");
    expect(selectMissionFailure(state, "mission-1", "build:1")).toBeNull();
  });

  test("an earlier mission's transcript dividers stay once a second mission starts on the task", async () => {
    const first = readAt(
      10,
      [
        missionEvent("mission-started", {}),
        missionEvent("turn-started", { stageId: "understand", attempt: 1, reason: "stage-start" }, { idempotencyKey: "m:understand:1:turn:1" }),
        missionEvent("turn-linked", { stageId: "understand", attempt: 1, turnId: "turn-1" }, { idempotencyKey: "m:understand:1:turn:1:linked" }),
      ],
      { state: "cancelled" },
    );
    const second = readAt(
      20,
      [
        missionEvent("mission-started", {}),
        missionEvent("turn-started", { stageId: "understand", attempt: 1, reason: "stage-start" }, { idempotencyKey: "n:understand:1:turn:1" }),
        missionEvent("turn-linked", { stageId: "understand", attempt: 1, turnId: "turn-9" }, { idempotencyKey: "n:understand:1:turn:1:linked" }),
      ],
      { id: "mission-2", createdAt: at(15) },
    );
    const byId: Record<string, MissionDetail> = { "mission-1": first, "mission-2": second };
    installMissionsApi({ get: async ({ missionId }: { missionId: string }) => ({ ok: true, mission: byId[missionId] }) });
    await useMissionsStore.getState().refreshMission("mission-1");
    await useMissionsStore.getState().refreshMission("mission-2");
    const state = useMissionsStore.getState();
    expect(state.missionIdByTask[missionTaskKey("ws-1", "task-1")]).toBe("mission-2");
    expect(selectMissionTurnDivider(state, "ws-1", "task-1", "turn-1")).toBe("Stage 1 · Understand — mission started");
    expect(selectMissionTurnDivider(state, "ws-1", "task-1", "turn-9")).toBe("Stage 1 · Understand — mission started");
    expect(selectMissionTurnDivider(state, "ws-1", "task-1", "turn-unknown")).toBeNull();
  });

  test("a change event while the workspace is still loading does not count as a mission that just started", () => {
    const event: MissionChangedEvent = {
      missionId: "mission-1",
      workspaceId: "ws-1",
      leadTaskId: "task-1",
      state: "running",
      currentStageIndex: 0,
      updatedAt: at(1),
    };
    const loaded = { workspaceId: "ws-1", loadedWorkspaceId: "ws-1", missionIdByTask: {} };
    expect(isNewlyStartedMission(loaded, event)).toBe(true);
    expect(isNewlyStartedMission({ ...loaded, loadedWorkspaceId: null }, event)).toBe(false);
    expect(isNewlyStartedMission({ ...loaded, workspaceId: "ws-2", loadedWorkspaceId: "ws-2" }, event)).toBe(false);
    expect(
      isNewlyStartedMission({ ...loaded, missionIdByTask: { [missionTaskKey("ws-1", "task-1")]: "mission-1" } }, event),
    ).toBe(false);
    expect(isNewlyStartedMission(loaded, { ...event, state: "completed" })).toBe(false);
  });

  test("Fleet keeps an ended mission for half an hour after it ends, and active ones always", () => {
    const ended = readAt(0, [], { id: "ended", state: "stopped" });
    const running = readAt(0, [], { id: "running" });
    const details = { ended, running };
    const end = MISSION_NOW.getTime();
    expect(dropEndedMissions(details, end + ENDED_MISSION_RETENTION_MS)).toBe(details);
    expect(Object.keys(dropEndedMissions(details, end + ENDED_MISSION_RETENTION_MS + 1))).toEqual(["running"]);

    useFleetMissionsStore.setState({ details });
    useFleetMissionsStore.getState().pruneEnded(end + 2 * ENDED_MISSION_RETENTION_MS);
    expect(Object.keys(useFleetMissionsStore.getState().details)).toEqual(["running"]);
  });
});
