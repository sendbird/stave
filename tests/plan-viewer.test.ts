import { describe, expect, test } from "bun:test";
import {
  buildPlanViewerContextKey,
  resolvePlanViewerAutoViewState,
  resolvePlanViewerInsets,
  resolvePlanViewerLayout,
  resolvePlanViewerState,
} from "@/components/session/plan-viewer.utils";

describe("resolvePlanViewerState", () => {
  test("shows a completed Claude plan response in the viewer", () => {
    const state = resolvePlanViewerState({
      activeProvider: "claude-code",
      claudePermissionMode: "plan",
      codexPlanMode: false,
      isTurnActive: false,
      latestPlanMessage: {
        role: "assistant",
        providerId: "claude-code",
        isPlanResponse: true,
        isStreaming: false,
        planText: "1. Inspect\n2. Patch",
      },
      lastMessage: {
        role: "assistant",
        providerId: "claude-code",
        isPlanResponse: true,
        isStreaming: false,
        planText: "1. Inspect\n2. Patch",
      },
    });

    expect(state).toEqual({
      planText: "1. Inspect\n2. Patch",
      isPlanPreparing: false,
      isPlanPending: true,
      canReplyToPlan: true,
    });
  });

  test("shows plan viewer for Codex when a plan response exists", () => {
    const state = resolvePlanViewerState({
      activeProvider: "codex",
      claudePermissionMode: "plan",
      codexPlanMode: true,
      isTurnActive: false,
      latestPlanMessage: {
        role: "assistant",
        providerId: "codex",
        isPlanResponse: true,
        isStreaming: false,
        planText: "1. Inspect\n2. Patch",
      },
      lastMessage: {
        role: "assistant",
        providerId: "codex",
        isPlanResponse: true,
        isStreaming: false,
        planText: "1. Inspect\n2. Patch",
      },
    });

    expect(state).toEqual({
      planText: "1. Inspect\n2. Patch",
      isPlanPreparing: false,
      isPlanPending: true,
      canReplyToPlan: true,
    });
  });

  test("shows preparing state for Claude plan mode while a turn is active and no plan yet", () => {
    const state = resolvePlanViewerState({
      activeProvider: "claude-code",
      claudePermissionMode: "plan",
      codexPlanMode: false,
      isTurnActive: true,
      latestPlanMessage: null,
      lastMessage: null,
    });

    expect(state).toEqual({
      planText: "",
      isPlanPreparing: true,
      isPlanPending: false,
      canReplyToPlan: false,
    });
  });

  test("shows preparing state for Codex plan mode while a turn is active and no plan yet", () => {
    const state = resolvePlanViewerState({
      activeProvider: "codex",
      claudePermissionMode: "default",
      codexPlanMode: true,
      isTurnActive: true,
      latestPlanMessage: null,
      lastMessage: null,
    });

    expect(state).toEqual({
      planText: "",
      isPlanPreparing: true,
      isPlanPending: false,
      canReplyToPlan: false,
    });
  });

  test("shows plan as pending (not preparing) when plan_ready arrives before done event", () => {
    // This is the critical fix: plan_ready fires before done, so isTurnActive is still true
    // and isStreaming is still true, but the plan text is available.
    const state = resolvePlanViewerState({
      activeProvider: "claude-code",
      claudePermissionMode: "plan",
      codexPlanMode: false,
      isTurnActive: true,
      latestPlanMessage: {
        role: "assistant",
        providerId: "claude-code",
        isPlanResponse: true,
        isStreaming: true,
        planText: "1. Read the codebase\n2. Make changes",
      },
      lastMessage: {
        role: "assistant",
        providerId: "claude-code",
        isPlanResponse: true,
        isStreaming: true,
        planText: "1. Read the codebase\n2. Make changes",
      },
    });

    expect(state).toEqual({
      planText: "1. Read the codebase\n2. Make changes",
      isPlanPreparing: false,
      isPlanPending: true,
      canReplyToPlan: false,
    });
  });

  test("keeps Codex plan viewer in preparing state until the turn fully completes", () => {
    const state = resolvePlanViewerState({
      activeProvider: "codex",
      claudePermissionMode: "default",
      codexPlanMode: true,
      isTurnActive: true,
      latestPlanMessage: {
        role: "assistant",
        providerId: "codex",
        isPlanResponse: true,
        isStreaming: true,
        planText: "1. Inspect\n2. Patch",
      },
      lastMessage: {
        role: "assistant",
        providerId: "codex",
        isPlanResponse: true,
        isStreaming: true,
        planText: "1. Inspect\n2. Patch",
      },
    });

    expect(state).toEqual({
      planText: "1. Inspect\n2. Patch",
      isPlanPreparing: true,
      isPlanPending: false,
      canReplyToPlan: false,
    });
  });

  test("keeps the viewer open while revising a plan in plan mode", () => {
    const state = resolvePlanViewerState({
      activeProvider: "claude-code",
      claudePermissionMode: "plan",
      codexPlanMode: false,
      isTurnActive: false,
      latestPlanMessage: {
        role: "assistant",
        providerId: "claude-code",
        isPlanResponse: true,
        isStreaming: false,
        planText: "1. Inspect\n2. Patch",
      },
      lastMessage: {
        role: "user",
        providerId: "user",
        isPlanResponse: false,
        isStreaming: false,
        planText: undefined,
      },
    });

    expect(state).toEqual({
      planText: "1. Inspect\n2. Patch",
      isPlanPreparing: false,
      isPlanPending: true,
      canReplyToPlan: true,
    });
  });

  test("hides the inline viewer once the task has moved past plan review", () => {
    const state = resolvePlanViewerState({
      activeProvider: "claude-code",
      claudePermissionMode: "default",
      codexPlanMode: false,
      isTurnActive: false,
      latestPlanMessage: {
        role: "assistant",
        providerId: "claude-code",
        isPlanResponse: true,
        isStreaming: false,
        planText: "1. Inspect\n2. Patch",
      },
      lastMessage: {
        role: "user",
        providerId: "user",
        isPlanResponse: false,
        isStreaming: false,
        planText: undefined,
      },
    });

    expect(state).toEqual({
      planText: "1. Inspect\n2. Patch",
      isPlanPreparing: false,
      isPlanPending: false,
      canReplyToPlan: false,
    });
  });

  test("still shows the viewer when the latest message is the plan response", () => {
    const state = resolvePlanViewerState({
      activeProvider: "claude-code",
      claudePermissionMode: "default",
      codexPlanMode: false,
      isTurnActive: false,
      latestPlanMessage: {
        role: "assistant",
        providerId: "claude-code",
        isPlanResponse: true,
        isStreaming: false,
        planText: "1. Inspect\n2. Patch",
      },
      lastMessage: {
        role: "assistant",
        providerId: "claude-code",
        isPlanResponse: true,
        isStreaming: false,
        planText: "1. Inspect\n2. Patch",
      },
    });

    expect(state).toEqual({
      planText: "1. Inspect\n2. Patch",
      isPlanPreparing: false,
      isPlanPending: true,
      canReplyToPlan: true,
    });
  });

  test("hides the Codex viewer once plan mode is turned off, even if the latest message is a plan", () => {
    const state = resolvePlanViewerState({
      activeProvider: "codex",
      claudePermissionMode: "default",
      codexPlanMode: false,
      isTurnActive: false,
      latestPlanMessage: {
        role: "assistant",
        providerId: "codex",
        isPlanResponse: true,
        isStreaming: false,
        planText: "1. Inspect\n2. Patch",
      },
      lastMessage: {
        role: "assistant",
        providerId: "codex",
        isPlanResponse: true,
        isStreaming: false,
        planText: "1. Inspect\n2. Patch",
      },
    });

    expect(state).toEqual({
      planText: "1. Inspect\n2. Patch",
      isPlanPreparing: false,
      isPlanPending: false,
      canReplyToPlan: false,
    });
  });

  test("stays hidden when no plan mode and no plan response", () => {
    const state = resolvePlanViewerState({
      activeProvider: "claude-code",
      claudePermissionMode: "default",
      codexPlanMode: false,
      isTurnActive: false,
      latestPlanMessage: null,
      lastMessage: {
        role: "assistant",
        providerId: "claude-code",
        isPlanResponse: false,
        isStreaming: false,
        planText: undefined,
      },
    });

    expect(state).toEqual({
      planText: "",
      isPlanPreparing: false,
      isPlanPending: false,
      canReplyToPlan: false,
    });
  });

  test("normalizes raw plan text before showing it in the viewer", () => {
    const state = resolvePlanViewerState({
      activeProvider: "codex",
      claudePermissionMode: "default",
      codexPlanMode: true,
      isTurnActive: false,
      latestPlanMessage: {
        role: "assistant",
        providerId: "codex",
        isPlanResponse: true,
        isStreaming: false,
        planText:
          "...\n\n## Plan\n- Strip commentary\n- Keep only steps\n\nLet me know if you want changes.",
      },
      lastMessage: {
        role: "assistant",
        providerId: "codex",
        isPlanResponse: true,
        isStreaming: false,
        planText:
          "...\n\n## Plan\n- Strip commentary\n- Keep only steps\n\nLet me know if you want changes.",
      },
    });

    expect(state).toEqual({
      planText: "## Plan\n- Strip commentary\n- Keep only steps",
      isPlanPreparing: false,
      isPlanPending: true,
      canReplyToPlan: true,
    });
  });

  test("ignores punctuation-only plan placeholders", () => {
    const state = resolvePlanViewerState({
      activeProvider: "codex",
      claudePermissionMode: "default",
      codexPlanMode: true,
      isTurnActive: false,
      latestPlanMessage: {
        role: "assistant",
        providerId: "codex",
        isPlanResponse: true,
        isStreaming: false,
        planText: "...",
      },
      lastMessage: {
        role: "assistant",
        providerId: "codex",
        isPlanResponse: true,
        isStreaming: false,
        planText: "...",
      },
    });

    expect(state).toEqual({
      planText: "",
      isPlanPreparing: false,
      isPlanPending: false,
      canReplyToPlan: false,
    });
  });
});

