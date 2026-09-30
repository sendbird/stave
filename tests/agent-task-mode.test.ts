import { describe, expect, test } from "bun:test";
import { fixedAgentModelOption } from "@/components/ai-elements/prompt-input-agent-control";
import type { ModelSelectorOption } from "@/components/ai-elements/model-selector.utils";
import type { AgentAssignment } from "@/lib/agents/assign";
import { duplicateAgent } from "@/lib/agents/library";
import { getBuiltinAgent } from "@/lib/agents/starters";
import {
  DEFAULT_TASK_MODE,
  normalizeTaskMode,
  planComposerAgentChoice,
  selectableMainAgents,
  switchWidensPermission,
} from "@/lib/agents/task-mode";
import { indexAssignmentsByTask } from "@/store/agent-assignments-store";

describe("task mode", () => {
  test("defaults to model-based tasks and reads only known modes", () => {
    expect(DEFAULT_TASK_MODE).toBe("model");
    expect(normalizeTaskMode("agentic")).toBe("agentic");
    expect(normalizeTaskMode("model")).toBe("model");
    expect(normalizeTaskMode(undefined)).toBe("model");
    expect(normalizeTaskMode("autonomous")).toBe("model");
  });

  test("the composer offers active main agents, never worker-only presets", () => {
    const custom = duplicateAgent(getBuiltinAgent("implementer")!, []);
    const archived = { ...duplicateAgent(getBuiltinAgent("planner")!, []), id: "old", archived: true };
    const ids = selectableMainAgents([custom, archived]).map((agent) => agent.id);
    expect(ids).toContain(custom.id);
    expect(ids).toContain("researcher");
    expect(ids).not.toContain("old");
    expect(ids).not.toContain("scout");
  });

  test("a switch that widens permission is confirmed; the default agent is the widest", () => {
    const researcher = getBuiltinAgent("researcher")!; // read-only
    const implementer = getBuiltinAgent("implementer")!; // auto
    expect(switchWidensPermission({ from: researcher, to: implementer })).toBe(true);
    expect(switchWidensPermission({ from: implementer, to: researcher })).toBe(false);
    expect(switchWidensPermission({ from: researcher, to: null })).toBe(true);
    expect(switchWidensPermission({ from: null, to: researcher })).toBe(false);

    const current = { agentConfigId: researcher.id, permission: researcher.permission };
    expect(planComposerAgentChoice({ current, next: researcher })).toBe("keep");
    expect(planComposerAgentChoice({ current, next: implementer })).toBe("confirm");
    expect(planComposerAgentChoice({ current: null, next: researcher })).toBe("apply");
    expect(planComposerAgentChoice({ current: null, next: null })).toBe("keep");
  });

  test("a fixed-model agent maps to the composer's matching option", () => {
    const options = [
      { key: "a", providerId: "codex", model: "gpt-5.5", label: "GPT", available: true },
      { key: "b", providerId: "claude-code", model: "claude-opus-5", label: "Opus", available: true },
    ] as ModelSelectorOption[];
    const fixed = {
      ...getBuiltinAgent("implementer")!,
      model: { mode: "fixed" as const, providerId: "claude-code" as const, model: "claude-opus-5" },
    };
    expect(fixedAgentModelOption(fixed, options)?.key).toBe("b");
    expect(fixedAgentModelOption(getBuiltinAgent("implementer")!, options)).toBeNull();
  });

  test("a task whose newest assignment ended has no agent, even with an older row", () => {
    const row = (id: string, extra: Partial<AgentAssignment> = {}) =>
      ({
        id,
        taskId: "task-1",
        agentConfigId: "implementer",
        agentName: "Implementer",
        agent: getBuiltinAgent("implementer")!,
        agentContentHash: "h",
        received: [],
        support: [],
        state: "started",
        providerId: "claude-code",
        model: null,
        workspaceMode: "new-worktree",
        branch: null,
        detail: null,
        createdAt: "",
        updatedAt: "",
        ...extra,
      }) as unknown as AgentAssignment;
    expect(indexAssignmentsByTask([row("new", { endedAt: "now" }), row("old")])["task-1"]).toBeUndefined();
    const current = indexAssignmentsByTask([row("new"), row("old", { endedAt: "then" })])["task-1"];
    expect(current?.assignmentId).toBe("new");
    expect(current?.agentPermission).toBe("auto");
  });
});

describe("model picker agents", () => {
  const panelHtml = async (disabled: boolean) => {
    const { createElement } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { ModelPickerAgentPanel } = await import("@/components/ai-elements/prompt-input-agent-control");
    const choice = {
      current: null,
      choices: [getBuiltinAgent("researcher")!],
      pending: null,
      busy: false,
      choose: async () => true,
      confirm: async () => true,
      cancel: () => undefined,
    };
    return renderToStaticMarkup(createElement(ModelPickerAgentPanel, { choice, disabled, onDone: () => undefined }));
  };

  test("the Agents tab offers No agent first, then main agents", async () => {
    const html = await panelHtml(false);
    expect(html).toContain('data-testid="composer-agent-none"');
    expect(html).toContain('data-testid="composer-agent-researcher"');
    expect(html.indexOf("composer-agent-none")).toBeLessThan(html.indexOf("composer-agent-researcher"));
    expect(html).not.toContain("composer-agent-locked");
  });

  test("a running or blocked turn locks the choice", async () => {
    expect(await panelHtml(true)).toContain('data-testid="composer-agent-locked"');
  });

  test("the trigger names the task's agent only while one runs it", async () => {
    const { taskAgentIdentity } = await import("@/components/ai-elements/prompt-input-agent-control");
    expect(taskAgentIdentity(null)).toBeNull();
    const researcher = getBuiltinAgent("researcher")!;
    const identity = taskAgentIdentity({
      agentConfigId: researcher.id,
      agentName: researcher.name,
      agentAppearance: researcher.appearance,
    } as Parameters<typeof taskAgentIdentity>[0]);
    expect(identity?.name).toBe(researcher.name);
  });

  test("the runtime bar reports no Worker while an agent runs the task", async () => {
    const { describeWorkerRuntimeSummary } = await import("@/components/session/chat-input.runtime");
    const base = {
      providerId: "claude-code" as const,
      primaryModel: "claude-opus-5",
      overrides: undefined,
      settingsConfig: undefined,
      settingsEnabled: false,
    };
    expect(describeWorkerRuntimeSummary({ ...base, runsAsAgent: true })).toBe("Off while an agent runs the task");
    expect(describeWorkerRuntimeSummary({ ...base, runsAsAgent: false })).not.toBe("Off while an agent runs the task");
  });
});
