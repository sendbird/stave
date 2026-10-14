import { describe, expect, test } from "bun:test";
import path from "node:path";
import {
  buildOpenCodeAcpCommandArgs,
  buildOpenCodeConfigContent,
  buildOpenCodePermissionRules,
  buildOpenCodeTurnEnv,
  interpretOpenCodeFailure,
  streamOpenCodeWithAcp,
} from "../electron/providers/opencode/opencode-acp-profile";
import {
  parseOpenCodeVersion,
  resolveOpenCodeVersionSupport,
} from "../electron/providers/opencode/opencode-version";
import { resolveAcpTurnMcpServers } from "../electron/providers/acp/acp-shared-mcp";
import { isAlwaysAllowedStaveLocalMcpTool } from "../electron/providers/stave-local-mcp-approval";
import type {
  BridgeEvent,
  ProviderResponderResult,
} from "../electron/providers/types";

const fixturePath = path.join(
  import.meta.dir,
  "fixtures",
  "fake-opencode-acp-agent.ts",
);

type ApprovalResponder = (args: {
  requestId: string;
  approved: boolean;
  reason?: string;
  scope?: "once" | "always";
}) => ProviderResponderResult;

function createTurnArgs(
  scenario: string,
  args: {
    line?: "v1" | "v2";
    runtimeOptions?: Record<string, unknown>;
    versionText?: string;
  } = {},
) {
  return {
    providerId: "opencode" as const,
    prompt: "Run the OpenCode fixture",
    cwd: import.meta.dir,
    runtimeOptions: {
      model: "auto",
      opencodeBinaryPath: process.execPath,
      ...args.runtimeOptions,
    },
    acpArgsForTest: [fixturePath, scenario, args.line ?? "v1"],
    versionTextForTest:
      args.versionText ??
      (args.line === "v2" ? "opencode v2.0.29" : "1.19.0"),
  };
}

function echoedSession(events: BridgeEvent[]) {
  const text = events.find(
    (event) => event.type === "text" && event.text.startsWith("echo-session:"),
  );
  if (!text || text.type !== "text") {
    throw new Error("Expected the fixture to echo its session state.");
  }
  return JSON.parse(text.text.slice("echo-session:".length)) as {
    mcpServers: unknown[];
    configCalls: string[];
    model: string;
    effort: string;
    mode: string;
    configContent: string | null;
  };
}

function waitForEvent(
  start: (onEvent: (event: BridgeEvent) => void) => void,
  predicate: (event: BridgeEvent) => boolean,
) {
  return new Promise<BridgeEvent>((resolve) => {
    start((event) => {
      if (predicate(event)) {
        resolve(event);
      }
    });
  });
}

describe("OpenCode version support", () => {
  test("reads the 1.x and 2.x version output", () => {
    expect(parseOpenCodeVersion("1.19.0")).toEqual({ major: 1, minor: 19, patch: 0 });
    expect(parseOpenCodeVersion("opencode v2.0.29")).toEqual({ major: 2, minor: 0, patch: 29 });
    expect(parseOpenCodeVersion("no version here")).toBeNull();
  });

  test("allows the verified floors of each release line and fails closed otherwise", () => {
    expect(resolveOpenCodeVersionSupport("1.19.0").supported).toBe(true);
    expect(resolveOpenCodeVersionSupport("1.20.3").supported).toBe(true);
    expect(resolveOpenCodeVersionSupport("opencode v2.0.29").supported).toBe(true);
    expect(resolveOpenCodeVersionSupport("opencode v2.1.0").supported).toBe(true);
    for (const text of ["1.18.35", "opencode v2.0.28", "opencode v3.0.0", "", "garbage"]) {
      const support = resolveOpenCodeVersionSupport(text);
      expect(support.supported).toBe(false);
      if (!support.supported) {
        expect(support.reason).toContain("1.19.0 or newer in the 1.x line");
        expect(support.reason).toContain("2.0.29 or newer in the 2.x line");
      }
    }
  });
});

