import { describe, expect, test } from "bun:test";
import {
  describePaneAnnouncement,
  describePaneTabAccessibleName,
  findActiveTurnPendingInteraction,
  resolvePaneSurfaceTitle,
  resolvePaneTabTaskStatus,
} from "@/components/panes/pane-tab-accessibility";
import {
  describeOverflowedTabs,
  isPaneHeaderCompact,
  PANE_HEADER_COMPACT_MAX_WIDTH,
} from "@/components/panes/pane-header-layout";
import type { ChatMessage } from "@/types/chat";

const state = {
  paneTabMeta: { "task:renamed": { customTitle: "My name" } },
  tasks: [
    { id: "task-shell", title: "Persist sidebar state", provider: "claude-code" as const, updatedAt: "", unread: false },
    { id: "renamed", title: "Original", provider: "codex" as const, updatedAt: "", unread: false },
  ],
  cliSessionTabs: [],
  terminalTabs: [],
  editorTabs: [{ id: "e1", filePath: "/repo/src/app.store.ts", kind: "text" }],
} as unknown as Parameters<typeof resolvePaneSurfaceTitle>[0];

describe("pane tab names", () => {
  test("a tab is called by its title, never its panel id", () => {
    expect(resolvePaneSurfaceTitle(state, { kind: "task", taskId: "task-shell" }, "task:task-shell")).toBe("Persist sidebar state");
    expect(resolvePaneSurfaceTitle(state, { kind: "task", taskId: "renamed" }, "task:renamed")).toBe("My name");
    expect(resolvePaneSurfaceTitle(state, { kind: "editor", editorTabId: "e1" }, "editor:e1")).toBe("app.store.ts");
    expect(resolvePaneSurfaceTitle(state, { kind: "lens", lensSessionId: "l1" }, "lens:l1", { title: "Docs", url: "" })).toBe("Docs");
  });

  test("a task tab's accessible name carries its provider and what its turn waits on", () => {
    expect(describePaneTabAccessibleName({ title: "Persist sidebar state", provider: "Claude", status: "awaitingApproval" }))
      .toBe("Persist sidebar state, Claude, awaiting approval");
    expect(describePaneTabAccessibleName({ title: "Stabilize e2e", provider: "Codex" })).toBe("Stabilize e2e, Codex");
    expect(describePaneTabAccessibleName({ title: "Terminal" })).toBe("Terminal");
  });

  test("status prefers the person-facing wait over working", () => {
    expect(resolvePaneTabTaskStatus({ isResponding: true, isStalled: false, waiting: "approval" })).toBe("awaitingApproval");
    expect(resolvePaneTabTaskStatus({ isResponding: true, isStalled: false, waiting: "user_input" })).toBe("awaitingInput");
    expect(resolvePaneTabTaskStatus({ isResponding: true, isStalled: true, waiting: null })).toBe("stalled");
    expect(resolvePaneTabTaskStatus({ isResponding: true, isStalled: false, waiting: null })).toBe("working");
    expect(resolvePaneTabTaskStatus({ isResponding: false, isStalled: false, waiting: null })).toBeNull();
  });

  test("only the running turn's messages are read for a pending request", () => {
    const message = (id: string, turnId: string, parts: ChatMessage["parts"]) =>
      ({ id, role: "assistant", model: "", providerId: "codex", content: "", turnId, parts }) as ChatMessage;
    const approval = { type: "approval", toolName: "Bash", description: "", requestId: "r", state: "approval-requested" } as const;
    const old = message("m1", "turn-old", [approval]);
    expect(findActiveTurnPendingInteraction([old, message("m2", "turn-now", [])], "turn-now")).toBeNull();
    expect(findActiveTurnPendingInteraction([old, message("m2", "turn-now", [approval])], "turn-now")).toBe("approval");
  });

  test("open and close are announced with the tab's title", () => {
    expect(describePaneAnnouncement({ kind: "open", panel: { id: "task:task-shell" } }, state)).toBe("Opened Persist sidebar state");
    expect(describePaneAnnouncement({ kind: "close", panel: { id: "task:task-shell" } }, state)).toBe("Closed Persist sidebar state");
    expect(describePaneAnnouncement({ kind: "maximize", panel: { id: "task:task-shell" } }, state)).toBeUndefined();
  });
});

describe("pane header layout", () => {
  test("goes compact below the threshold, never for an unmeasured group", () => {
    expect(isPaneHeaderCompact(420)).toBe(true);
    expect(isPaneHeaderCompact(PANE_HEADER_COMPACT_MAX_WIDTH)).toBe(false);
    expect(isPaneHeaderCompact(1093)).toBe(false);
    expect(isPaneHeaderCompact(0)).toBe(false);
  });

  test("names the overflowed-tabs count", () => {
    expect(describeOverflowedTabs({ count: 2, allTasks: true })).toBe("2 more tasks");
    expect(describeOverflowedTabs({ count: 1, allTasks: true })).toBe("1 more task");
    expect(describeOverflowedTabs({ count: 3, allTasks: false })).toBe("3 more tabs");
  });
});