describe("resolvePlanViewerInsets", () => {
  test("anchors the viewer to the message pane floor in normal mode", () => {
    expect(
      resolvePlanViewerInsets({
        isExpanded: false,
      }),
    ).toEqual({
      topOffset: null,
      rightOffset: 16,
      bottomOffset: 8,
    });
  });

  test("keeps expanded mode pinned to the full message pane height", () => {
    expect(
      resolvePlanViewerInsets({
        isExpanded: true,
      }),
    ).toEqual({
      topOffset: 12,
      rightOffset: 16,
      bottomOffset: 8,
    });
  });
});

describe("resolvePlanViewerAutoViewState", () => {
  test("minimizes an expanded viewer when replanning starts from an existing plan", () => {
    expect(
      resolvePlanViewerAutoViewState({
        viewState: "expanded",
        isPlanPreparing: true,
        planText: "1. Inspect\n2. Patch",
      }),
    ).toBe("minimized");
  });

  test("keeps the current view state when there is no historical plan text", () => {
    expect(
      resolvePlanViewerAutoViewState({
        viewState: "expanded",
        isPlanPreparing: true,
        planText: "",
      }),
    ).toBe("expanded");
  });
});

describe("buildPlanViewerContextKey", () => {
  test("changes when switching to another workspace task with a visible plan viewer", () => {
    expect(
      buildPlanViewerContextKey({
        activeWorkspaceId: "workspace-alpha",
        activeTaskId: "task-alpha",
        latestPlanMessageId: "plan-alpha",
      }),
    ).not.toBe(
      buildPlanViewerContextKey({
        activeWorkspaceId: "workspace-beta",
        activeTaskId: "task-beta",
        latestPlanMessageId: "plan-beta",
      }),
    );
  });

  test("changes when a new plan response replaces the current one in the same task", () => {
    expect(
      buildPlanViewerContextKey({
        activeWorkspaceId: "workspace-alpha",
        activeTaskId: "task-alpha",
        latestPlanMessageId: "plan-1",
      }),
    ).not.toBe(
      buildPlanViewerContextKey({
        activeWorkspaceId: "workspace-alpha",
        activeTaskId: "task-alpha",
        latestPlanMessageId: "plan-2",
      }),
    );
  });
});

