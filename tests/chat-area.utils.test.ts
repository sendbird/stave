import { describe, expect, test } from "bun:test";
import {
  resolveChatAreaViewMode,
  resolveHydratingProjectCopy,
} from "@/components/session/chat-area.utils";

describe("chat area loading copy", () => {
  test("uses legacy cleanup messaging while persistence bootstrap is purging", () => {
    const copy = resolveHydratingProjectCopy({
      persistenceBootstrapPhase: "purging-legacy-turn-journal",
      persistenceBootstrapMessage:
        "Cleaning up legacy workspace data from a previous version. This only runs once.",
    });

    expect(copy).toEqual({
      title: "Preparing local data",
      description:
        "Cleaning up legacy workspace data from a previous version. This only runs once.",
    });
  });

  test("uses default workspace opening copy when no bootstrap cleanup is active", () => {
    const copy = resolveHydratingProjectCopy({
      persistenceBootstrapPhase: "idle",
      persistenceBootstrapMessage: "",
    });

    expect(copy).toEqual({
      title: "Opening workspace",
      description: "Loading tasks and recent conversation state for this project.",
    });
  });
});

describe("chat area view mode", () => {
  test("reports hydrating_project while workspaces are still hydrating", () => {
    expect(
      resolveChatAreaViewMode({
        projectPath: "/tmp/project",
        hasHydratedWorkspaces: false,
        hasAnyWorkspace: false,
        hasSelectedWorkspace: false,
        hasSelectedTask: false,
        activeTaskMessageCount: 0,
      }),
    ).toBe("hydrating_project");
  });
});
