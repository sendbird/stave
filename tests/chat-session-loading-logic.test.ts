import { describe, expect, test } from "bun:test";
import { resolveChatAreaViewMode } from "@/components/session/chat-area.utils";
import { shouldShowConversationLoadingState } from "@/components/session/chat-panel.utils";

describe("chat session loading logic", () => {
  test("prefers a hydration loading state over the new task splash while a project is opening", () => {
    expect(resolveChatAreaViewMode({
      projectPath: "/tmp/stave-project",
      hasHydratedWorkspaces: false,
      hasAnyWorkspace: true,
      hasSelectedWorkspace: true,
      hasSelectedTask: false,
      activeTaskMessageCount: 0,
    })).toBe("hydrating_project");
  });

  test("keeps the regular empty-task mode once workspace hydration is finished", () => {
    expect(resolveChatAreaViewMode({
      projectPath: "/tmp/stave-project",
      hasHydratedWorkspaces: true,
      hasAnyWorkspace: true,
      hasSelectedWorkspace: true,
      hasSelectedTask: false,
      activeTaskMessageCount: 0,
    })).toBe("no_task");
  });

  test("treats persisted-message backfill as a loading conversation state", () => {
    expect(shouldShowConversationLoadingState({
      visibleMessageCount: 0,
      totalMessageCount: 3,
      taskMessagesLoading: true,
    })).toBe(true);
  });

  test("does not show the conversation loader when the task is actually empty", () => {
    expect(shouldShowConversationLoadingState({
      visibleMessageCount: 0,
      totalMessageCount: 0,
      taskMessagesLoading: true,
    })).toBe(false);
  });
});
