import { afterEach, describe, expect, test } from "bun:test";
import {
  invalidateAvailability,
  setCachedAvailability,
} from "../electron/providers/stave-availability";
import { runOrchestrator } from "../electron/providers/stave-orchestrator";
import type { BridgeEvent, StreamTurnArgs } from "../electron/providers/types";
import { DEFAULT_STAVE_AUTO_PROFILE } from "../src/lib/providers/stave-auto-profile";

function customProfile(
  overrides: Partial<typeof DEFAULT_STAVE_AUTO_PROFILE> = {},
) {
  return {
    ...DEFAULT_STAVE_AUTO_PROFILE,
    ...overrides,
  };
}

function textResponse(text: string): BridgeEvent[] {
  return [{ type: "text", text }, { type: "done" }];
}

afterEach(() => {
  invalidateAvailability("claude-code");
  invalidateAvailability("codex");
});

describe("runOrchestrator", () => {
  test("parses fenced supervisor output with wrapper text and role aliases", async () => {
    const calls: StreamTurnArgs[] = [];
    const emittedEvents: BridgeEvent[] = [];

    await runOrchestrator({
      userPrompt: "Review the fix",
      profile: customProfile(),
      baseArgs: {
        cwd: "/tmp/workspace",
        taskId: "task-1",
        workspaceId: "workspace-1",
      },
      onEvent: (event) => {
        emittedEvents.push(event);
      },
      runTurnBatch: async (args) => {
        calls.push(args);
        switch (calls.length) {
          case 1:
            return textResponse(`Here's the breakdown:

\`\`\`json
[
  {"id":"st-1","title":"Review implementation","role":"review","prompt":"Inspect the current fix","dependsOn":[]}
]
\`\`\`

Use this plan.`);
          case 2:
            return textResponse("The implementation looks correct.");
          case 3:
            return textResponse("Final reviewed answer.");
          default:
            throw new Error(`Unexpected runTurnBatch call ${calls.length}`);
        }
      },
    });

    expect(calls[1]?.providerId).toBe("codex");
    expect(calls[1]?.prompt).toBe("Inspect the current fix");
    expect(emittedEvents).toContainEqual({
      type: "stave:orchestration_processing",
      supervisorModel: DEFAULT_STAVE_AUTO_PROFILE.supervisorModel,
      subtasks: [
        {
          id: "st-1",
          title: "Review implementation",
          model: DEFAULT_STAVE_AUTO_PROFILE.verifyModel!,
          dependsOn: [],
        },
      ],
    });
  });

  test("recovers bare JSON arrays even when the supervisor appends trailing text", async () => {
    const calls: StreamTurnArgs[] = [];
    const emittedEvents: BridgeEvent[] = [];

    await runOrchestrator({
      userPrompt: "Fix the orchestrator parser",
      profile: customProfile(),
      baseArgs: {
        cwd: "/tmp/workspace",
        taskId: "task-2",
        workspaceId: "workspace-2",
      },
      onEvent: (event) => {
        emittedEvents.push(event);
      },
      runTurnBatch: async (args) => {
        calls.push(args);
        switch (calls.length) {
          case 1:
            return textResponse(`[
  {"id":"st-1","title":"Implement parser fix","role":"implement","prompt":"Patch the parser","dependsOn":[]}
]

This keeps the response concise.`);
          case 2:
            return textResponse("Patched the parser.");
          case 3:
            return textResponse("Final implementation summary.");
          default:
            throw new Error(`Unexpected runTurnBatch call ${calls.length}`);
        }
      },
    });

    expect(calls[1]?.providerId).toBe("codex");
    expect(calls[1]?.prompt).toBe("Patch the parser");
    expect(emittedEvents).toContainEqual({
      type: "stave:orchestration_processing",
      supervisorModel: DEFAULT_STAVE_AUTO_PROFILE.supervisorModel,
      subtasks: [
        {
          id: "st-1",
          title: "Implement parser fix",
          model: DEFAULT_STAVE_AUTO_PROFILE.implementModel,
          dependsOn: [],
        },
      ],
    });
  });

  test("survives circular dependencies without stack overflow", async () => {
    const calls: StreamTurnArgs[] = [];
    const emittedEvents: BridgeEvent[] = [];

    await runOrchestrator({
      userPrompt: "Circular dep test",
      profile: customProfile(),
      baseArgs: {
        cwd: "/tmp/workspace",
        taskId: "task-cycle",
        workspaceId: "ws-cycle",
      },
      onEvent: (event) => {
        emittedEvents.push(event);
      },
      runTurnBatch: async (args) => {
        calls.push(args);
        switch (calls.length) {
          case 1:
            // Supervisor returns two subtasks that depend on each other (cycle).
            return textResponse(
              JSON.stringify([
                {
                  id: "st-1",
                  title: "Step A",
                  role: "analyze",
                  prompt: "Do A with {st-2}",
                  dependsOn: ["st-2"],
                },
                {
                  id: "st-2",
                  title: "Step B",
                  role: "implement",
                  prompt: "Do B with {st-1}",
                  dependsOn: ["st-1"],
                },
              ]),
            );
          case 2:
            return textResponse("Result A");
          case 3:
            return textResponse("Result B");
          case 4:
            return textResponse("Synthesised.");
          default:
            throw new Error(`Unexpected call ${calls.length}`);
        }
      },
    });

    // Must not crash — both subtasks should complete.
    const doneTasks = emittedEvents.filter(
      (e) => e.type === "stave:subtask_done",
    );
    expect(doneTasks).toHaveLength(2);
    expect(
      emittedEvents.some((e) => e.type === "stave:synthesis_started"),
    ).toBe(true);
  });

  test("strips self-referencing dependsOn and deduplicates subtask IDs", async () => {
    const calls: StreamTurnArgs[] = [];
    const emittedEvents: BridgeEvent[] = [];

    await runOrchestrator({
      userPrompt: "Self-ref + dup test",
      profile: customProfile(),
      baseArgs: {
        cwd: "/tmp/workspace",
        taskId: "task-self",
        workspaceId: "ws-self",
      },
      onEvent: (event) => {
        emittedEvents.push(event);
      },
      runTurnBatch: async (args) => {
        calls.push(args);
        switch (calls.length) {
          case 1:
            // Self-referencing dep + duplicate ID.
            return textResponse(
              JSON.stringify([
                {
                  id: "st-1",
                  title: "First",
                  role: "analyze",
                  prompt: "Analyze",
                  dependsOn: ["st-1"],
                },
                {
                  id: "st-1",
                  title: "Duplicate",
                  role: "implement",
                  prompt: "Should be skipped",
                  dependsOn: [],
                },
                {
                  id: "st-2",
                  title: "Second",
                  role: "implement",
                  prompt: "Implement",
                  dependsOn: ["st-1"],
                },
              ]),
            );
          case 2:
            return textResponse("Analysis result");
          case 3:
            return textResponse("Implementation result");
          case 4:
            return textResponse("Synthesised.");
          default:
            throw new Error(`Unexpected call ${calls.length}`);
        }
      },
    });

    const processing = emittedEvents.find(
      (e) => e.type === "stave:orchestration_processing",
    );
    expect(processing).toBeDefined();
    if (processing && processing.type === "stave:orchestration_processing") {
      // Duplicate "st-1" should be deduplicated — only 2 subtasks.
      expect(processing.subtasks).toHaveLength(2);
      expect(processing.subtasks.map((s) => s.id)).toEqual(["st-1", "st-2"]);
    }
  });

  test("placeholder substitution is scoped to declared dependencies only", async () => {
    const calls: StreamTurnArgs[] = [];
    const emittedEvents: BridgeEvent[] = [];

    await runOrchestrator({
      userPrompt: "Placeholder scoping test",
      profile: customProfile(),
      baseArgs: {
        cwd: "/tmp/workspace",
        taskId: "task-scope",
        workspaceId: "ws-scope",
      },
      onEvent: (event) => {
        emittedEvents.push(event);
      },
      runTurnBatch: async (args) => {
        calls.push(args);
        switch (calls.length) {
          case 1:
            return textResponse(
              JSON.stringify([
                {
                  id: "st-1",
                  title: "Step 1",
                  role: "analyze",
                  prompt: "Analyze",
                  dependsOn: [],
                },
                {
                  id: "st-2",
                  title: "Step 2",
                  role: "implement",
                  prompt: "Use {st-1} here",
                  dependsOn: ["st-1"],
                },
                {
                  id: "st-3",
                  title: "Step 3",
                  role: "general",
                  prompt: "Unrelated {st-1} ref",
                  dependsOn: [],
                },
              ]),
            );
          case 2:
            return textResponse("analysis output");
          // st-3 has no deps on st-1, so runs in the same group as st-1.
          case 3:
            return textResponse("st-3 output");
          // st-2 depends on st-1, so runs after.
          case 4:
            return textResponse("st-2 output");
          case 5:
            return textResponse("Synthesised.");
          default:
            throw new Error(`Unexpected call ${calls.length}`);
        }
      },
    });

    // st-2 (depends on st-1): prompt should have {st-1} substituted.
    const st2Call = calls[3]; // 4th call (1=supervisor, 2=st-1, 3=st-3, 4=st-2)
    expect(st2Call?.prompt).toBe("Use analysis output here");

    // st-3 (no dep on st-1): prompt should keep {st-1} as a literal.
    const st3Call = calls[2]; // 3rd call
    expect(st3Call?.prompt).toBe("Unrelated {st-1} ref");
  });

  test("multi-level dependency chain executes in correct topological order", async () => {
    const calls: StreamTurnArgs[] = [];
    const startedSubtasks: string[] = [];

    await runOrchestrator({
      userPrompt: "Chain test",
      profile: customProfile(),
      baseArgs: {
        cwd: "/tmp/workspace",
        taskId: "task-chain",
        workspaceId: "ws-chain",
      },
      onEvent: (event) => {
        if (event.type === "stave:subtask_started") {
          startedSubtasks.push(event.subtaskId);
        }
      },
      runTurnBatch: async (args) => {
        calls.push(args);
        switch (calls.length) {
          case 1:
            return textResponse(
              JSON.stringify([
                {
                  id: "st-1",
                  title: "Base",
                  role: "analyze",
                  prompt: "Base analysis",
                  dependsOn: [],
                },
                {
                  id: "st-2",
                  title: "Mid",
                  role: "implement",
                  prompt: "Based on {st-1}",
                  dependsOn: ["st-1"],
                },
                {
                  id: "st-3",
                  title: "Top",
                  role: "verify",
                  prompt: "Verify {st-2}",
                  dependsOn: ["st-2"],
                },
              ]),
            );
          case 2:
            return textResponse("base result");
          case 3:
            return textResponse("mid result");
          case 4:
            return textResponse("top result");
          case 5:
            return textResponse("Final synthesis.");
          default:
            throw new Error(`Unexpected call ${calls.length}`);
        }
      },
    });

    // Topological execution order must be st-1 → st-2 → st-3.
    expect(startedSubtasks).toEqual(["st-1", "st-2", "st-3"]);

    // st-2 prompt should have {st-1} resolved.
    expect(calls[2]?.prompt).toBe("Based on base result");
    // st-3 prompt should have {st-2} resolved.
    expect(calls[3]?.prompt).toBe("Verify mid result");
  });

  test("falls back to a single general subtask when no JSON array can be recovered", async () => {
    const calls: StreamTurnArgs[] = [];
    const emittedEvents: BridgeEvent[] = [];
    const userPrompt = "Handle this request directly";

    await runOrchestrator({
      userPrompt,
      profile: customProfile(),
      baseArgs: {
        cwd: "/tmp/workspace",
        taskId: "task-3",
        workspaceId: "workspace-3",
      },
      onEvent: (event) => {
        emittedEvents.push(event);
      },
      runTurnBatch: async (args) => {
        calls.push(args);
        switch (calls.length) {
          case 1:
            return textResponse(
              "I can handle this directly without a structured breakdown.",
            );
          case 2:
            return textResponse("Handled via fallback worker.");
          case 3:
            return textResponse("Final synthesized answer.");
          default:
            throw new Error(`Unexpected runTurnBatch call ${calls.length}`);
        }
      },
    });

    expect(calls[1]?.providerId).toBe("claude-code");
    expect(calls[1]?.prompt).toBe(userPrompt);
    expect(emittedEvents).toContainEqual({
      type: "stave:orchestration_processing",
      supervisorModel: DEFAULT_STAVE_AUTO_PROFILE.supervisorModel,
      subtasks: [
        {
          id: "st-fallback",
          title: "Process request",
          model: DEFAULT_STAVE_AUTO_PROFILE.generalModel,
          dependsOn: [],
        },
      ],
    });
  });

  test("falls back to the alternate provider for an unavailable supervisor model", async () => {
    setCachedAvailability("claude-code", false);

    const calls: StreamTurnArgs[] = [];
    const emittedEvents: BridgeEvent[] = [];

    await runOrchestrator({
      userPrompt: "Implement with fallback supervisor",
      profile: customProfile(),
      baseArgs: {
        cwd: "/tmp/workspace",
        taskId: "task-supervisor-fallback",
        workspaceId: "ws-supervisor-fallback",
      },
      onEvent: (event) => {
        emittedEvents.push(event);
      },
      runTurnBatch: async (args) => {
        calls.push(args);
        switch (calls.length) {
          case 1:
            return textResponse(
              JSON.stringify([
                {
                  id: "st-1",
                  title: "Implement",
                  role: "implement",
                  prompt: "Patch it",
                  dependsOn: [],
                },
              ]),
            );
          case 2:
            return textResponse("Patched.");
          case 3:
            return textResponse("Synthesized.");
          default:
            throw new Error(`Unexpected call ${calls.length}`);
        }
      },
    });

    expect(calls[0]?.providerId).toBe("codex");
    expect(calls[2]?.providerId).toBe("codex");
    expect(emittedEvents).toContainEqual({
      type: "stave:orchestration_processing",
      supervisorModel: "gpt-5.4",
      subtasks: [
        {
          id: "st-1",
          title: "Implement",
          model: DEFAULT_STAVE_AUTO_PROFILE.implementModel,
          dependsOn: [],
        },
      ],
    });
  });

  test("falls back to the alternate provider for an unavailable worker model", async () => {
    setCachedAvailability("codex", false);

    const calls: StreamTurnArgs[] = [];
    const emittedEvents: BridgeEvent[] = [];

    await runOrchestrator({
      userPrompt: "Review implementation",
      profile: customProfile(),
      baseArgs: {
        cwd: "/tmp/workspace",
        taskId: "task-worker-fallback",
        workspaceId: "ws-worker-fallback",
      },
      onEvent: (event) => {
        emittedEvents.push(event);
      },
      runTurnBatch: async (args) => {
        calls.push(args);
        switch (calls.length) {
          case 1:
            return textResponse(
              JSON.stringify([
                {
                  id: "st-1",
                  title: "Verify fix",
                  role: "verify",
                  prompt: "Check it",
                  dependsOn: [],
                },
              ]),
            );
          case 2:
            return textResponse("Checked.");
          case 3:
            return textResponse("Final.");
          default:
            throw new Error(`Unexpected call ${calls.length}`);
        }
      },
    });

    expect(calls[1]?.providerId).toBe("claude-code");
    expect(emittedEvents).toContainEqual({
      type: "stave:orchestration_processing",
      supervisorModel: DEFAULT_STAVE_AUTO_PROFILE.supervisorModel,
      subtasks: [
        {
          id: "st-1",
          title: "Verify fix",
          model: "claude-opus-4-7",
          dependsOn: [],
        },
      ],
    });
  });
});
