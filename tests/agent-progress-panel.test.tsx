import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applyAppLocale } from "@/i18n";
import { AgentProgressView } from "@/components/agent-progress/AgentProgressView";
import { childTargetFromStep } from "@/components/agent-progress/agent-progress-targets";
import { mergeTaskMessages } from "@/components/agent-progress/use-task-messages";
import type { AgentProgress, AgentStep } from "@/lib/agent-progress";
import { useAgentProgressPanelStore } from "@/store/agent-progress-panel-store";
import { useAppStore } from "@/store/app.store";
import type { ChatMessage } from "@/types/chat";

function step(id: string, kind: AgentStep["kind"], status: AgentStep["status"], words: string, extra: Partial<AgentStep> = {}): AgentStep {
  return { id, kind, doing: `${words}ing`, done: `${words}ed`, status, ...extra };
}

function progress(overrides: Partial<AgentProgress> = {}): AgentProgress {
  return {
    id: "agent-1",
    source: "subagent",
    title: "Map the auth flow",
    kindLabel: "Explore",
    parent: { label: "Fix login", taskId: "task-1" },
    state: "working",
    facts: { model: "claude-haiku-4-5", startedAt: Date.now() - 65_000, steps: 3 },
    ask: "Map how login works.",
    steps: [
      step("a", "tool", "done", "Read"),
      step("b", "tool", "error", "Grep"),
      step("c", "thinking", "done", "Think"),
      step("d", "tool", "running", "Edit"),
      step("say", "text", "done", "Found it", { text: "The session check lives in auth.ts." }),
    ],
    readOnly: true,
    ...overrides,
  };
}

const render = (props: Parameters<typeof AgentProgressView>[0]) => renderToStaticMarkup(createElement(AgentProgressView, props));

afterEach(() => {
  applyAppLocale("en");
});

describe("agent progress view", () => {
  test("a running agent shows its parent, facts, now line and folded steps with running and failed rows kept", () => {
    const html = render({ progress: progress({ now: step("d", "tool", "running", "Edit") }), onOpenParent: () => {}, onClose: () => {} });
    expect(html).toContain("Sub-agent of Fix login");
    expect(html).toContain("Map the auth flow");
    expect(html).toMatch(/data-fact="state"[^>]*>Working</);
    expect(html).toContain('data-fact="kind">Explore<');
    expect(html).toContain('data-fact="steps">3 steps<');
    expect(html).toContain('data-testid="agent-progress-now"');
    expect(html).toContain("Editing");
    // Four calls and thoughts fold into one block; the failed and running rows stay out.
    expect(html).toContain("4 steps");
    const pinned = html.split('data-testid="agent-step-pinned"')[1] ?? "";
    expect(pinned).toContain('data-step-id="b"');
    expect(pinned).toContain('data-step-id="d"');
    expect(pinned).not.toContain('data-step-id="a"');
    // The agent's words stand alone, after the block, and the ask comes first.
    expect(html.indexOf("Map how login works.")).toBeLessThan(html.indexOf("4 steps"));
    expect(html.indexOf("4 steps")).toBeLessThan(html.indexOf("The session check lives in auth.ts."));
  });

  test("a finished agent shows its answer at the end and no now line", () => {
    const html = render({ progress: progress({ state: "ready", facts: { startedAt: 0, endedAt: 90_000, steps: 1 }, result: "Login uses a cookie session.", steps: [step("a", "tool", "done", "Read")] }) });
    expect(html).not.toContain('data-testid="agent-progress-now"');
    expect(html).toContain('data-testid="agent-progress-answer"');
    expect(html).toContain("1m 30s");
    expect(html.indexOf("Read")).toBeLessThan(html.indexOf("Login uses a cookie session."));
  });

  test("a failed agent says why it ended", () => {
    const html = render({ progress: progress({ state: "failed", error: "The build broke.", steps: [] }) });
    expect(html).toContain("Ended without an answer");
    expect(html).toContain("The build broke.");
  });

  test("a nested agent shows the way back instead of its parent link, and child rows open", () => {
    const html = render({
      progress: progress({ steps: [step("child", "subagent", "running", "Start", { child: { kind: "subagent", title: "Run the tests", toolUseId: "t9" } })] }),
      back: { label: "Map the auth flow", onBack: () => {} },
      onOpenChild: () => {},
    });
    expect(html).toContain("Back to Map the auth flow");
    expect(html).not.toContain("Sub-agent of");
    expect(html).toContain('aria-label="Open Run the tests"');
  });

  test("Korean copy", () => {
    applyAppLocale("ko");
    const html = render({ progress: progress(), onOpenParent: () => {} });
    expect(html).toContain("Fix login의 하위 에이전트");
    expect(html).toContain("단계 4개");
    expect(html).toContain("받은 지시");
  });
});

