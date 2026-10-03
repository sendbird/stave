import { describe, expect, test } from "bun:test";
import {
  composerFixedModel,
  createAgentChoiceActions,
  optionForFixedModel,
  type AgentChoiceContext,
  type ModelSelectArgs,
} from "@/components/ai-elements/agent-choice-actions";
import type { ModelSelectorOption } from "@/components/ai-elements/model-selector.utils";
import { RecordTaskAgentInputSchema, type AgentAssignment } from "@/lib/agents/assign";
import { AgentConfigSchema, type AgentConfig } from "@/lib/agents/schema";
import { resolveAgentModelRoute } from "@/lib/agents/selector-choice";
import { getDefaultModelForProvider } from "@/lib/providers/model-catalog";
import { getBuiltinAgent } from "@/lib/agents/starters";
import { indexAssignmentsByTask, type TaskAgent } from "@/store/agent-assignments-store";

/**
 * What each choice in the selector sends to the host (record or release the
 * task's agent) and writes to the draft, with the host and the draft faked.
 */

const TASK_ID = "task-1";

const AUTO: ModelSelectorOption = {
  key: "auto",
  providerId: "claude-code",
  model: "",
  label: "Auto · Balanced",
  isAuto: true,
  available: true,
};
const OPUS: ModelSelectorOption = {
  key: "claude-code:claude-opus-5",
  providerId: "claude-code",
  model: "claude-opus-5",
  label: "Opus 5",
  available: true,
};
const SONNET: ModelSelectorOption = { ...OPUS, key: "claude-code:claude-sonnet-5", model: "claude-sonnet-5", label: "Sonnet 5" };
const CODEX: ModelSelectorOption = { key: "codex:gpt-5.6", providerId: "codex", model: "gpt-5.6", label: "GPT-5.6", available: true };

const implementer = getBuiltinAgent("implementer")!;
const researcher = getBuiltinAgent("researcher")!;
const fixedAgent: AgentConfig = {
  ...implementer,
  model: { mode: "fixed", providerId: "claude-code", model: "claude-opus-5" },
};

function assignment(agent: AgentConfig, extra: Partial<AgentAssignment> = {}): AgentAssignment {
  return {
    id: `assignment-${agent.id}`,
    taskId: TASK_ID,
    agentConfigId: agent.id,
    agentName: agent.name,
    agent,
    agentContentHash: "hash",
    received: [],
    support: [],
    state: "started",
    providerId: "claude-code",
    model: null,
    workspaceMode: "same-workspace",
    branch: null,
    detail: null,
    createdAt: "",
    updatedAt: "",
    ...extra,
  } as unknown as AgentAssignment;
}

