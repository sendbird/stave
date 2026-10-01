import { describe, expect, test } from "bun:test";
import { fixedAgentModelOption } from "@/components/ai-elements/prompt-input-agent-control";
import type { ModelSelectorOption } from "@/components/ai-elements/model-selector.utils";
import { planPickerRail } from "@/components/ai-elements/model-effort-selector.utils";
import type { AgentAssignment } from "@/lib/agents/assign";
import { duplicateAgent } from "@/lib/agents/library";
import {
  awaitsFirstAgentTurn,
  fixedModelOf,
  matchAgents,
  planSelectorChoice,
  resolveAgentModelRoute,
  selectableMainAgents,
  switchWidensPermission,
} from "@/lib/agents/selector-choice";
import { getBuiltinAgent } from "@/lib/agents/starters";
import { buildAutoRoutingSelectionOverrides, buildModelSelectionRuntimeOverrides } from "@/lib/providers/model-effort";
import { indexAssignmentsByTask } from "@/store/agent-assignments-store";
import { defaultSettings } from "@/store/app-settings";

const implementer = getBuiltinAgent("implementer")!; // permission: auto
const researcher = getBuiltinAgent("researcher")!; // permission: read-only
const fixedImplementer = {
  ...implementer,
  model: { mode: "fixed" as const, providerId: "claude-code" as const, model: "claude-opus-5" },
};

describe("selectable agents", () => {
  test("the selector offers active main agents, never worker-only presets", () => {
    const custom = duplicateAgent(implementer, []);
    const archived = { ...duplicateAgent(getBuiltinAgent("planner")!, []), id: "old", archived: true };
    const ids = selectableMainAgents([custom, archived]).map((agent) => agent.id);
    expect(ids).toContain(custom.id);
    expect(ids).toContain("researcher");
    expect(ids).not.toContain("old");
    expect(ids).not.toContain("scout");
  });

  test("one search box filters agents by every word of their name or description", () => {
    const agents = [implementer, researcher];
    expect(matchAgents(agents, "").map((agent) => agent.id)).toEqual(["implementer", "researcher"]);
    expect(matchAgents(agents, "  RESEARCH ").map((agent) => agent.id)).toEqual(["researcher"]);
    expect(matchAgents(agents, "research zzz")).toEqual([]);
  });
});

describe("choosing in the selector", () => {
  const offered = { fixedModelAvailable: false, autoAvailable: true };
  const runningImplementer = { agentConfigId: implementer.id, permission: implementer.permission };
  const runningResearcher = { agentConfigId: researcher.id, permission: researcher.permission };

  test("a model in the Models section is Chat: it releases the agent and is the model", () => {
    expect(planSelectorChoice({ choice: { kind: "model" }, current: runningImplementer, ...offered })).toEqual({
      assignment: "release",
      draft: "picked",
    });
  });

  test("a model on a task without an agent is today's pick, with nothing to release", () => {
    expect(planSelectorChoice({ choice: { kind: "model" }, current: null, ...offered })).toEqual({
      assignment: "keep",
      draft: "picked",
    });
  });

  test("an agent is recorded and Stave Auto routes it: the picker is not moved to a model", () => {
    expect(planSelectorChoice({ choice: { kind: "agent", agent: implementer }, current: null, ...offered })).toEqual({
      assignment: "record",
      draft: "auto",
    });
  });

  test("an agent with a fixed model uses it as its default route", () => {
    expect(
      planSelectorChoice({
        choice: { kind: "agent", agent: fixedImplementer },
        current: null,
        fixedModelAvailable: true,
        autoAvailable: true,
      }),
    ).toEqual({ assignment: "record", draft: "agent-fixed" });
  });

  test("with Stave Auto off an agent keeps the task's model", () => {
    expect(
      planSelectorChoice({
        choice: { kind: "agent", agent: implementer },
        current: null,
        fixedModelAvailable: false,
        autoAvailable: false,
      }),
    ).toEqual({ assignment: "record", draft: "unchanged" });
  });

  test("choosing the agent that already runs the task changes nothing, a pin included", () => {
    expect(planSelectorChoice({ choice: { kind: "agent", agent: implementer }, current: runningImplementer, ...offered })).toEqual({
      assignment: "keep",
      draft: "unchanged",
    });
  });

  test("moving to another agent that may do more is confirmed first", () => {
    expect(switchWidensPermission({ from: researcher, to: implementer })).toBe(true);
    expect(switchWidensPermission({ from: implementer, to: researcher })).toBe(false);
    expect(switchWidensPermission({ from: researcher, to: null })).toBe(true);
    expect(switchWidensPermission({ from: null, to: researcher })).toBe(false);
    expect(planSelectorChoice({ choice: { kind: "agent", agent: implementer }, current: runningResearcher, ...offered })).toEqual({
      assignment: "confirm",
      draft: "auto",
    });
    expect(planSelectorChoice({ choice: { kind: "agent", agent: researcher }, current: runningImplementer, ...offered })).toEqual({
      assignment: "record",
      draft: "auto",
    });
  });

  test("a pin never releases the agent; Back to Auto returns to its own route", () => {
    expect(planSelectorChoice({ choice: { kind: "pin" }, current: runningImplementer, ...offered })).toEqual({
      assignment: "keep",
      draft: "picked",
    });
    expect(planSelectorChoice({ choice: { kind: "unpin" }, current: runningImplementer, ...offered })).toEqual({
      assignment: "keep",
      draft: "auto",
    });
    expect(
      planSelectorChoice({
        choice: { kind: "unpin" },
        current: runningImplementer,
        fixedModelAvailable: true,
        autoAvailable: true,
      }),
    ).toEqual({ assignment: "keep", draft: "agent-fixed" });
  });
});