describe("resolvePlanViewerLayout", () => {
  test("anchors the normal viewer to the bottom-right and grows leftward", () => {
    expect(
      resolvePlanViewerLayout({
        viewState: "normal",
      }),
    ).toEqual({
      wrapperClassName: "pointer-events-none absolute z-[35]",
      wrapperStyle: {
        right: 16,
        bottom: 8,
        width: "calc(100% - 32px)",
        maxWidth: 672,
      },
      cardClassName:
        "pointer-events-auto flex min-h-0 flex-col overflow-hidden rounded-xl border border-border/80 bg-card shadow-lg",
    });
  });

  test("anchors the expanded viewer to the same bottom-right origin inside the message pane", () => {
    expect(
      resolvePlanViewerLayout({
        viewState: "expanded",
      }),
    ).toEqual({
      wrapperClassName: "pointer-events-none absolute z-[35]",
      wrapperStyle: {
        right: 16,
        bottom: 8,
        width: "calc(100% - 32px)",
        height: "max(0px, calc(100% - 20px))",
      },
      cardClassName:
        "pointer-events-auto flex min-h-0 flex-col overflow-hidden rounded-xl border border-border/80 bg-card shadow-lg h-full w-full",
    });
  });

  test("keeps the dragged minimized viewer at its explicit position", () => {
    expect(
      resolvePlanViewerLayout({
        viewState: "minimized",
        dragPos: {
          x: 120,
          y: 48,
        },
      }),
    ).toEqual({
      wrapperClassName: "pointer-events-none absolute z-[35]",
      wrapperStyle: {
        top: 48,
        left: 120,
      },
      cardClassName:
        "pointer-events-auto flex min-h-0 flex-col overflow-hidden rounded-xl border border-border/80 bg-card shadow-lg w-72",
    });
  });
});
