import { describe, expect, test } from "bun:test";
import { deriveAcpToolPresentation } from "../electron/providers/acp/acp-tool-naming";
import { AcpEventMapper } from "../electron/providers/acp/acp-event-mapper";
import { deriveTraceToolSummary } from "../src/components/session/message/assistant-trace.utils";

const LONG_COMMAND =
  'cd /Users/example/workspaces/stave && git fetch origin && git rev-list --left-right --count origin/main...HEAD && git status';

describe("deriveAcpToolPresentation", () => {
  test("maps the execute kind onto Bash and keeps the command as the chip", () => {
    expect(
      deriveAcpToolPresentation({
        title: LONG_COMMAND,
        kind: "execute",
        rawInput: { command: LONG_COMMAND, cwd: "/tmp" },
      }),
    ).toEqual({
      toolName: "Bash",
      input: { command: LONG_COMMAND, cwd: "/tmp" },
    });
  });

  test("moves a prose title into the input when the agent sent no target", () => {
    expect(
      deriveAcpToolPresentation({ title: LONG_COMMAND, kind: "execute" }),
    ).toEqual({ toolName: "Bash", input: { command: LONG_COMMAND } });
  });

  test("renames agent-specific target keys onto the keys the chip reads", () => {
    expect(
      deriveAcpToolPresentation({
        title: "/Users/example/app/src/main.ts",
        kind: "read",
        rawInput: { filePath: "/Users/example/app/src/main.ts", limit: 20 },
      }),
    ).toEqual({
      toolName: "Read",
      input: { file_path: "/Users/example/app/src/main.ts", limit: 20 },
    });
  });

  test("infers Bash when the agent omits kind but sends a command", () => {
    expect(
      deriveAcpToolPresentation({
        title: LONG_COMMAND,
        rawInput: { command: LONG_COMMAND },
      }).toolName,
    ).toBe("Bash");
  });

  test("keeps short label titles as the tool name and passes input through", () => {
    expect(
      deriveAcpToolPresentation({
        title: "list_issues",
        rawInput: { repo: "stave" },
      }),
    ).toEqual({ toolName: "list_issues", input: { repo: "stave" } });
  });

  test("demotes an unclassifiable prose title out of the row title", () => {
    const presentation = deriveAcpToolPresentation({
      title: LONG_COMMAND,
      kind: "other",
    });
    expect(presentation.toolName).toBe("Tool");
    expect(presentation.input).toEqual({ description: LONG_COMMAND });
  });

  test("falls back to a generic name when the agent sends nothing usable", () => {
    expect(deriveAcpToolPresentation({}).toolName).toBe("Tool");
  });
});

describe("ACP tool events render like Claude and Codex trace rows", () => {
  test("an execute tool call becomes a Bash row with a command chip", () => {
    const mapper = new AcpEventMapper();
    const [event] = mapper.mapNotification({
      sessionId: "session-1",
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "tool-1",
        title: LONG_COMMAND,
        kind: "execute",
        status: "in_progress",
        rawInput: { command: LONG_COMMAND },
      },
    });

    expect(event).toMatchObject({ type: "tool", toolName: "Bash" });
    const toolEvent = event as Extract<typeof event, { type: "tool" }>;
    const summary = deriveTraceToolSummary({
      toolName: toolEvent.toolName,
      input: toolEvent.input,
    });
    expect(summary?.kind).toBe("command");
    expect(summary?.text).toBe(LONG_COMMAND);
  });

  test("a search tool call becomes a Search row with a search chip", () => {
    const mapper = new AcpEventMapper();
    const [event] = mapper.mapNotification({
      sessionId: "session-1",
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "tool-2",
        title: "Searched the workspace for deriveAcpToolPresentation",
        kind: "search",
        status: "completed",
        rawInput: { query: "deriveAcpToolPresentation" },
      },
    });

    const toolEvent = event as Extract<typeof event, { type: "tool" }>;
    expect(toolEvent.toolName).toBe("Search");
    expect(
      deriveTraceToolSummary({
        toolName: toolEvent.toolName,
        input: toolEvent.input,
      }),
    ).toMatchObject({ kind: "search", text: "deriveAcpToolPresentation" });
  });
});