describe("the model route of an agent task", () => {
  const claude = (model: string) => ({ providerId: "claude-code" as const, model });

  test("Stave Auto without a model is auto", () => {
    expect(resolveAgentModelRoute({ fixed: null, autoRouting: true, ...claude("") })).toBe("auto");
  });

  test("the agent's own fixed model is not a pin; provider-only fixed models match any model of that provider", () => {
    const fixed = fixedModelOf(fixedImplementer);
    expect(fixed).toEqual({ providerId: "claude-code", model: "claude-opus-5" });
    expect(resolveAgentModelRoute({ fixed, autoRouting: false, ...claude("claude-opus-5") })).toBe("agent-fixed");
    expect(resolveAgentModelRoute({ fixed, autoRouting: false, ...claude("claude-sonnet-5") })).toBe("pinned");
    expect(resolveAgentModelRoute({ fixed, autoRouting: false, providerId: "codex", model: "claude-opus-5" })).toBe("pinned");
    const providerOnly = { providerId: "claude-code" as const };
    expect(resolveAgentModelRoute({ fixed: providerOnly, autoRouting: false, ...claude("claude-sonnet-5") })).toBe("agent-fixed");
    expect(fixedModelOf(implementer)).toBeNull();
  });

  test("any other model in the draft is a pin", () => {
    expect(resolveAgentModelRoute({ fixed: null, autoRouting: false, ...claude("claude-opus-5") })).toBe("pinned");
  });

  /** Plays a choice's draft step on a draft, the way the composer does. */
  function play(draft: ReturnType<typeof planSelectorChoice>["draft"], overrides: Record<string, unknown>, picked?: string) {
    if (draft === "auto") return buildAutoRoutingSelectionOverrides({ runtimeOverrides: overrides, planMode: false });
    if (draft === "agent-fixed" || draft === "picked") {
      return buildModelSelectionRuntimeOverrides({
        runtimeOverrides: overrides,
        settings: defaultSettings,
        providerId: "claude-code",
        model: draft === "agent-fixed" ? "claude-opus-5" : (picked ?? "claude-sonnet-5"),
      });
    }
    return overrides;
  }
  const routeOf = (agent: typeof implementer | typeof fixedImplementer, overrides: Record<string, unknown>) =>
    resolveAgentModelRoute({
      fixed: fixedModelOf(agent),
      autoRouting: overrides.autoRouting === true,
      providerId: "claude-code",
      model: String(overrides.model ?? ""),
    });
  const common = { fixedModelAvailable: false, autoAvailable: true };

  test("pin > fixed model > Stave Auto, and every step back lands on the agent's own route", () => {
    // An auto agent: Auto -> pinned -> Auto.
    let draft: Record<string, unknown> = { model: "claude-sonnet-5", modelProviderId: "claude-code", autoRouting: false };
    draft = play(planSelectorChoice({ choice: { kind: "agent", agent: implementer }, current: null, ...common }).draft, draft);
    expect(draft.autoRouting).toBe(true);
    expect(draft.model).toBeUndefined();
    expect(routeOf(implementer, draft)).toBe("auto");
    draft = play(planSelectorChoice({ choice: { kind: "pin" }, current: null, ...common }).draft, draft, "claude-opus-5");
    expect(draft.autoRouting).toBe(false);
    expect(draft.model).toBe("claude-opus-5");
    expect(routeOf(implementer, draft)).toBe("pinned");
    draft = play(planSelectorChoice({ choice: { kind: "unpin" }, current: null, ...common }).draft, draft);
    expect(routeOf(implementer, draft)).toBe("auto");

    // A fixed-model agent: fixed -> pinned elsewhere -> fixed again.
    const fixedCommon = { fixedModelAvailable: true, autoAvailable: true };
    draft = play(planSelectorChoice({ choice: { kind: "agent", agent: fixedImplementer }, current: null, ...fixedCommon }).draft, {});
    expect(routeOf(fixedImplementer, draft)).toBe("agent-fixed");
    draft = play(planSelectorChoice({ choice: { kind: "pin" }, current: null, ...fixedCommon }).draft, draft, "claude-sonnet-5");
    expect(routeOf(fixedImplementer, draft)).toBe("pinned");
    draft = play(planSelectorChoice({ choice: { kind: "unpin" }, current: null, ...fixedCommon }).draft, draft);
    expect(routeOf(fixedImplementer, draft)).toBe("agent-fixed");
  });
});

