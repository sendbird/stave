import { describe, expect, test } from "bun:test";
import { attachClaudeWorkerExecutionMetadata, buildClaudeWorkerAgents } from "../electron/providers/claude-sdk-runtime";
import {
  buildCodexWorkerConfigOverrides,
  buildCodexDeveloperInstructions,
  buildCodexInstructionProfileKey,
  resolveCodexWorkerProfile,
} from "../electron/providers/codex-runtime-config";
import { buildCodexThreadResumeParams } from "../electron/providers/codex-app-server-params";
import {
  WORKER_AGENT_NAME,
  WORKER_AUTO_VALUE,
  DEFAULT_WORKER_PRESET_ID,
  getWorkerPreset,
  resolveWorkerProfile,
  type WorkerRuntimeIntent,
} from "@/lib/providers/worker-mode";
import type { ProviderRuntimeOptions } from "@/lib/providers/provider.types";

function intent(overrides: Partial<WorkerRuntimeIntent> = {}) {
  return {
    mode: "task-executor" as const,
    presetId: DEFAULT_WORKER_PRESET_ID,
    workerModel: WORKER_AUTO_VALUE,
    workerEffort: WORKER_AUTO_VALUE,
    ...overrides,
  } satisfies WorkerRuntimeIntent;
}

describe("Claude worker agent registration", () => {
  test("registers one named agent with the resolved model and effort", () => {
    const agents = buildClaudeWorkerAgents({
      runtimeOptions: {
        model: "claude-opus-5",
        workerIntent: intent({
          workerModel: "claude-sonnet-5",
          workerEffort: "high",
        }),
      } satisfies ProviderRuntimeOptions,
      permissionMode: "default",
    });
    expect(agents).toBeDefined();
    expect(Object.keys(agents!)).toEqual([WORKER_AGENT_NAME]);
    const agent = agents![WORKER_AGENT_NAME]!;
    expect(agent.model).toBe("claude-sonnet-5");
    expect(agent.effort).toBe("high");
    expect(agent.description).toBeTruthy();
    expect(agent.prompt).toBeTruthy();
  });

  test("omits effort for a model that rejects the field", () => {
    const agents = buildClaudeWorkerAgents({
      runtimeOptions: {
        model: "claude-opus-5",
        workerIntent: intent({
          workerModel: "claude-haiku-4-5",
          workerEffort: "max",
        }),
      },
      permissionMode: "default",
    });
    expect(agents).toBeDefined();
    expect("effort" in agents![WORKER_AGENT_NAME]!).toBe(false);
  });

  test("never sets background, so the turn cannot end waiting on a worker", () => {
    const agents = buildClaudeWorkerAgents({
      runtimeOptions: { model: "claude-opus-5", workerIntent: intent() },
      permissionMode: "default",
    });
    expect(agents![WORKER_AGENT_NAME]!.background).toBeUndefined();
  });

  test("inherits the parent permission mode so plan mode cannot escalate", () => {
    const agents = buildClaudeWorkerAgents({
      runtimeOptions: { model: "claude-opus-5", workerIntent: intent() },
      permissionMode: "plan",
    });
    expect(agents![WORKER_AGENT_NAME]!.permissionMode).toBe("plan");
  });

  test("carries the preset tool allowlist", () => {
    const agents = buildClaudeWorkerAgents({
      runtimeOptions: {
        model: "claude-opus-5",
        workerIntent: intent({ presetId: "scout" }),
      },
      permissionMode: "default",
    });
    expect(agents![WORKER_AGENT_NAME]!.tools).toEqual([
      ...getWorkerPreset("scout").tools!,
    ]);
  });

  test("returns undefined with no intent, keeping the solo path untouched", () => {
    expect(
      buildClaudeWorkerAgents({
        runtimeOptions: { model: "claude-opus-5" },
        permissionMode: "default",
      }),
    ).toBeUndefined();
  });

  test("returns undefined for an ineligible primary rather than degrading", () => {
    expect(
      buildClaudeWorkerAgents({
        runtimeOptions: { model: "claude-haiku-4-5", workerIntent: intent() },
        permissionMode: "default",
      }),
    ).toBeUndefined();
  });

  test("attributes only the registered worker tool call", () => {
    const resolution = resolveWorkerProfile({
      providerId: "claude-code", primaryModel: "claude-opus-5", intent: intent(),
    });
    if (resolution.status !== "ready") throw new Error("expected worker profile");
    const events = attachClaudeWorkerExecutionMetadata({
      profile: resolution.profile,
      events: [
        { type: "tool", toolUseId: "worker", toolName: "Agent", input: JSON.stringify({ subagent_type: WORKER_AGENT_NAME }), state: "input-available" },
        { type: "tool", toolUseId: "explore", toolName: "Agent", input: JSON.stringify({ subagent_type: "Explore" }), state: "input-available" },
      ],
    });
    expect(events[0]).toHaveProperty("workerExecution.workerModel", "claude-sonnet-5");
    expect(events[1]).not.toHaveProperty("workerExecution");
  });
});