describe("OpenCode permission config", () => {
  test("`opencode acp` takes no approval flag", () => {
    expect(buildOpenCodeAcpCommandArgs()).toEqual(["acp"]);
  });

  test("manual asks for every tool, read only also removes edit tools, auto adds nothing", () => {
    expect(buildOpenCodePermissionRules({ approvalMode: "manual" })).toEqual({ "*": "ask" });
    // An unset mode is the fail-safe default, never approvals off.
    expect(buildOpenCodePermissionRules({})).toEqual({ "*": "ask" });
    expect(buildOpenCodePermissionRules({ approvalMode: "manual", denyEdits: true })).toEqual({
      "*": "ask",
      edit: "deny",
    });
    expect(buildOpenCodePermissionRules({ approvalMode: "auto" })).toBeNull();
  });

  test("repeats the rules on the built-in agents and appends them after existing rules", () => {
    const content = buildOpenCodeConfigContent({
      rules: { "*": "ask", edit: "deny" },
      existing: JSON.stringify({
        theme: "system",
        permission: { edit: "allow", bash: { "git *": "allow" } },
        agent: { build: { model: "vercel/zai/glm-5.3", permission: { bash: "allow" } } },
      }),
    });
    const parsed = JSON.parse(content!) as Record<string, any>;
    expect(parsed.theme).toBe("system");
    // Last match wins in OpenCode, so Stave's keys must come after the user's.
    expect(Object.keys(parsed.permission)).toEqual(["bash", "*", "edit"]);
    expect(parsed.permission).toEqual({ bash: { "git *": "allow" }, "*": "ask", edit: "deny" });
    expect(parsed.agent.build.model).toBe("vercel/zai/glm-5.3");
    expect(Object.keys(parsed.agent.build.permission)).toEqual(["bash", "*", "edit"]);
    for (const agent of ["build", "plan", "general", "explore"]) {
      expect(parsed.agent[agent].permission["*"]).toBe("ask");
    }
  });

  test("leaves the inherited config untouched in auto", () => {
    expect(buildOpenCodeConfigContent({ rules: null, existing: "{}" })).toBeUndefined();
    const env = buildOpenCodeTurnEnv({
      executablePath: process.execPath,
      runtimeOptions: { opencodeApprovalMode: "auto" },
      baseEnv: { OPENCODE_CONFIG_CONTENT: '{"theme":"system"}' },
    });
    expect(env.OPENCODE_CONFIG_CONTENT).toBe('{"theme":"system"}');
  });

  test("recognises OpenCode's single-underscore Local MCP tool names", () => {
    expect(isAlwaysAllowedStaveLocalMcpTool("stave-local-mcp_stave_get_workspace_information")).toBe(true);
    expect(isAlwaysAllowedStaveLocalMcpTool("other-server_stave_get_workspace_information")).toBe(false);
  });

  test("adds the authentication guidance to provider authentication failures", () => {
    expect(
      interpretOpenCodeFailure(
        new Error("Authentication required: provider authentication required"),
        "",
      ),
    ).toContain("opencode auth login");
    expect(interpretOpenCodeFailure(new Error("socket closed"), "")).toBeNull();
  });
});

describe("OpenCode shared MCP", () => {
  test("injects only Stave Local MCP and never projects Claude or Codex servers", async () => {
    const local = {
      name: "stave-local-mcp",
      command: process.execPath,
      args: ["proxy.js"],
      env: [],
    };
    await expect(
      resolveAcpTurnMcpServers({
        targetProvider: "opencode",
        cwd: import.meta.dir,
        claudeConfigDir: "/tmp/stave-opencode-test-missing-claude",
        codexHome: "/tmp/stave-opencode-test-missing-codex",
        staveLocalMcpServers: [local],
      }),
    ).resolves.toEqual([local]);
  });
});