function setup(
  args: {
    running?: AgentConfig;
    selectedModel?: ModelSelectorOption;
    modelOptions?: ModelSelectorOption[];
    hasTurns?: boolean;
    recordFails?: boolean;
    releaseFails?: boolean;
    repositoryPath?: string | null;
  } = {},
) {
  const record: Record<string, unknown>[] = [];
  const release: Record<string, unknown>[] = [];
  const draft: ModelSelectArgs[] = [];
  const state: { current: TaskAgent | null; pending: AgentConfig | null; busy: boolean[]; reloads: number } = {
    current: args.running ? (indexAssignmentsByTask([assignment(args.running)])[TASK_ID] ?? null) : null,
    pending: null,
    busy: [],
    reloads: 0,
  };
  const context = (): AgentChoiceContext => ({
    taskId: TASK_ID,
    selectedModel: args.selectedModel ?? OPUS,
    modelOptions: args.modelOptions ?? [AUTO, OPUS, SONNET, CODEX],
    hasTurns: args.hasTurns ?? false,
    current: state.current,
    repositoryPath: args.repositoryPath === undefined ? "/tmp/repository" : args.repositoryPath,
    workspaceId: "workspace-1",
    taskTitle: "Fix the overflow",
    standards: undefined,
    api: {
      recordTask: async (input) => {
        record.push(input);
        return args.recordFails
          ? { ok: false, code: "failed", message: "no" }
          : { ok: true, value: assignment(input.agent as AgentConfig, { id: "recorded" }) };
      },
      releaseTask: async (input) => {
        release.push(input);
        return args.releaseFails
          ? { ok: false, code: "failed", message: "no" }
          : { ok: true, value: assignment(implementer, { endedAt: "now" }) };
      },
    },
    onModelSelect: (selection) => draft.push(selection),
    applyAssignment: (row) => {
      state.current = row.endedAt ? null : (indexAssignmentsByTask([row])[TASK_ID] ?? null);
    },
    reload: () => {
      state.reloads += 1;
    },
    setPending: (pending) => {
      state.pending = pending?.agent ?? null;
    },
    setBusy: (busy) => state.busy.push(busy),
  });
  return { actions: createAgentChoiceActions(context), record, release, draft, state };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("a model in the Models section", () => {
  test("on a Chat task is today's pick: the model at once, nothing sent to the host", () => {
    const { actions, draft, release } = setup();
    actions.selectModel({ selection: SONNET });
    expect(draft).toEqual([{ selection: SONNET }]);
    expect(release).toEqual([]);
  });

  test("releases the task's agent first, then runs on that model", async () => {
    const { actions, draft, release, state } = setup({ running: implementer, selectedModel: AUTO });
    actions.selectModel({ selection: SONNET });
    // The model waits for the host: it must never leave the task pinned under the agent.
    expect(draft).toEqual([]);
    await settle();
    expect(release).toEqual([{ taskId: TASK_ID }]);
    expect(draft).toEqual([{ selection: SONNET }]);
    expect(state.current).toBeNull();
  });

  test("keeps the draft as it is when the agent could not be released", async () => {
    const { actions, draft, release, state } = setup({ running: implementer, selectedModel: AUTO, releaseFails: true });
    actions.selectModel({ selection: SONNET });
    await settle();
    expect(release).toHaveLength(1);
    expect(draft).toEqual([]);
    expect(state.current?.agentConfigId).toBe("implementer");
  });
});

describe("an agent in the Agents section", () => {
  test("is recorded without a model and Stave Auto routes it: the picker is not moved", async () => {
    const { actions, draft, record, release, state } = setup({ selectedModel: SONNET });
    expect(await actions.choose(researcher)).toBe(true);
    expect(record).toHaveLength(1);
    expect(record[0]).toMatchObject({
      taskId: TASK_ID,
      workspaceId: "workspace-1",
      repositoryPath: "/tmp/repository",
      providerId: "claude-code",
      model: null,
    });
    expect(draft).toEqual([{ selection: AUTO }]);
    expect(state.current?.agentConfigId).toBe("researcher");
    expect(state.reloads).toBe(1);
    expect(release).toEqual([]);
    expect(state.busy).toEqual([true, false]);
  });

  test("with a fixed model uses it as the default route", async () => {
    const { actions, draft, record } = setup({ selectedModel: SONNET });
    expect(await actions.choose(fixedAgent)).toBe(true);
    expect(record[0]).toMatchObject({ providerId: "claude-code", model: "claude-opus-5" });
    expect(draft).toEqual([{ selection: OPUS }]);
  });

  test("a fixed model on another provider is left to the user once the task has turns", async () => {
    const codexAgent: AgentConfig = { ...implementer, model: { mode: "fixed", providerId: "codex", model: "gpt-5.6" } };
    const fresh = setup({ selectedModel: SONNET });
    await fresh.actions.choose(codexAgent);
    expect(fresh.draft).toEqual([{ selection: CODEX }]);
    const started = setup({ selectedModel: SONNET, hasTurns: true });
    await started.actions.choose(codexAgent);
    expect(started.draft).toEqual([{ selection: AUTO }]);
    expect(started.record[0]).toMatchObject({ providerId: "claude-code", model: null });
  });

  test("with Stave Auto off keeps the task's model and writes nothing to the draft", async () => {
    const { actions, draft, record } = setup({
      selectedModel: SONNET,
      modelOptions: [{ ...AUTO, available: false }, OPUS, SONNET],
    });
    expect(await actions.choose(researcher)).toBe(true);
    expect(record[0]).toMatchObject({ providerId: "claude-code", model: "claude-sonnet-5" });
    expect(draft).toEqual([]);
  });

  test("changes nothing for the agent that already runs the task", async () => {
    const { actions, draft, record } = setup({ running: implementer, selectedModel: OPUS });
    expect(await actions.choose(implementer)).toBe(true);
    expect(record).toEqual([]);
    expect(draft).toEqual([]);
  });

  test("waits for a confirm when it may do more than the running agent", async () => {
    const { actions, draft, record, state } = setup({ running: researcher, selectedModel: AUTO });
    expect(await actions.choose(implementer)).toBe(false);
    expect(state.pending?.id).toBe("implementer");
    expect(record).toEqual([]);
    expect(draft).toEqual([]);
    // Confirming applies it from the next turn.
    expect(await actions.apply(implementer)).toBe(true);
    expect(record).toHaveLength(1);
    expect(draft).toEqual([{ selection: AUTO }]);
    expect(state.pending).toBeNull();
  });

  test("a failed record leaves the draft and the task alone", async () => {
    const { actions, draft, record, state } = setup({ selectedModel: SONNET, recordFails: true });
    expect(await actions.choose(researcher)).toBe(false);
    expect(record).toHaveLength(1);
    expect(draft).toEqual([]);
    expect(state.current).toBeNull();
    expect(state.busy).toEqual([true, false]);
  });

  test("needs an open repository", async () => {
    const { actions, record, draft } = setup({ repositoryPath: null });
    expect(await actions.choose(researcher)).toBe(false);
    expect(record).toEqual([]);
    expect(draft).toEqual([]);
  });
});

describe("the pin", () => {
  test("a pinned model goes to the draft and never touches the agent", () => {
    const { actions, draft, release, record, state } = setup({ running: implementer, selectedModel: AUTO });
    actions.pin({ selection: OPUS, effort: "high" });
    expect(draft).toEqual([{ selection: OPUS, effort: "high" }]);
    expect(release).toEqual([]);
    expect(record).toEqual([]);
    expect(state.current?.agentConfigId).toBe("implementer");
  });

  test("Back to Auto returns an auto agent to Stave Auto and a fixed agent to its model", () => {
    const auto = setup({ running: implementer, selectedModel: OPUS });
    auto.actions.unpin();
    expect(auto.draft).toEqual([{ selection: AUTO }]);
    const fixed = setup({ running: fixedAgent, selectedModel: SONNET });
    fixed.actions.unpin();
    expect(fixed.draft).toEqual([{ selection: OPUS }]);
  });

  test("with Stave Auto off there is nothing to go back to", () => {
    const { actions, draft } = setup({
      running: implementer,
      selectedModel: OPUS,
      modelOptions: [{ ...AUTO, available: false }, OPUS],
    });
    actions.unpin();
    expect(draft).toEqual([]);
  });
});

describe("an agent saved as a fixed provider with no model", () => {
  /**
   * `Plan, build and verify` as the playbooks migration saved it in 0.23.0:
   * the playbook editor had filled in Claude to store a permission, so the
   * agent is a fixed provider without a model. The editor's "Provider
   * default" saves the same shape.
   */
  const savedPlaybookAgent = AgentConfigSchema.parse({
    ...implementer,
    id: "playbook-playbook_plan_build_verify",
    source: "custom",
    name: "Plan, build and verify",
    description: "Deliver the outcome in the assignment as a verified change, reported with its evidence and risks.",
    model: { mode: "fixed", providerId: "claude-code" },
    permission: "auto",
    workspace: "same-workspace",
    usableAs: ["primary"],
    canCall: undefined,
    workflow: [
      { id: "plan", title: "Plan", kind: "ai", role: "plan", instruction: "Define checkable criteria.", doneWhen: "Criteria are reported." },
      { id: "verify", title: "Verify", kind: "ai", instruction: "Run the relevant checks.", doneWhen: "The checks pass." },
    ],
    checkIns: "plan-and-publishing",
  });
  const DEFAULT_SONNET: ModelSelectorOption = { ...SONNET, isDefault: true };

  test("runs on that provider's default model, never on Stave Auto, and its record passes the host's check", async () => {
    // Stave Auto's option comes first and carries the task's provider, with no model.
    const { actions, draft, record } = setup({ selectedModel: CODEX, modelOptions: [AUTO, OPUS, DEFAULT_SONNET, CODEX] });
    expect(await actions.choose(savedPlaybookAgent)).toBe(true);
    expect(record[0]).toMatchObject({ providerId: "claude-code", model: "claude-sonnet-5" });
    expect(RecordTaskAgentInputSchema.safeParse(record[0]).success).toBe(true);
    expect(draft).toEqual([{ selection: DEFAULT_SONNET }]);
  });

  test("Stave Auto's blank model never stands in for a fixed provider", () => {
    expect(optionForFixedModel({ providerId: "claude-code" }, [AUTO, OPUS, SONNET])).toBe(OPUS);
    expect(optionForFixedModel({ providerId: "claude-code" }, [AUTO])).toBeNull();
    expect(optionForFixedModel({ providerId: "claude-code", model: "claude-sonnet-5" }, [AUTO, OPUS, SONNET])).toBe(SONNET);
  });

  test("the provider's default model comes before the option its runtime marks default", () => {
    const defaultModel = getDefaultModelForProvider({ providerId: "claude-code" });
    const CATALOG_DEFAULT: ModelSelectorOption = { ...OPUS, key: `claude-code:${defaultModel}`, model: defaultModel };
    expect(optionForFixedModel({ providerId: "claude-code" }, [AUTO, DEFAULT_SONNET, CATALOG_DEFAULT])).toBe(CATALOG_DEFAULT);
  });

  test("only the model it runs on is its own: another model of its provider is a pin that Back to its model undoes", () => {
    const options = [AUTO, OPUS, DEFAULT_SONNET, CODEX];
    const fixed = composerFixedModel({ providerId: "claude-code" }, options);
    expect(fixed).toEqual({ providerId: "claude-code", model: "claude-sonnet-5" });
    const route = (model: string) => resolveAgentModelRoute({ fixed, autoRouting: false, providerId: "claude-code", model });
    expect(route("claude-sonnet-5")).toBe("agent-fixed");
    expect(route("claude-opus-5")).toBe("pinned");
    // A model the agent names, or no offer to move to, leaves it as it is.
    expect(composerFixedModel({ providerId: "claude-code", model: "claude-opus-5" }, options)).toEqual({
      providerId: "claude-code",
      model: "claude-opus-5",
    });
    expect(composerFixedModel({ providerId: "claude-code" }, [AUTO, CODEX])).toEqual({ providerId: "claude-code" });

    const { actions, draft } = setup({ running: savedPlaybookAgent, selectedModel: OPUS, modelOptions: options });
    actions.unpin();
    expect(draft).toEqual([{ selection: DEFAULT_SONNET }]);
  });

  test("with only Stave Auto on offer it is recorded without a model and routes", async () => {
    const { actions, draft, record } = setup({ selectedModel: AUTO, modelOptions: [AUTO, CODEX] });
    expect(await actions.choose(savedPlaybookAgent)).toBe(true);
    expect(record[0]).toMatchObject({ providerId: "claude-code", model: null });
    expect(RecordTaskAgentInputSchema.safeParse(record[0]).success).toBe(true);
    expect(draft).toEqual([{ selection: AUTO }]);
  });
});
