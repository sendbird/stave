import { afterEach, describe, expect, test } from "bun:test";
import { defaultSettings } from "@/store/app-settings";
import {
  createWorkspaceKickoffResolver,
  runWorkspaceKickoff,
} from "@/store/workspace-kickoff-actions";
import {
  buildDeterministicKickoffProposal,
  classifyKickoffSource,
  DEFAULT_KICKOFF_SOURCE_CONFIGS,
  parseKickoffProposalResponse,
} from "@/lib/workspace-kickoff";
import { buildKickoffFirstTaskPrompt } from "@/lib/kickoff-brief";
import { readKickoffSource } from "@/store/kickoff-source-reader";
import {
  resolveKickoffModel,
  withKickoffDeadline,
} from "@/store/kickoff-resolution-runtime";
import {
  DEFAULT_PROMPT_WORKSPACE_KICKOFF,
  LEGACY_PROMPT_WORKSPACE_KICKOFF,
  normalizeKickoffPrompt,
} from "@/lib/providers/prompt-defaults";

const originalWindow = globalThis.window;
afterEach(() => {
  globalThis.window = originalWindow;
});
const classify = (input: string) =>
  classifyKickoffSource({ input, configs: DEFAULT_KICKOFF_SOURCE_CONFIGS });
const proposal = () =>
  buildDeterministicKickoffProposal({
    classification: classify("Implement the export. Keep the public API."),
  });
function install(api: unknown) {
  globalThis.window = { api } as Window & typeof globalThis;
}
function resolver() {
  return createWorkspaceKickoffResolver({
    getState: () => ({
      projectPath: "/tmp/project",
      activeWorkspaceId: "workspace-1",
      recentProjects: [],
      settings: defaultSettings,
    }),
  });
}
function secondaryApi(texts: string[]) {
  const claims: any[] = [];
  const cancellations: unknown[] = [];
  return {
    claims,
    cancellations,
    runs: {
      claimSecondary: async (claim: any) => {
        claims.push(claim);
        return {
          accepted: true,
          started: true,
          duplicate: false,
          aggregate: { step: { executionId: claim.step.id, attempt: 1 } },
        };
      },
      executeSecondary: async () => ({
        accepted: true,
        execution: {
          status: "completed",
          text: texts.shift() ?? "",
          model: "gpt-5.6-luna",
        },
      }),
      completeSecondary: async () => ({ accepted: true }),
      failSecondary: async () => ({ accepted: true }),
      cancelSecondary: async (value: unknown) => {
        cancellations.push(value);
        return { accepted: true };
      },
    },
  };
}