describe("agent panel targets", () => {
  test("a subagent step opens in the task that holds its call; a delegated step from the task that delegated it", () => {
    expect(childTargetFromStep(
      step("s", "subagent", "running", "Start", { child: { kind: "subagent", title: "Tests", toolUseId: "t1", agentId: "a1", providerId: "claude-code" } }),
      { taskId: "task-1", workspaceId: "ws-1" },
    )).toMatchObject({ kind: "subagent", parentTaskId: "task-1", parentWorkspaceId: "ws-1", toolUseId: "t1", agentId: "a1", title: "Tests", snapshot: { title: "Tests", outcome: { status: "running" } } });
    expect(childTargetFromStep(
      step("d", "subagent", "done", "Delegate", { child: { kind: "delegated-task", title: "Fix", delegatedTaskId: "child", delegationKey: "fix" } }),
      { taskId: "task-1" },
    )).toMatchObject({ kind: "delegated-task", parentTaskId: "task-1", delegationKey: "fix", delegatedTaskId: "child" });
    expect(childTargetFromStep(step("x", "tool", "done", "Read"), { taskId: "task-1" })).toBeNull();
  });

  test("saved pages merge around the live copy without reordering", () => {
    const message = (id: string): ChatMessage => ({ id, role: "assistant", model: "m", providerId: "codex", content: id, parts: [] });
    const ids = (messages: ChatMessage[]) => messages.map((entry) => entry.id);
    expect(ids(mergeTaskMessages([message("1"), message("2"), message("3")], [message("2"), message("3"), message("4")]))).toEqual(["1", "2", "3", "4"]);
    expect(ids(mergeTaskMessages([message("3")], [message("1"), message("2"), message("3")]))).toEqual(["1", "2", "3"]);
    expect(ids(mergeTaskMessages([message("1")], []))).toEqual(["1"]);
  });
});

describe("agent panel store", () => {
  beforeEach(() => {
    useAgentProgressPanelStore.setState({ stack: [], returnTo: null });
    useAppStore.getState().setLayout({ patch: { sidebarOverlayVisible: true, sidebarOverlayTab: "task" } });
  });

  test("opening shows the Agent panel and closing returns to the panel that was open", () => {
    const store = useAgentProgressPanelStore.getState();
    store.open({ kind: "subagent", parentTaskId: "task-1", toolUseId: "t1", title: "Map" });
    expect(useAppStore.getState().layout).toMatchObject({ sidebarOverlayVisible: true, sidebarOverlayTab: "agent" });
    store.push({ kind: "subagent", parentTaskId: "task-1", toolUseId: "t2", title: "Nested" });
    expect(useAgentProgressPanelStore.getState().stack).toHaveLength(2);
    // Opening the same agent again does not stack it twice.
    store.push({ kind: "subagent", parentTaskId: "task-1", toolUseId: "t2", title: "Nested" });
    expect(useAgentProgressPanelStore.getState().stack).toHaveLength(2);
    store.back();
    expect(useAgentProgressPanelStore.getState().stack.map((target) => target.title)).toEqual(["Map"]);
    store.close();
    expect(useAgentProgressPanelStore.getState().stack).toEqual([]);
    expect(useAppStore.getState().layout).toMatchObject({ sidebarOverlayVisible: true, sidebarOverlayTab: "task" });
  });

  test("a new View starts a fresh stack and keeps where to return", () => {
    const store = useAgentProgressPanelStore.getState();
    store.open({ kind: "subagent", parentTaskId: "task-1", toolUseId: "t1" });
    store.push({ kind: "subagent", parentTaskId: "task-1", toolUseId: "t2" });
    store.open({ kind: "delegated-task", parentTaskId: "task-1", delegationKey: "fix" });
    expect(useAgentProgressPanelStore.getState().stack).toHaveLength(1);
    store.close();
    expect(useAppStore.getState().layout.sidebarOverlayTab).toBe("task");
  });
});