describe("OpenCode ACP runtime", () => {
  for (const line of ["v1", "v2"] as const) {
    test(`maps a streamed ${line} turn to normalized events`, async () => {
      const events = await streamOpenCodeWithAcp(createTurnArgs("standard", { line }));
      expect(events).toContainEqual({
        type: "provider_session",
        providerId: "opencode",
        nativeSessionId: "ses_fixture0000000000000001",
      });
      expect(events).toContainEqual({
        type: "model_resolved",
        resolvedProviderId: "opencode",
        resolvedModel: "opencode/big-pickle",
      });
      expect(events.some((event) => event.type === "thinking")).toBe(true);
      expect(events).toContainEqual({
        type: "text",
        text: "OpenCode response:opencode/big-pickle",
        segmentId: "msg_standard",
      });
      expect(events.some((event) => event.type === "tool")).toBe(true);
      // ACP plans arrive as Stave's todo tool.
      expect(
        events.some((event) => event.type === "tool" && event.toolName === "TodoWrite"),
      ).toBe(true);
      expect(events).toContainEqual({
        type: "context_usage",
        usedTokens: 7794,
        sizeTokens: 200000,
        costAmount: 0,
        costCurrency: "USD",
      });
      expect(events).toContainEqual({
        type: "usage",
        inputTokens: 21,
        outputTokens: 13,
        thoughtTokens: 5,
        cacheReadTokens: 8,
      });
      expect(events.filter((event) => event.type === "done")).toEqual([
        { type: "done", stop_reason: "end_turn" },
      ]);
    });
  }

  test("opens a session with MCP servers and the ask-everything rule in manual", async () => {
    const session = echoedSession(
      await streamOpenCodeWithAcp(
        createTurnArgs("echo-session", {
          runtimeOptions: { opencodeApprovalMode: "manual" },
        }),
      ),
    );
    // Only Stave Local MCP is injected (present when a Stave instance is running).
    expect(
      session.mcpServers.every(
        (server) => (server as { name?: string }).name === "stave-local-mcp",
      ),
    ).toBe(true);
    const content = JSON.parse(session.configContent ?? "null") as Record<string, any>;
    expect(content.permission).toEqual({ "*": "ask" });
    expect(content.agent.build.permission).toEqual({ "*": "ask" });
  });

  test("removes edit tools for a read-only agent", async () => {
    const session = echoedSession(
      await streamOpenCodeWithAcp(
        createTurnArgs("echo-session", {
          runtimeOptions: { opencodeApprovalMode: "manual", opencodeDenyEdits: true },
        }),
      ),
    );
    expect(JSON.parse(session.configContent ?? "null").permission).toEqual({
      "*": "ask",
      edit: "deny",
    });
  });

  test("keeps OpenCode's own permission config in auto", async () => {
    const session = echoedSession(
      await streamOpenCodeWithAcp(
        createTurnArgs("echo-session", {
          runtimeOptions: { opencodeApprovalMode: "auto" },
        }),
      ),
    );
    expect(session.configContent).toBe(process.env.OPENCODE_CONFIG_CONTENT ?? null);
  });

  test("selects the build agent first, then the model, then an effort the model offers", async () => {
    const events = await streamOpenCodeWithAcp(
      createTurnArgs("echo-session", {
        line: "v2",
        runtimeOptions: { model: "opencode/cat-jam-free", opencodeEffort: "high" },
      }),
    );
    const session = echoedSession(events);
    expect(session.configCalls).toEqual(["model=opencode/cat-jam-free", "effort=high"]);
    expect(session).toMatchObject({ model: "opencode/cat-jam-free", effort: "high", mode: "build" });
    expect(events).toContainEqual({
      type: "model_resolved",
      resolvedProviderId: "opencode",
      resolvedModel: "opencode/cat-jam-free",
    });
  });

  test("switches a session that opened in another agent back to build before the model", async () => {
    const session = echoedSession(
      await streamOpenCodeWithAcp(
        createTurnArgs("plan-default", {
          runtimeOptions: { model: "vercel/zai/glm-5.3" },
        }),
      ),
    );
    expect(session.configCalls).toEqual(["mode=build", "model=vercel/zai/glm-5.3"]);
    expect(session.mode).toBe("build");
  });

  test("skips an effort the selected model does not advertise", async () => {
    const session = echoedSession(
      await streamOpenCodeWithAcp(
        createTurnArgs("echo-session", {
          runtimeOptions: { model: "vercel/zai/glm-5.3", opencodeEffort: "low" },
        }),
      ),
    );
    expect(session.configCalls).toEqual(["model=vercel/zai/glm-5.3"]);
    expect(session.effort).toBe("default");
  });

  test("reports a requested model OpenCode does not list and keeps the current one", async () => {
    const events = await streamOpenCodeWithAcp(
      createTurnArgs("standard", { runtimeOptions: { model: "anthropic/missing" } }),
    );
    expect(
      events.some(
        (event) =>
          event.type === "error" &&
          event.message.includes("did not advertise the requested model anthropic/missing"),
      ),
    ).toBe(true);
    expect(events).toContainEqual({
      type: "model_resolved",
      resolvedProviderId: "opencode",
      resolvedModel: "opencode/big-pickle",
    });
  });

  test("routes a permission request through the approval card and answers allow once", async () => {
    let responder: ApprovalResponder | undefined;
    let turn!: Promise<BridgeEvent[]>;
    const approval = await waitForEvent(
      (onEvent) => {
        turn = streamOpenCodeWithAcp({
          ...createTurnArgs("permission"),
          onEvent,
          registerApprovalResponder: (next) => {
            responder = next;
          },
        });
      },
      (event) => event.type === "approval",
    );
    if (approval.type !== "approval") {
      throw new Error("Expected an approval event.");
    }
    expect(approval.toolName).toBe("Bash");
    expect(approval.supportsAllowAlways).toBe(true);
    expect(responder?.({ requestId: approval.requestId, approved: true })).toEqual({ ok: true });
    const events = await turn;
    expect(
      events.some(
        (event) => event.type === "text" && event.text.includes('"optionId":"once"'),
      ),
    ).toBe(true);
  });

  test("answers always and reject with OpenCode's own option ids", async () => {
    for (const [response, optionId] of [
      [{ approved: true, scope: "always" as const }, "always"],
      [{ approved: false }, "reject"],
    ] as const) {
      let responder: ApprovalResponder | undefined;
      let turn!: Promise<BridgeEvent[]>;
      const approval = await waitForEvent(
        (onEvent) => {
          turn = streamOpenCodeWithAcp({
            ...createTurnArgs("permission"),
            onEvent,
            registerApprovalResponder: (next) => {
              responder = next;
            },
          });
        },
        (event) => event.type === "approval",
      );
      if (approval.type !== "approval") throw new Error("Expected an approval event.");
      responder?.({ requestId: approval.requestId, ...response });
      const events = await turn;
      expect(
        events.some(
          (event) => event.type === "text" && event.text.includes(`"optionId":"${optionId}"`),
        ),
      ).toBe(true);
    }
  });

  test("auto approves permission requests without an approval card", async () => {
    const events = await streamOpenCodeWithAcp(
      createTurnArgs("permission", { runtimeOptions: { opencodeApprovalMode: "auto" } }),
    );
    expect(events.some((event) => event.type === "approval")).toBe(false);
    expect(
      events.some(
        (event) => event.type === "text" && event.text.includes('"optionId":"once"'),
      ),
    ).toBe(true);
  });

  test("auto still asks before a tool that answers another task's prompt", async () => {
    let responder: ApprovalResponder | undefined;
    let turn!: Promise<BridgeEvent[]>;
    const approval = await waitForEvent(
      (onEvent) => {
        turn = streamOpenCodeWithAcp({
          ...createTurnArgs("never-auto-approved", {
            runtimeOptions: { opencodeApprovalMode: "auto" },
          }),
          onEvent,
          registerApprovalResponder: (next) => {
            responder = next;
          },
        });
      },
      (event) => event.type === "approval",
    );
    if (approval.type !== "approval") throw new Error("Expected an approval event.");
    responder?.({ requestId: approval.requestId, approved: false });
    const events = await turn;
    expect(
      events.some(
        (event) => event.type === "text" && event.text.includes('"optionId":"reject"'),
      ),
    ).toBe(true);
  });

  test("approves read-safe Stave Local MCP tools in manual without asking", async () => {
    const events = await streamOpenCodeWithAcp(
      createTurnArgs("stave-mcp-permission", { runtimeOptions: { opencodeApprovalMode: "manual" } }),
    );
    expect(events.some((event) => event.type === "approval")).toBe(false);
    expect(
      events.some(
        (event) => event.type === "text" && event.text.includes('"optionId":"once"'),
      ),
    ).toBe(true);
  });

  test("cancels the in-flight prompt with session/cancel", async () => {
    let abort: (() => void) | undefined;
    let turn!: Promise<BridgeEvent[]>;
    await waitForEvent(
      (onEvent) => {
        turn = streamOpenCodeWithAcp({
          ...createTurnArgs("cancel"),
          onEvent,
          registerAbort: (next) => {
            abort = next;
          },
        });
      },
      (event) => event.type === "thinking",
    );
    abort?.();
    const events = await turn;
    expect(events.filter((event) => event.type === "done")).toEqual([
      { type: "done", stop_reason: "user_abort" },
    ]);
  });

  test("resumes a saved session with session/load without replaying it", async () => {
    const events = await streamOpenCodeWithAcp(
      createTurnArgs("standard", {
        runtimeOptions: { opencodeResumeSessionId: "ses_saved0000000000000001" },
      }),
    );
    expect(events).toContainEqual({
      type: "provider_session",
      providerId: "opencode",
      nativeSessionId: "ses_saved0000000000000001",
    });
    expect(
      events.some((event) => event.type === "text" && event.text === "replayed answer"),
    ).toBe(false);
    expect(
      events.some(
        (event) => event.type === "text" && event.text.startsWith("OpenCode response"),
      ),
    ).toBe(true);
  });

  test("never starts OpenCode for unattended work", async () => {
    const events = await streamOpenCodeWithAcp({
      ...createTurnArgs("standard"),
      unattendedAutomation: true,
    } as Parameters<typeof streamOpenCodeWithAcp>[0]);
    expect(events).toEqual([
      {
        type: "error",
        message: "OpenCode is available only for interactive primary task turns.",
        recoverable: true,
      },
      { type: "done", stop_reason: "runtime_failure" },
    ]);
  });

  test("fails before launch when the executable is missing", async () => {
    const events = await streamOpenCodeWithAcp({
      ...createTurnArgs("standard"),
      executablePathForTest: "",
    });
    expect(events).toEqual([
      {
        type: "error",
        message:
          "OpenCode CLI was not found. Install it or configure the OpenCode CLI path in Settings.",
        recoverable: true,
      },
      { type: "done", stop_reason: "runtime_failure" },
    ]);
  });

  test("refuses an unsupported OpenCode version before starting a session", async () => {
    const events = await streamOpenCodeWithAcp(
      createTurnArgs("standard", { versionText: "1.18.0" }),
    );
    expect(events).toEqual([
      {
        type: "error",
        message:
          "Unsupported OpenCode version 1.18.0. Stave requires OpenCode 1.19.0 or newer in the 1.x line, or 2.0.29 or newer in the 2.x line.",
        recoverable: true,
      },
      { type: "done", stop_reason: "runtime_failure" },
    ]);
  });

  test("tells the user how to connect a provider when authentication is required", async () => {
    const events = await streamOpenCodeWithAcp(
      createTurnArgs("auth-required", { line: "v2" }),
    );
    const failure = events.find((event) => event.type === "error");
    expect(failure?.type === "error" ? failure.message : "").toContain(
      "Authentication required",
    );
    expect(failure?.type === "error" ? failure.message : "").toContain(
      "opencode auth login",
    );
    expect(events.filter((event) => event.type === "done")).toEqual([
      { type: "done", stop_reason: "runtime_failure" },
    ]);
  });
});
