import { describe, expect, test } from "bun:test";
import { selectOrphanedNotificationWorkspaceIds } from "../electron/persistence/notification-orphans";

describe("selectOrphanedNotificationWorkspaceIds", () => {
  test("selects workspaces missing from every authoritative source", () => {
    expect(
      selectOrphanedNotificationWorkspaceIds({
        notificationWorkspaceIds: ["ws-live", "ws-gone"],
        workspaceRowIds: ["ws-live"],
        registryWorkspaceIds: ["ws-live"],
      }),
    ).toEqual(["ws-gone"]);
  });

  test("keeps a workspace the registry still lists but has no shell row yet", () => {
    expect(
      selectOrphanedNotificationWorkspaceIds({
        notificationWorkspaceIds: ["ws-registry-only"],
        workspaceRowIds: [],
        registryWorkspaceIds: ["ws-registry-only"],
      }),
    ).toEqual([]);
  });

  test("keeps a host-created workspace the registry has not caught up with", () => {
    expect(
      selectOrphanedNotificationWorkspaceIds({
        notificationWorkspaceIds: ["ws-host-created"],
        workspaceRowIds: ["ws-host-created"],
        registryWorkspaceIds: [],
      }),
    ).toEqual([]);
  });

  test("deletes nothing when no workspace is known at all", () => {
    // An empty inventory cannot be told apart from a store that has not
    // finished initialising, and guessing wrong destroys live requests.
    expect(
      selectOrphanedNotificationWorkspaceIds({
        notificationWorkspaceIds: ["ws-a", "ws-b"],
        workspaceRowIds: [],
        registryWorkspaceIds: [],
      }),
    ).toEqual([]);
  });

  test("normalizes blank and duplicate ids on both sides", () => {
    expect(
      selectOrphanedNotificationWorkspaceIds({
        notificationWorkspaceIds: ["ws-gone", " ws-gone ", "  ", "ws-live"],
        workspaceRowIds: [" ws-live "],
        registryWorkspaceIds: ["", "ws-live"],
      }),
    ).toEqual(["ws-gone"]);
  });
});