describe("Codex worker config overrides", () => {
  test("pins the worker model, effort, concurrency and depth", () => {
    const config = buildCodexWorkerConfigOverrides({
      runtimeOptions: {
        model: "gpt-5.6-sol",
        workerIntent: intent({
          workerModel: "gpt-5.6-terra",
          workerEffort: "max",
        }),
      },
    });
    // Exact key names verified against codex-cli 0.145.0's `AgentsToml`.
    expect(config).toEqual({
      "agents.default_subagent_model": "gpt-5.6-terra",
      "agents.default_subagent_reasoning_effort": "max",
      "agents.max_concurrent_threads_per_session": 2,
      "agents.max_depth": 1,
    });
  });

  test("passes through an effort supported by the worker model", () => {
    const config = buildCodexWorkerConfigOverrides({
      runtimeOptions: {
        model: "gpt-5.6-sol",
        workerIntent: intent({
          workerModel: "gpt-5.6-terra",
          workerEffort: "ultra",
        }),
      },
    });
    expect(config["agents.default_subagent_reasoning_effort"]).toBe("ultra");
  });

  test("emits nothing when Worker mode is off", () => {
    expect(
      buildCodexWorkerConfigOverrides({
        runtimeOptions: { model: "gpt-5.6-sol" },
      }),
    ).toEqual({});
  });

  test("emits nothing for an ineligible primary", () => {
    expect(
      buildCodexWorkerConfigOverrides({
        runtimeOptions: { model: "gpt-5.6-luna", workerIntent: intent() },
      }),
    ).toEqual({});
    expect(
      resolveCodexWorkerProfile({
        runtimeOptions: { model: "gpt-5.6-luna", workerIntent: intent() },
      }),
    ).toBeNull();
  });
});

describe("Codex worker is suppressed on secondary read-only runs", () => {
  const runtimeOptions = {
    model: "gpt-5.6-sol",
    workerIntent: intent({ workerModel: "gpt-5.6-terra" }),
  } satisfies ProviderRuntimeOptions;

  test("thread/resume omits the agents overrides", () => {
    const params = buildCodexThreadResumeParams({
      threadId: "thread-1",
      cwd: "/tmp/example",
      runtimeOptions,
      secondaryReadOnly: true,
    });
    expect(params.config?.["agents.default_subagent_model"]).toBeUndefined();
    expect(params.config?.["agents.max_depth"]).toBeUndefined();
  });

  test("developer instructions omit the worker brief", () => {
    const text = buildCodexDeveloperInstructions({
      runtimeOptions,
      secondaryReadOnly: true,
    });
    expect(text).not.toContain("Worker mode");
    expect(text).not.toContain("Worker brief");
  });
});

describe("Codex worker developer instructions", () => {
  test("adds the delegation contract and the worker brief", () => {
    const text = buildCodexDeveloperInstructions({
      runtimeOptions: {
        model: "gpt-5.6-sol",
        workerIntent: intent({ workerModel: "gpt-5.6-terra" }),
      },
    });
    expect(text).toContain("Worker mode");
    expect(text).toContain("Worker brief");
    expect(text).toContain("review its diff");
  });

  test("leaves instructions untouched when Worker mode is off", () => {
    const off = buildCodexDeveloperInstructions({
      runtimeOptions: { model: "gpt-5.6-sol" },
    });
    expect(off).not.toContain("Worker mode");
  });

  test("worker changes rotate the instruction profile key so resume cannot mismatch", () => {
    const base = buildCodexInstructionProfileKey({
      runtimeOptions: { model: "gpt-5.6-sol" },
    });
    const withTerra = buildCodexInstructionProfileKey({
      runtimeOptions: {
        model: "gpt-5.6-sol",
        workerIntent: intent({ workerModel: "gpt-5.6-terra" }),
      },
    });
    const withSol = buildCodexInstructionProfileKey({
      runtimeOptions: {
        model: "gpt-5.6-sol",
        workerIntent: intent({ workerModel: "gpt-5.6-sol" }),
      },
    });
    expect(withTerra).not.toBe(base);
    expect(withSol).not.toBe(withTerra);
  });
});

describe("Codex worker config survives resume", () => {
  test("thread/resume carries the same agents overrides as thread/start", () => {
    const params = buildCodexThreadResumeParams({
      threadId: "thread-1",
      cwd: "/tmp/example",
      runtimeOptions: {
        model: "gpt-5.6-sol",
        workerIntent: intent({
          workerModel: "gpt-5.6-terra",
          workerEffort: "max",
        }),
      },
    });
    expect(params.config?.["agents.default_subagent_model"]).toBe(
      "gpt-5.6-terra",
    );
    expect(params.config?.["agents.default_subagent_reasoning_effort"]).toBe(
      "max",
    );
  });
});
