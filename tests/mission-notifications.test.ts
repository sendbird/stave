import { describe, expect, test } from "bun:test";
import type { MissionDetail } from "../src/lib/missions/api";
import { describeMissionNotification, describeSignOffReminder } from "../src/lib/missions/notifications";
import { buildNotificationToastOptions } from "../src/lib/notifications/notification.utils";
import { APP_NOTIFICATION_KINDS, isMissionAttentionNotificationKind } from "../src/lib/notifications/notification.types";
import { MISSION_NOW, missionDetail, missionFixture, patchCurrent } from "./fixtures/mission-fixtures";

const CONTEXT = { repositoryPath: "/tmp/repo", repositoryName: "repo", workspaceName: "feature", taskTitle: "Billing export" };

function detailWith(status: "awaiting-sign-off" | "blocked" | "stuck" | "running", mission: Partial<MissionDetail["mission"]> = {}) {
  const aggregate = patchCurrent(missionFixture(), { status, detail: status === "blocked" ? "Which plan?" : null });
  return missionDetail({ ...aggregate, mission: { ...aggregate.mission, ...mission } });
}

describe("mission notifications", () => {
  test("a sign-off, a blocker, a stuck stage and the end each notify once per state", () => {
    const signOff = describeMissionNotification(detailWith("awaiting-sign-off"), CONTEXT)!;
    expect(signOff).toMatchObject({
      kind: "mission.sign_off_requested",
      title: "Understand waits for your sign-off",
      body: "Request → PR · Add CSV export to the billing page.",
      workspaceId: "ws-1",
      taskId: "task-1",
      taskTitle: "Billing export",
      dedupeKey: "mission:mission-1:sign-off:understand:1",
    });
    expect(describeMissionNotification(detailWith("blocked"), CONTEXT)).toMatchObject({
      kind: "mission.blocked",
      title: "Understand is blocked",
      payload: { detail: "Which plan?" },
    });
    expect(describeMissionNotification(detailWith("stuck"), CONTEXT)?.kind).toBe("mission.stuck");
    expect(describeMissionNotification(detailWith("running", { state: "completed" }), CONTEXT)).toMatchObject({
      kind: "mission.completed",
      dedupeKey: "mission:mission-1:completed",
    });
  });

  test("work in progress, a pause you chose and a cancel stay quiet", () => {
    expect(describeMissionNotification(detailWith("running"), CONTEXT)).toBeNull();
    expect(
      describeMissionNotification(detailWith("running", { state: "paused", pauseReason: "taken-over", reasonDetail: "x" }), CONTEXT),
    ).toBeNull();
    expect(describeMissionNotification(detailWith("running", { state: "cancelled" }), CONTEXT)).toBeNull();
    expect(
      describeMissionNotification(
        detailWith("running", { state: "paused", pauseReason: "runtime-changed", reasonDetail: "The model changed." }),
        CONTEXT,
      )?.kind,
    ).toBe("mission.blocked");
  });

  test("overdue sign-offs are batched into one reminder per interval", () => {
    const now = new Date(MISSION_NOW.getTime() + 95 * 60_000);
    const old = { detail: detailWith("awaiting-sign-off"), since: MISSION_NOW.toISOString(), taskTitle: "Billing export" };
    const fresh = { ...old, since: new Date(now.getTime() - 5 * 60_000).toISOString(), taskTitle: "Settings form" };
    const one = describeSignOffReminder({ waiting: [old, fresh], now, intervalMinutes: 30 })!;
    expect(one.title).toBe("Still waiting for your sign-off — Billing export");
    expect(one.taskId).toBe("task-1");
    const two = describeSignOffReminder({
      waiting: [old, { ...old, taskTitle: "Header" }],
      now,
      intervalMinutes: 30,
    })!;
    expect(two.title).toBe("2 missions are waiting for your sign-off");
    expect(two.taskId).toBeNull();
    expect(two.dedupeKey).toBe(one.dedupeKey);
    expect(describeSignOffReminder({ waiting: [old], now, intervalMinutes: 0 })).toBeNull();
    expect(describeSignOffReminder({ waiting: [fresh], now, intervalMinutes: 30 })).toBeNull();
  });

  test("mission kinds are part of the one notification kind list and read as toasts", () => {
    expect(APP_NOTIFICATION_KINDS).toContain("mission.sign_off_requested");
    expect(isMissionAttentionNotificationKind("mission.stuck")).toBe(true);
    expect(isMissionAttentionNotificationKind("mission.completed")).toBe(false);
    const toast = buildNotificationToastOptions({
      kind: "mission.blocked",
      title: "Build is blocked",
      payload: { detail: "Which plan?" },
      taskTitle: "Billing export",
      workspaceName: "feature",
    });
    expect(toast).toMatchObject({ tone: "error", title: "Build is blocked", description: "Which plan?" });
  });
});