describe("the selector rail", () => {
  test("Models come first, then Stave Auto, then Agents, each group headed", () => {
    expect(planPickerRail({ providerIds: ["claude-code", "codex"], hasAuto: true, hasAgents: true })).toEqual([
      { kind: "provider", value: "claude-code", heading: "Models" },
      { kind: "provider", value: "codex" },
      { kind: "auto", value: "auto" },
      { kind: "agents", value: "agents", heading: "Agents" },
    ]);
  });

  test("a models-only rail (the pin picker) has no headings, no Auto and no Agents", () => {
    expect(planPickerRail({ providerIds: ["claude-code", "codex"], hasAuto: false, hasAgents: false })).toEqual([
      { kind: "provider", value: "claude-code" },
      { kind: "provider", value: "codex" },
    ]);
  });
});

describe("the first send in Agent mode", () => {
  const turn = (assignmentId: string) => ({ agentProvenance: { assignmentId } });

  test("assigns until a turn has run under the assignment, then it is Send", () => {
    expect(awaitsFirstAgentTurn({ assignmentId: undefined, messages: [{}, {}] })).toBe(false);
    expect(awaitsFirstAgentTurn({ assignmentId: "a1", messages: undefined })).toBe(true);
    expect(awaitsFirstAgentTurn({ assignmentId: "a1", messages: [{}, {}] })).toBe(true);
    expect(awaitsFirstAgentTurn({ assignmentId: "a1", messages: [{}, turn("a1")] })).toBe(false);
  });

  test("a turn of an earlier assignment does not count: switching agents assigns again", () => {
    expect(awaitsFirstAgentTurn({ assignmentId: "a2", messages: [turn("a1"), {}] })).toBe(true);
  });
});

describe("agent assignments in the renderer", () => {
  const row = (id: string, extra: Partial<AgentAssignment> = {}) =>
    ({
      id,
      taskId: "task-1",
      agentConfigId: "implementer",
      agentName: "Implementer",
      agent: implementer,
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

  test("a task whose newest assignment ended has no agent, even with an older row", () => {
    expect(indexAssignmentsByTask([row("new", { endedAt: "now" }), row("old")])["task-1"]).toBeUndefined();
    const current = indexAssignmentsByTask([row("new"), row("old", { endedAt: "then" })])["task-1"];
    expect(current?.assignmentId).toBe("new");
    expect(current?.agentPermission).toBe("auto");
  });

  test("the entry carries the agent's fixed model so the trigger can tell it from a pin", () => {
    expect(indexAssignmentsByTask([row("a")])["task-1"]?.agentFixedModel).toBeNull();
    expect(
      indexAssignmentsByTask([row("b", { agent: fixedImplementer })])["task-1"]?.agentFixedModel,
    ).toEqual({ providerId: "claude-code", model: "claude-opus-5" });
  });
});

describe("a fixed-model agent in the composer", () => {
  test("maps to the composer's matching option", () => {
    const options = [
      { key: "a", providerId: "codex", model: "gpt-5.5", label: "GPT", available: true },
      { key: "b", providerId: "claude-code", model: "claude-opus-5", label: "Opus", available: true },
    ] as ModelSelectorOption[];
    expect(fixedAgentModelOption(fixedImplementer, options)?.key).toBe("b");
    expect(fixedAgentModelOption(implementer, options)).toBeNull();
  });
});