describe("kickoff execution", () => {
  test.each(["blocked", "throw"])(
    "preserves the created task when startup is %s",
    async (outcome) => {
      let creates = 0;
      let saved: any;
      let sentId = "";
      const state = {
        createWorkspace: async (args: any) => {
          creates++;
          saved = args;
          return {
            ok: true,
            taskId: "created",
            workspaceId: "new",
            message: "Init command failed.",
            noticeLevel: "warning" as const,
          };
        },
        updatePromptDraft: ({ patch }: any) => {
          saved.initialPromptDraft = patch;
        },
        sendUserMessage: async ({ taskId }: any) => {
          sentId = taskId;
          if (outcome === "throw") throw new Error("transport failed");
          return { status: "blocked" as const };
        },
      };
      const draft = proposal();
      draft.brief = {
        decisions: ["Use CSV"],
        constraints: ["Keep the public API"],
        acceptanceCriteria: ["Export can be reopened"],
        openQuestions: ["Which encoding?"],
      };
      const result = await runWorkspaceKickoff({
        input: {
          proposal: draft,
          startFirstTask: true,
          firstTaskProvider: "codex",
          firstTaskRuntimeOverrides: { model: "gpt-5.6-sol" },
        },
        getState: () => state,
      });
      expect(result.ok).toBe(true);
      expect(result.startup).toBe(outcome === "throw" ? "unknown" : "blocked");
      expect(result.message).toContain("Init command failed.");
      expect(creates).toBe(1);
      expect(sentId).toBe("created");
      expect(saved.initialTaskProvider).toBe("codex");
      expect(saved.initialPromptDraft.text).toBe(
        buildKickoffFirstTaskPrompt(draft),
      );
      expect(saved.initialPromptDraft.runtimeOverrides.model).toBe(
        "gpt-5.6-sol",
      );
    },
  );

  test("does not use the active task when creation omits its identity", async () => {
    let sends = 0;
    const result = await runWorkspaceKickoff({
      input: { proposal: proposal(), startFirstTask: true },
      getState: () => ({
        activeTaskId: "unrelated",
        createWorkspace: async () => ({ ok: true }),
        updatePromptDraft: () => {},
        sendUserMessage: async () => {
          sends++;
          return { status: "blocked" as const };
        },
      }),
    });
    expect(result.startup).toBe("blocked");
    expect(sends).toBe(0);
  });

  test("retains long input and all reviewed conditions in the dispatched text", () => {
    const input = "Background. ".repeat(1300) + "Do not change authentication.";
    const draft = buildDeterministicKickoffProposal({
      classification: classify(input),
    });
    draft.brief = {
      decisions: ["Reuse the service"],
      constraints: ["No API change"],
      acceptanceCriteria: ["Existing clients pass"],
      openQuestions: ["Confirm timeout"],
    };
    const prompt = buildKickoffFirstTaskPrompt(draft, "Run focused tests.");
    for (const text of [
      "Do not change authentication.",
      "Reuse the service",
      "No API change",
      "Existing clients pass",
      "Confirm timeout",
      "Run focused tests.",
    ])
      expect(prompt).toContain(text);
    expect(draft.sourceEvidence?.truncated).toBe(false);
  });

  test("valid model JSON cannot attest source reading", () => {
    const draft = parseKickoffProposalResponse({
      value: JSON.stringify({
        branchName: "fix/export",
        sourceEvidence: { status: "fetched" },
        brief: { decisions: ["Agreed change", null] },
      }),
      classification: classify("https://example.atlassian.net/browse/APP-42"),
      model: "test",
    });
    expect(draft?.sourceEvidence?.status).toBe("reference-only");
    expect(draft?.brief?.decisions).toEqual(["Agreed change"]);
    expect(draft?.brief?.acceptanceCriteria).toEqual([]);
  });

  test("upgrades only the old default prompt", () => {
    expect(normalizeKickoffPrompt(LEGACY_PROMPT_WORKSPACE_KICKOFF)).toBe(
      DEFAULT_PROMPT_WORKSPACE_KICKOFF,
    );
    expect(normalizeKickoffPrompt("my custom prompt")).toBe("my custom prompt");
  });

  test("falls back once after invalid output through bounded secondary runs", async () => {
    const api = secondaryApi([
      "not json",
      '{"branchName":"fix/export","brief":{"constraints":["Keep API"]}}',
    ]);
    install(api);
    const result = await resolver().resolve({ input: "Fix export" });
    expect(result.ok).toBe(true);
    expect(result.proposal?.brief?.constraints).toEqual(["Keep API"]);
    expect(api.claims).toHaveLength(2);
    expect(api.claims[0].run.policy).toMatchObject({
      maxAttempts: 1,
      timeoutMs: 30_000,
      maxOutputBytes: 32_768,
    });
    expect(api.claims[0].input.providerId).toBe("codex");
    expect(api.claims[1].input.providerId).toBe("claude-code");
    expect(result.proposal?.resolutionTiming?.attemptDurationsMs).toHaveLength(
      2,
    );
  });

  test("cancellation stops a hung execution, ignores late output, and skips fallback", async () => {
    const api = secondaryApi([]);
    let finish!: (value: any) => void;
    let began!: () => void;
    const executing = new Promise<void>((resolve) => {
      began = resolve;
    });
    api.runs.executeSecondary = () => {
      began();
      return new Promise((resolve) => {
        finish = resolve;
      });
    };
    install(api);
    const service = resolver();
    const pending = service.resolve({ input: "Fix export" });
    await executing;
    service.cancel();
    expect((await pending).ok).toBe(false);
    finish({
      accepted: true,
      execution: { status: "completed", text: '{"branchName":"fix/late"}' },
    });
    await Promise.resolve();
    expect(api.claims).toHaveLength(1);
    expect(api.cancellations.length).toBeGreaterThan(0);
  });

  test("rejects truncated output even when its first JSON object parses", async () => {
    const api = secondaryApi([]);
    api.runs.executeSecondary = async () => ({
      accepted: true,
      execution: {
        status: "completed",
        text: '{"branchName":"fix/export"}',
        model: "test",
        truncated: true,
      },
    });
    install(api);
    const result = await resolver().resolve({ input: "Fix export" });
    expect(result.proposal?.degraded).toBe(true);
    expect(result.proposal?.resolutionNote).toContain("unusable");
    expect(result.proposal?.sourceEvidence?.input).toBe("Fix export");
  });

  test("a cancelled claim cannot start provider work after it finally arrives", async () => {
    const api = secondaryApi([]);
    let finish!: (value: any) => void;
    let claimed!: () => void;
    const began = new Promise<void>((resolve) => {
      claimed = resolve;
    });
    let executions = 0;
    api.runs.claimSecondary = async () => {
      claimed();
      return new Promise((resolve) => {
        finish = resolve;
      });
    };
    api.runs.executeSecondary = async () => {
      executions++;
      return {
        accepted: true,
        execution: { status: "completed", text: "", model: "test" },
      };
    };
    install(api);
    const service = resolver();
    const result = service.resolve({ input: "Fix export" });
    await began;
    service.cancel();
    expect((await result).ok).toBe(false);
    finish({
      accepted: true,
      started: true,
      duplicate: false,
      aggregate: { step: { executionId: "late", attempt: 1 } },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(executions).toBe(0);
    expect(api.cancellations.length).toBeGreaterThan(0);
  });

  test("timeout invokes stop even when the operation never settles", async () => {
    let stops = 0;
    await expect(
      withKickoffDeadline(
        new Promise(() => {}),
        new AbortController().signal,
        5,
        () => {
          stops++;
        },
      ),
    ).rejects.toThrow("timeout");
    expect(stops).toBe(1);
  });

  test("preserves configured MCP calls and rejects provider errors instead of parsing their text", async () => {
    let options: any;
    install({
      provider: {
        streamTurn: async (args: any) => {
          options = args.runtimeOptions;
          return [
            { type: "text", text: '{"branchName":"fix/export"}' },
            { type: "error", message: "failed" },
          ];
        },
      },
    });
    await expect(
      resolveKickoffModel({
        requestId: "request",
        workspaceId: "workspace",
        projectPath: "/tmp/project",
        providerId: "claude-code",
        model: "test",
        prompt: "read",
        runtimeOptions: { claudeAllowedTools: ["mcp__source"] },
        mcpServers: ["source"],
        signal: new AbortController().signal,
        timeoutMs: 1000,
        parse: JSON.parse,
      }),
    ).rejects.toThrow("unavailable");
    expect(options.claudeAllowedTools).toEqual(["mcp__source"]);
    expect(options.providerTimeoutMs).toBe(1000);
  });

  test("Jira source reading verifies the connected site before fetching", async () => {
    let reads = 0;
    install({
      jiraConnector: {
        getStatus: async () => ({
          ok: true,
          status: {
            configured: true,
            siteUrl: "https://example.atlassian.net",
          },
        }),
      },
      trackerTasks: {
        getDetail: async () => {
          reads++;
          return {
            ok: true,
            detail: {
              key: "APP-42",
              url: "https://example.atlassian.net/browse/APP-42",
              title: "Export",
              description: "Keep existing clients working.",
            },
          };
        },
      },
    });
    const mismatch = await readKickoffSource(
      classify("https://other.atlassian.net/browse/APP-42"),
    );
    expect(reads).toBe(0);
    expect(mismatch.status).toBe("reference-only");
    const source = await readKickoffSource(
      classify("https://example.atlassian.net/browse/APP-42"),
    );
    expect(reads).toBe(1);
    expect(source.status).toBe("fetched");
    expect(source.fetchedText).toContain("Keep existing clients working.");
  });
});
