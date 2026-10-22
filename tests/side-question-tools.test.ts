import { describe, expect, test } from "bun:test";
import {
  buildSideQuestionClaudePromptOptions,
  buildSideQuestionCodexPromptArgs,
} from "../electron/host-service/side-question";
import { buildCodexThreadStartParams } from "../electron/providers/codex-app-server-params";
import { runCodexReadOnlyPromptWithClient } from "../electron/providers/codex-read-only-prompt";

const ARGS = {
  providerId: "codex" as const,
  model: "gpt-5.5",
  cwd: "/workspace/stave",
  prompt: "[Side Question]\nWhat is it doing?",
  runtimeOptions: { codexAccountProfileId: "system-default" },
};

/** Runs the side question's Codex call against a stub App Server and returns the `thread/start` params. */
async function codexThreadStart() {
  let threadStart: { config?: Record<string, unknown> } | null = null;
  let listener: ((message: { method?: string; params?: unknown }) => void) | null = null;
  const request = async <T>(method: string, params: unknown): Promise<T> => {
    if (method === "account/read") return { account: { type: "chatgpt" }, requiresOpenaiAuth: true } as T;
    if (method === "config/read") return { config: { mcp_servers: {} } } as T;
    if (method === "mcpServerStatus/list") return { data: [] } as T;
    if (method === "thread/start") {
      threadStart = params as typeof threadStart;
      return { thread: { id: "side-thread" } } as T;
    }
    if (method === "turn/start") {
      queueMicrotask(() =>
        listener?.({
          method: "turn/completed",
          params: { threadId: "side-thread", turn: { id: "side-turn", status: "completed", items: [{ type: "agentMessage", text: "Answer" }] } },
        }),
      );
      return { turn: { id: "side-turn", status: "inProgress", items: [] } } as T;
    }
    return {} as T;
  };
  const { cwd: _cwd, ...codexArgs } = buildSideQuestionCodexPromptArgs(ARGS);
  const result = await runCodexReadOnlyPromptWithClient({
    ...codexArgs,
    runtimeCwd: ARGS.cwd,
    request,
    readTurnUsage: () => null,
    subscribe: (next) => {
      listener = next;
      return () => {
        listener = null;
      };
    },
    buildThreadStartParams: buildCodexThreadStartParams,
    buildTurnStartParams: (args) => args,
  });
  expect(result).toMatchObject({ ok: true, text: "Answer" });
  return threadStart as { config?: Record<string, unknown> } | null;
}

describe("a side question cannot run anything", () => {
  test("Codex starts an isolated thread with its shell, exec, app and image tools switched off", async () => {
    expect(buildSideQuestionCodexPromptArgs(ARGS)).toMatchObject({ isolated: true, toolsDisabled: true });
    const params = await codexThreadStart();
    expect(params?.config).toMatchObject({
      "features.shell_tool": false,
      "features.unified_exec": false,
      "features.apps": false,
      "tools.view_image": false,
      network_access: false,
      web_search: "disabled",
    });
  });

  test("Claude gets no tools, no MCP servers and no permission prompts", () => {
    const options = buildSideQuestionClaudePromptOptions({ ...ARGS, providerId: "claude-code", model: "claude-sonnet-5" });
    expect(options).toMatchObject({
      tools: [],
      allowedTools: [],
      mcpServers: {},
      permissionMode: "dontAsk",
      maxTurns: 1,
      settingSources: [],
    });
  });
});
