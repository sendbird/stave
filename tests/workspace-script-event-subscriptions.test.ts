import { describe, expect, test } from "bun:test";
import {
  addWorkspaceScriptEventSubscription,
  createWorkspaceScriptEventSubscriptionRegistry,
  listWorkspaceScriptEventSubscriberIds,
  removeAllWorkspaceScriptEventSubscriptions,
  removeWorkspaceScriptEventSubscription,
} from "../electron/main/ipc/workspace-script-event-subscriptions";

describe("workspace script event subscriptions", () => {
  test("routes events only to subscribers of the matching workspace", () => {
    const registry = createWorkspaceScriptEventSubscriptionRegistry();

    addWorkspaceScriptEventSubscription({
      registry,
      contentsId: 1,
      workspaceId: "workspace-a",
    });
    addWorkspaceScriptEventSubscription({
      registry,
      contentsId: 2,
      workspaceId: "workspace-b",
    });
    addWorkspaceScriptEventSubscription({
      registry,
      contentsId: 3,
      workspaceId: "workspace-a",
    });

    expect(listWorkspaceScriptEventSubscriberIds({
      registry,
      workspaceId: "workspace-a",
    })).toEqual([1, 3]);
    expect(listWorkspaceScriptEventSubscriberIds({
      registry,
      workspaceId: "workspace-b",
    })).toEqual([2]);
  });

  test("removes workspace subscriptions without affecting other workspaces", () => {
    const registry = createWorkspaceScriptEventSubscriptionRegistry();

    addWorkspaceScriptEventSubscription({
      registry,
      contentsId: 1,
      workspaceId: "workspace-a",
    });
    addWorkspaceScriptEventSubscription({
      registry,
      contentsId: 1,
      workspaceId: "workspace-b",
    });

    removeWorkspaceScriptEventSubscription({
      registry,
      contentsId: 1,
      workspaceId: "workspace-a",
    });

    expect(listWorkspaceScriptEventSubscriberIds({
      registry,
      workspaceId: "workspace-a",
    })).toEqual([]);
    expect(listWorkspaceScriptEventSubscriberIds({
      registry,
      workspaceId: "workspace-b",
    })).toEqual([1]);
  });

  test("clears every subscription when a window is destroyed", () => {
    const registry = createWorkspaceScriptEventSubscriptionRegistry();

    addWorkspaceScriptEventSubscription({
      registry,
      contentsId: 1,
      workspaceId: "workspace-a",
    });
    addWorkspaceScriptEventSubscription({
      registry,
      contentsId: 1,
      workspaceId: "workspace-b",
    });

    removeAllWorkspaceScriptEventSubscriptions({
      registry,
      contentsId: 1,
    });

    expect(listWorkspaceScriptEventSubscriberIds({
      registry,
      workspaceId: "workspace-a",
    })).toEqual([]);
    expect(listWorkspaceScriptEventSubscriberIds({
      registry,
      workspaceId: "workspace-b",
    })).toEqual([]);
  });
});
