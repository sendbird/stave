import { describe, expect, test } from "bun:test";
import {
  resolveChatAreaViewMode,
  resolveHydratingRepositoryCopy,
} from "@/components/session/chat-area.utils";

describe("chat area loading copy", () => {
  test("uses legacy cleanup messaging while persistence bootstrap is purging", () => {
    const copy = resolveHydratingRepositoryCopy({
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
    const copy = resolveHydratingRepositoryCopy({
      persistenceBootstrapPhase: "idle",
      persistenceBootstrapMessage: "",
    });

    expect(copy).toEqual({
      title: "Opening workspace",
      description: "Loading tasks and recent conversation state for this repository.",
    });
  });
});

describe("chat area view mode", () => {
  test("reports hydrating_project while workspaces are still hydrating", () => {
    expect(
      resolveChatAreaViewMode({
        repositoryPath: "/tmp/project",
        hasHydratedWorkspaces: false,
        hasAnyWorkspace: false,
        hasSelectedWorkspace: false,
        hasSelectedTask: false,
        activeTaskMessageCount: 0,
      }),
    ).toBe("hydrating_project");
  });

  test("a new task's first prompt replaces the start screen before it is a message", () => {
    const base = {
      repositoryPath: "/tmp/project",
      hasHydratedWorkspaces: true,
      hasAnyWorkspace: true,
      hasSelectedWorkspace: true,
      hasSelectedTask: true,
      activeTaskMessageCount: 0,
    };
    expect(resolveChatAreaViewMode(base)).toBe("empty_task");
    // Waiting on Auto's classifier, or failed to send: the transcript draws it.
    expect(resolveChatAreaViewMode({ ...base, hasUnsentPrompt: true })).toBe(
      "conversation",
    );
  });
});
